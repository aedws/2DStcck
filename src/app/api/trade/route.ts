import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMarketRow } from "@/lib/market/serverState";
import { getBestAsk, getBestBid } from "@/lib/market/orderBook";
import {
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "@/lib/market/trading";
import type { Holding, StockState } from "@/lib/types/market";

export type OrderType =
  | "buy_market"
  | "sell_market"
  | "buy_current"
  | "sell_current";

interface TradeBody {
  stockId: string;
  quantity: number;
  orderType: OrderType;
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = (await request.json()) as TradeBody;
    const { stockId, quantity, orderType } = body;

    if (!stockId || !orderType || quantity <= 0 || !Number.isInteger(quantity)) {
      return NextResponse.json({ error: "잘못된 주문입니다." }, { status: 400 });
    }

    const admin = createAdminClient();

    const [{ data: marketRow }, { data: profile }, { data: holdingsRows }] =
      await Promise.all([
        admin.from("market_global").select("*").eq("id", "global").single(),
        admin.from("profiles").select("*").eq("id", user.id).single(),
        admin.from("holdings").select("*").eq("user_id", user.id),
      ]);

    if (!marketRow || !profile) {
      return NextResponse.json({ error: "데이터를 불러올 수 없습니다." }, { status: 500 });
    }

    const market = parseMarketRow(marketRow);
    const stock = market.stocks.find((s) => s.id === stockId);
    if (!stock) {
      return NextResponse.json({ error: "종목을 찾을 수 없습니다." }, { status: 404 });
    }

    const price = getOrderPrice(stock, orderType);
    if (price <= 0) {
      return NextResponse.json({ error: "체결 가능한 호가가 없습니다." }, { status: 400 });
    }

    const holdings: Holding[] = (holdingsRows ?? []).map((h) => ({
      stockId: h.stock_id,
      quantity: h.quantity,
      averagePrice: h.average_price,
    }));

    const isBuy = orderType.startsWith("buy");
    const result = isBuy
      ? executeBuy(
          profile.cash,
          holdings,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        )
      : executeSell(
          profile.cash,
          holdings,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        );

    if (!isOrderSuccess(result)) {
      return NextResponse.json({ success: false, message: result.message });
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

    return NextResponse.json({
      success: true,
      message: `${labels[orderType]} (${price.toLocaleString()}원)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "주문 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
