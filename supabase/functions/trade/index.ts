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

type OrderType = "buy_market" | "sell_market" | "buy_current" | "sell_current";

interface TradeBody {
  stockId: string;
  quantity: number;
  orderType: OrderType;
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
    const { stockId, quantity, orderType } = body;

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
    const stock = market.stocks.find((s) => s.id === stockId);
    if (!stock) {
      return json({ error: "종목을 찾을 수 없습니다." }, 404);
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

    await admin.from("profiles").update({ cash: result.cash }).eq("id", user.id);

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
    };

    return json({
      success: true,
      message: `${labels[orderType]} (${price.toLocaleString()}원)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "주문 실패";
    return json({ error: message }, 500);
  }
});
