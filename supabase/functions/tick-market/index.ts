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
import { applyCashDistributionToStock } from "../_shared/engine.ts";
import {
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "../_shared/trading.ts";
import { STOCK_DEFINITIONS } from "../_shared/stocks.ts";
import {
  calculateCoveredCallDistribution,
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  settleDistributionSchedule,
} from "../_shared/distributions.ts";
import {
  SALARY_AMOUNT,
  SALARY_INTERVAL_DAYS,
} from "../_shared/salary.ts";
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

    const { data: updatedProfile, error: cashError } = await admin
      .from("profiles")
      .update({ cash: result.cash })
      .eq("id", order.user_id)
      .eq("cash", profile.cash)
      .select("cash")
      .maybeSingle();
    if (cashError) throw cashError;
    // 급여·다른 주문과 겹치면 주문을 열어 둔 채 다음 tick에서 다시 시도한다.
    if (!updatedProfile) continue;

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

interface DistributionSummary {
  state: ServerMarketState;
  changed: boolean;
  createdEvents: number;
  paidRecipients: number;
  paidAmount: number;
}

/** 월·분기 지급 이벤트를 원자 RPC로 발행하고 배당락 가격을 시장 상태에 반영한다. */
async function processDistributions(
  admin: SupabaseClient,
  initialState: ServerMarketState,
): Promise<DistributionSummary> {
  const currentSession = initialState.stocks[0]?.daySessionId;
  if (currentSession === undefined) {
    return {
      state: initialState,
      changed: false,
      createdEvents: 0,
      paidRecipients: 0,
      paidAmount: 0,
    };
  }

  const monthly = settleDistributionSchedule(
    initialState.lastMonthlyDistributionSession,
    currentSession,
    COVERED_CALL_INTERVAL_DAYS,
  );
  const quarterly = settleDistributionSchedule(
    initialState.lastQuarterlyDividendSession,
    currentSession,
    QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  );
  const changed =
    monthly.dueSessions.length > 0 || quarterly.dueSessions.length > 0;
  if (!changed) {
    return {
      state: initialState,
      changed: false,
      createdEvents: 0,
      paidRecipients: 0,
      paidAmount: 0,
    };
  }

  let stocks = initialState.stocks;
  let createdEvents = 0;
  let paidRecipients = 0;
  let paidAmount = 0;

  const issue = async (
    stockId: string,
    dueSession: number,
    kind: "covered_call" | "dividend",
    proposedAmountPerShare: number,
  ) => {
    const stock = stocks.find((candidate) => candidate.id === stockId);
    if (!stock || proposedAmountPerShare <= 0) return;
    const basePrice = Math.max(stock.prevDayClose || stock.currentPrice, 100);
    const { data, error } = await admin.rpc("process_stock_distribution", {
      p_stock_id: stock.id,
      p_ticker: stock.ticker,
      p_kind: kind,
      p_due_session: dueSession,
      p_base_price: basePrice,
      p_amount_per_share: proposedAmountPerShare,
    });
    if (error) throw error;

    const row = data?.[0] as
      | {
          event_created?: boolean;
          settled_amount_per_share?: number | string;
          paid_users?: number | string;
          paid_amount?: number | string;
        }
      | undefined;
    const amountPerShare = Number(
      row?.settled_amount_per_share ?? proposedAmountPerShare,
    );
    if (!Number.isSafeInteger(amountPerShare) || amountPerShare <= 0) {
      throw new Error("invalid settled distribution amount");
    }

    if (row?.event_created) createdEvents++;
    paidRecipients += Number(row?.paid_users ?? 0);
    paidAmount += Number(row?.paid_amount ?? 0);
    stocks = stocks.map((candidate) =>
      candidate.id === stock.id
        ? applyCashDistributionToStock(candidate, amountPerShare, Date.now())
        : candidate,
    );
  };

  for (const dueSession of monthly.dueSessions) {
    for (const definition of STOCK_DEFINITIONS.filter(
      (candidate) => (candidate.coveredCallAnnualYield ?? 0) > 0,
    )) {
      const stock = stocks.find((candidate) => candidate.id === definition.id);
      if (!stock) continue;
      const basePrice = Math.max(stock.prevDayClose || stock.currentPrice, 100);
      const proposed = calculateCoveredCallDistribution(
        basePrice,
        definition.coveredCallAnnualYield ?? 0,
        definition.id,
        dueSession,
      );
      await issue(definition.id, dueSession, "covered_call", proposed);
    }
  }

  for (const dueSession of quarterly.dueSessions) {
    for (const definition of STOCK_DEFINITIONS.filter(
      (candidate) => (candidate.quarterlyDividend ?? 0) > 0,
    )) {
      await issue(
        definition.id,
        dueSession,
        "dividend",
        Math.round(definition.quarterlyDividend ?? 0),
      );
    }
  }

  return {
    state: {
      ...initialState,
      stocks,
      lastMonthlyDistributionSession: monthly.lastSession,
      lastQuarterlyDividendSession: quarterly.lastSession,
    },
    changed: true,
    createdEvents,
    paidRecipients,
    paidAmount,
  };
}

/** 밀린 20거래일 고정급을 DB 원장에서 중복 없이 일괄 정산 */
async function payFixedSalaries(
  admin: SupabaseClient,
  currentSession: number | undefined,
): Promise<{ paidUsers: number; paidAmount: number }> {
  if (currentSession === undefined) {
    return { paidUsers: 0, paidAmount: 0 };
  }

  const { data, error } = await admin.rpc("process_fixed_salaries", {
    p_current_session: currentSession,
    p_interval_days: SALARY_INTERVAL_DAYS,
    p_amount: SALARY_AMOUNT,
  });
  if (error) throw error;

  const summary = data?.[0] as
    | { paid_users?: number | string; paid_amount?: number | string }
    | undefined;
  return {
    paidUsers: Number(summary?.paid_users ?? 0),
    paidAmount: Number(summary?.paid_amount ?? 0),
  };
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
    const newSession = state.stocks[0]?.daySessionId;

    const payload = {
      id: "global",
      tick: state.tick,
      market_started_at: state.marketStartedAt,
      last_monthly_distribution_session:
        state.lastMonthlyDistributionSession,
      last_quarterly_dividend_session:
        state.lastQuarterlyDividendSession,
      stocks: state.stocks,
      events: state.events,
      updated_at: new Date().toISOString(),
    };

    // SELECT 기반 시간 게이트를 동시에 통과한 요청 중 하나만 후속 지급·체결을 수행한다.
    if (existing) {
      const { data: saved, error } = await admin
        .from("market_global")
        .update(payload)
        .eq("id", "global")
        .eq("tick", existing.tick)
        .select("tick")
        .maybeSingle();
      if (error) throw error;
      if (!saved) {
        return Response.json({
          ok: true,
          skipped: true,
          reason: "concurrent_tick",
        });
      }
    } else {
      const { error } = await admin.from("market_global").insert(payload);
      if (error?.code === "23505") {
        return Response.json({
          ok: true,
          skipped: true,
          reason: "concurrent_tick",
        });
      }
      if (error) throw error;
    }

    // 지급 이벤트 발행과 현금 입금을 먼저 확정한 뒤 배당락 가격·체크포인트를 저장한다.
    // 지급 뒤 저장이 끊겨도 다음 tick에서 같은 이벤트 금액을 읽어 가격 조정만 재시도한다.
    const distributions = await processDistributions(admin, state);
    state = distributions.state;
    if (distributions.changed) {
      const { data: finalized, error } = await admin
        .from("market_global")
        .update({
          stocks: state.stocks,
          last_monthly_distribution_session:
            state.lastMonthlyDistributionSession,
          last_quarterly_dividend_session:
            state.lastQuarterlyDividendSession,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "global")
        .eq("tick", state.tick)
        .select("tick")
        .maybeSingle();
      if (error) throw error;
      if (!finalized) {
        return Response.json({
          ok: true,
          skipped: true,
          reason: "distribution_finalize_raced",
        });
      }
    }

    // 경계 tick이 중간 실패해도 다음 tick에서 재시도하도록 매번 호출한다 (대부분 no-op).
    const salary = await payFixedSalaries(admin, newSession);

    const filled = await matchOpenOrders(admin, state);

    return Response.json({
      ok: true,
      tick: state.tick,
      filled,
      distributionEvents: distributions.createdEvents,
      distributionPaidRecipients: distributions.paidRecipients,
      distributionPaidAmount: distributions.paidAmount,
      salaryPaidUsers: salary.paidUsers,
      salaryPaidAmount: salary.paidAmount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tick failed";
    return Response.json({ error: message }, { status: 500 });
  }
});
