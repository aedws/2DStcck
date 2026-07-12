import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function internalEmail(gameId: string): string {
  return `game.${gameId}@2dstock.local`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await request.json();
    const gameId = String(body.gameId ?? "").trim().toLowerCase();
    const pin = String(body.pin ?? "");

    if (!/^[a-z0-9_]{3,20}$/.test(gameId)) {
      return json({ error: "invalid_game_id" }, 400);
    }
    if (!/^\d{6}$/.test(pin)) {
      return json({ error: "invalid_pin" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: existing, error: lookupError } = await admin
      .from("game_accounts")
      .select("user_id")
      .eq("game_id", gameId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing) return json({ error: "invalid_credentials" }, 409);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail(gameId),
      password: pin,
      email_confirm: true,
      user_metadata: { game_id: gameId },
    });

    if (createError || !created.user) {
      if (createError?.message.toLowerCase().includes("already")) {
        return json({ error: "invalid_credentials" }, 409);
      }
      throw createError ?? new Error("user_create_failed");
    }

    const { error: accountError } = await admin.from("game_accounts").insert({
      game_id: gameId,
      user_id: created.user.id,
    });

    if (accountError) {
      await admin.auth.admin.deleteUser(created.user.id);
      if (accountError.code === "23505") {
        return json({ error: "invalid_credentials" }, 409);
      }
      throw accountError;
    }

    return json({ created: true, email: internalEmail(gameId) }, 201);
  } catch (error) {
    console.error("game-account", error);
    return json({ error: "account_create_failed" }, 500);
  }
});
