// Supabase Edge Function: 주문 체결 (로그인 유저 JWT 필요)
// 배포: supabase functions deploy trade
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseMarketRow } from "../_shared/serverState.ts";
import { getBestAsk, getBestBid } from "../_shared/orderBook.ts";
import {
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "../_shared/trading.ts";
import type { Holding, StockState } from "../_shared/types.ts";
import { SESSION_DURATION_MS } from "../_shared/constants.ts";
import {
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  settleDistributionSchedule,
} from "../_shared/distributions.ts";

type OrderType =
  | "buy_market"
  | "sell_market"
  | "buy_current"
  | "sell_current"
  | "buy_limit"
  | "sell_limit";

interface TradeBody {
  stockId: string;
  quantity: number;
  orderType: OrderType;
  /** 지정가 주문 가격 */
  limitPrice?: number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getOrderPrice(stock: StockState, orderType: OrderType): number {
  switch (orderType) {
    case "buy_market":
      return getBestAsk(stock.orderBook);
    case "sell_market":
      return getBestBid(stock.orderBook);
    case "buy_current":
    case "sell_current":
      return stock.currentPrice;
    default:
      return stock.currentPrice;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 유저 확인 (anon key + 유저 JWT)
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      },
    );

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return json({ error: "로그인이 필요합니다." }, 401);
    }

    const body = (await req.json()) as TradeBody;
    const { stockId, quantity, orderType, limitPrice } = body;

    if (!stockId || !orderType || quantity <= 0 || !Number.isInteger(quantity)) {
      return json({ error: "잘못된 주문입니다." }, 400);
    }

    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const [{ data: marketRow }, { data: profile }, { data: holdingsRows }] =
      await Promise.all([
        admin.from("market_global").select("*").eq("id", "global").single(),
        admin.from("profiles").select("*").eq("id", user.id).single(),
        admin.from("holdings").select("*").eq("user_id", user.id),
      ]);

    if (!marketRow || !profile) {
      return json({ error: "데이터를 불러올 수 없습니다." }, 500);
    }

    const market = parseMarketRow(marketRow);
    const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
    const monthlyPending = settleDistributionSchedule(
      market.lastMonthlyDistributionSession,
      currentSession,
      COVERED_CALL_INTERVAL_DAYS,
    ).dueSessions.length > 0;
    const quarterlyPending = settleDistributionSchedule(
      market.lastQuarterlyDividendSession,
      currentSession,
      QUARTERLY_DIVIDEND_INTERVAL_DAYS,
    ).dueSessions.length > 0;
    if (monthlyPending || quarterlyPending) {
      return json(
        {
          success: false,
          message: "배당 기준 수량을 정산 중입니다. 잠시 후 다시 시도해 주세요.",
        },
        409,
      );
    }
    const stock = market.stocks.find((s) => s.id === stockId);
    if (!stock) {
      return json({ error: "종목을 찾을 수 없습니다." }, 404);
    }

    // 지수·선물은 직접 거래 불가 (ETF로 간접 투자)
    if (stock.sector === "선물" || stock.sector === "지수") {
      return json(
        { error: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요." },
        400,
      );
    }

    // ── 지정가 주문: 대기 등록 (가격 도달 시 서버 틱에서 자동 체결) ──
    if (orderType === "buy_limit" || orderType === "sell_limit") {
      if (
        !limitPrice ||
        limitPrice <= 0 ||
        !Number.isInteger(limitPrice)
      ) {
        return json({ error: "지정가를 올바르게 입력해 주세요." }, 400);
      }
      const side = orderType === "buy_limit" ? "buy" : "sell";

      if (side === "buy" && limitPrice * quantity > profile.cash) {
        return json({ success: false, message: "보유 현금이 부족합니다." });
      }
      if (side === "sell") {
        const held = (holdingsRows ?? []).find(
          (h: { stock_id: string }) => h.stock_id === stockId,
        );
        if (!held || held.quantity < quantity) {
          return json({ success: false, message: "보유 수량이 부족합니다." });
        }
      }

      const { error: insertError } = await admin.from("orders").insert({
        user_id: user.id,
        stock_id: stockId,
        ticker: stock.ticker,
        side,
        price: limitPrice,
        quantity,
      });
      if (insertError) throw insertError;

      return json({
        success: true,
        pending: true,
        message: `지정가 ${side === "buy" ? "매수" : "매도"} 대기 ($${(limitPrice / 100).toFixed(2)} × ${quantity}주)`,
      });
    }

    const price = getOrderPrice(stock, orderType);
    if (price <= 0) {
      return json({ error: "체결 가능한 호가가 없습니다." }, 400);
    }

    const holdings: Holding[] = (holdingsRows ?? []).map(
      (h: { stock_id: string; quantity: number; average_price: number }) => ({
        stockId: h.stock_id,
        quantity: h.quantity,
        averagePrice: h.average_price,
      }),
    );

    const isBuy = orderType.startsWith("buy");
    const result = isBuy
      ? executeBuy(profile.cash, holdings, stockId, stock.ticker, price, quantity, Date.now())
      : executeSell(profile.cash, holdings, stockId, stock.ticker, price, quantity, Date.now());

    if (!isOrderSuccess(result)) {
      return json({ success: false, message: result.message });
    }

    // 읽은 뒤 급여/다른 주문이 잔액을 바꿨다면 오래된 절대값으로 덮어쓰지 않는다.
    const { data: updatedProfile, error: cashError } = await admin
      .from("profiles")
      .update({ cash: result.cash })
      .eq("id", user.id)
      .eq("cash", profile.cash)
      .select("cash")
      .maybeSingle();
    if (cashError) throw cashError;
    if (!updatedProfile) {
      return json({
        success: false,
        message: "잔액이 변경되었습니다. 주문을 다시 시도해 주세요.",
      });
    }

    const existingIds = new Set(holdings.map((h) => h.stockId));
    const newIds = new Set(result.holdings.map((h) => h.stockId));
    const removed = [...existingIds].filter((id) => !newIds.has(id));

    for (const id of removed) {
      await admin
        .from("holdings")
        .delete()
        .eq("user_id", user.id)
        .eq("stock_id", id);
    }

    for (const h of result.holdings) {
      await admin.from("holdings").upsert({
        user_id: user.id,
        stock_id: h.stockId,
        quantity: h.quantity,
        average_price: h.averagePrice,
      });
    }

    await admin.from("trades").insert({
      user_id: user.id,
      stock_id: result.trade.stockId,
      ticker: result.trade.ticker,
      type: result.trade.type,
      quantity: result.trade.quantity,
      price: result.trade.price,
      total: result.trade.total,
    });

    const labels: Record<OrderType, string> = {
      buy_market: "시장가 매수",
      sell_market: "시장가 매도",
      buy_current: "현재가 매수",
      sell_current: "현재가 매도",
      buy_limit: "지정가 매수",
      sell_limit: "지정가 매도",
    };

    return json({
      success: true,
      message: `${labels[orderType]} ($${(price / 100).toFixed(2)})`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "주문 실패";
    return json({ error: message }, 500);
  }
});
