import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false });
    }

    const [{ data: profile }, { data: holdings }, { data: trades }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("holdings").select("*").eq("user_id", user.id),
        supabase
          .from("trades")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    return NextResponse.json({
      authenticated: true,
      user: { id: user.id, email: user.email },
      profile,
      holdings: (holdings ?? []).map((h) => ({
        stockId: h.stock_id,
        quantity: h.quantity,
        averagePrice: h.average_price,
      })),
      trades: (trades ?? []).map((t) => ({
        id: t.id,
        stockId: t.stock_id,
        ticker: t.ticker,
        type: t.type,
        quantity: t.quantity,
        price: t.price,
        total: t.total,
        timestamp: new Date(t.created_at).getTime(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
