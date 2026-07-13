"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToastStore } from "@/store/toastStore";

export function AuthButton() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setGameId(
        (data.user?.user_metadata?.game_id as string | undefined) ??
          data.user?.email?.split("@")[0] ??
          null,
      );
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setGameId(
        (session?.user?.user_metadata?.game_id as string | undefined) ??
          session?.user?.email?.split("@")[0] ??
          null,
      );
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return null;

  if (gameId) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[120px] truncate text-xs text-[var(--muted)] sm:inline">
          {gameId}
        </span>
        <button
          type="button"
          disabled={signingOut}
          onClick={async () => {
            if (signingOut) return;
            setSigningOut(true);
            const supabase = createClient();
            const { error } = await supabase.auth.signOut();
            if (error) {
              setSigningOut(false);
              useToastStore.getState().push("로그아웃에 실패했습니다. 다시 시도해 주세요.", "error");
              return;
            }
            window.location.reload();
          }}
          className="whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
        >
          {signingOut ? "로그아웃 중…" : "↪ 로그아웃"}
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
    >
      로그인
    </Link>
  );
}
