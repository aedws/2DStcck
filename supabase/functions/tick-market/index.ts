// Supabase Edge Function: 시장 tick 진행 + 지정가 주문 자동 체결 (pg_cron 10초마다)
// 인증: verify_jwt(anon key Bearer) + 시간 게이트(8초 내 재호출 무시)
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  advanceMarket,
  createInitialMarketState,
  parseMarketRow,
  type ServerMarketState,
} from "../_shared/serverState.ts";
import {
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "../_shared/trading.ts";
import type { Holding } from "../_shared/types.ts";

const TICKS_PER_RUN = 1;
const MIN_INTERVAL_MS = 8_000;

interface OrderRow {
  id: string;
  user_id: string;
  stock_id: string;
  ticker: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
}

/** 지정가 대기 주문 중 가격 도달분 자동 체결 */
async function matchOpenOrders(
  admin: SupabaseClient,
  state: ServerMarketState,
): Promise<number> {
  const { data: openOrders } = await admin
    .from("orders")
    .select("id, user_id, stock_id, ticker, side, price, quantity")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(100);

  if (!openOrders || openOrders.length === 0) return 0;

  let filled = 0;
  for (const order of openOrders as OrderRow[]) {
    const stock = state.stocks.find((s) => s.id === order.stock_id);
    if (!stock) continue;

    const crossed =
      order.side === "buy"
        ? stock.currentPrice <= order.price
        : stock.currentPrice >= order.price;
    if (!crossed) continue;

    // 지정가 이상/이하로 유리하게 체결
    const fillPrice = stock.currentPrice;

    const [{ data: profile }, { data: holdingsRows }] = await Promise.all([
      admin.from("profiles").select("*").eq("id", order.user_id).single(),
      admin.from("holdings").select("*").eq("user_id", order.user_id),
    ]);
    if (!profile) continue;

    const holdings: Holding[] = (holdingsRows ?? []).map(
      (h: { stock_id: string; quantity: number; average_price: number }) => ({
        stockId: h.stock_id,
        quantity: h.quantity,
        averagePrice: h.average_price,
      }),
    );

    const result =
      order.side === "buy"
        ? executeBuy(profile.cash, holdings, order.stock_id, order.ticker, fillPrice, order.quantity, Date.now())
        : executeSell(profile.cash, holdings, order.stock_id, order.ticker, fillPrice, order.quantity, Date.now());

    if (!isOrderSuccess(result)) {
      // 잔고 부족 등 → 주문 자동 취소
      await admin
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", order.id)
        .eq("status", "open");
      continue;
    }

    await admin
      .from("profiles")
      .update({ cash: result.cash })
      .eq("id", order.user_id);

    const newIds = new Set(result.holdings.map((h) => h.stockId));
    for (const h of holdings) {
      if (!newIds.has(h.stockId)) {
        await admin
          .from("holdings")
          .delete()
          .eq("user_id", order.user_id)
          .eq("stock_id", h.stockId);
      }
    }
    for (const h of result.holdings) {
      await admin.from("holdings").upsert({
        user_id: order.user_id,
        stock_id: h.stockId,
        quantity: h.quantity,
        average_price: h.averagePrice,
      });
    }

    await admin.from("trades").insert({
      user_id: order.user_id,
      stock_id: result.trade.stockId,
      ticker: result.trade.ticker,
      type: result.trade.type,
      quantity: result.trade.quantity,
      price: result.trade.price,
      total: result.trade.total,
    });

    await admin
      .from("orders")
      .update({
        status: "filled",
        filled_at: new Date().toISOString(),
        filled_price: fillPrice,
      })
      .eq("id", order.id)
      .eq("status", "open");

    filled++;
  }
  return filled;
}

Deno.serve(async (_req) => {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: existing } = await admin
      .from("market_global")
      .select("*")
      .eq("id", "global")
      .maybeSingle();

    if (existing) {
      const elapsed = Date.now() - new Date(existing.updated_at).getTime();
      if (elapsed < MIN_INTERVAL_MS) {
        return Response.json({
          ok: true,
          skipped: true,
          tick: existing.tick,
          nextInMs: MIN_INTERVAL_MS - elapsed,
        });
      }
    }

    let state = existing
      ? parseMarketRow(existing)
      : createInitialMarketState();

    state = advanceMarket(state, TICKS_PER_RUN);

    const payload = {
      id: "global",
      tick: state.tick,
      market_started_at: state.marketStartedAt,
      stocks: state.stocks,
      events: state.events,
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from("market_global").upsert(payload);
    if (error) throw error;

    const filled = await matchOpenOrders(admin, state);

    return Response.json({ ok: true, tick: state.tick, filled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tick failed";
    return Response.json({ error: message }, { status: 500 });
  }
});
