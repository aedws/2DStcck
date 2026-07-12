"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { IS_CLOUD_ENABLED } from "@/store/marketStore";

export function AuthButton() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!IS_CLOUD_ENABLED || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

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

  // 클라우드 미설정(순수 로컬): 계정 개념 없음 — 아무것도 표시하지 않는다
  if (!IS_CLOUD_ENABLED) {
    return null;
  }

  if (loading) return null;

  if (gameId) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[120px] truncate text-xs text-[var(--muted)] sm:inline">
          {gameId}
        </span>
        <button
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.reload();
          }}
          className="rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          로그아웃
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
