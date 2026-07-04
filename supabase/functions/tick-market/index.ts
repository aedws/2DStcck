// Supabase Edge Function: 시장 tick 진행 (pg_cron이 10초마다 호출, 1틱씩)
// 인증: verify_jwt(anon key Bearer) + 시간 게이트(8초 내 재호출 무시)
// → 별도 시크릿 불필요, 외부에서 호출해도 시장을 빨리 돌릴 수 없음
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  advanceMarket,
  createInitialMarketState,
  parseMarketRow,
} from "../_shared/serverState.ts";

const TICKS_PER_RUN = 1;
/** 마지막 tick 이후 이 시간(ms)이 지나야 다시 진행 */
const MIN_INTERVAL_MS = 8_000;

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

    return Response.json({ ok: true, tick: state.tick });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tick failed";
    return Response.json({ error: message }, { status: 500 });
  }
});
