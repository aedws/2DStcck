import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  advanceMarket,
  createInitialMarketState,
  parseMarketRow,
} from "@/lib/market/serverState";

const TICKS_PER_RUN = 10;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("market_global")
      .select("*")
      .eq("id", "global")
      .maybeSingle();

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

    return NextResponse.json({
      ok: true,
      tick: state.tick,
      ticksAdvanced: TICKS_PER_RUN,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tick failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
