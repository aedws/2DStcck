"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToastStore } from "@/store/toastStore";

export function AuthButton({ wide = false }: { wide?: boolean }) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setGameId(
        (data.session?.user?.user_metadata?.game_id as string | undefined) ??
          data.session?.user?.email?.split("@")[0] ??
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

  if (loading) {
    return (
      <span
        aria-label="계정 정보 확인 중"
        className={`${wide ? "flex w-full" : "inline-flex"} min-h-11 animate-pulse items-center justify-center rounded-xl bg-[var(--border)]/50 px-4 text-xs text-[var(--muted)]`}
      >
        확인 중…
      </span>
    );
  }

  if (gameId) {
    return (
      <div className={`flex items-center gap-2 ${wide ? "w-full" : ""}`}>
        <span className={`${wide ? "block" : "hidden sm:inline"} min-w-0 max-w-[120px] flex-1 truncate text-xs text-[var(--muted)]`}>
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
          className={`${wide ? "min-w-28" : ""} relative z-10 min-h-11 touch-manipulation whitespace-nowrap rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold hover:border-[var(--accent)] disabled:cursor-wait disabled:opacity-60`}
        >
          {signingOut ? "로그아웃 중…" : "↪ 로그아웃"}
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className={`${wide ? "w-full" : ""} relative z-10 flex min-h-11 touch-manipulation items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-xs font-semibold text-white`}
    >
      로그인
    </Link>
  );
}
