import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInitialMarketState,
  parseMarketRow,
} from "@/lib/market/serverState";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("market_global")
      .select("*")
      .eq("id", "global")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const initial = createInitialMarketState();
      const payload = {
        id: "global",
        tick: initial.tick,
        market_started_at: initial.marketStartedAt,
        stocks: initial.stocks,
        events: initial.events,
        updated_at: new Date().toISOString(),
      };
      await admin.from("market_global").insert(payload);
      return NextResponse.json(initial);
    }

    return NextResponse.json(parseMarketRow(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load market";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
