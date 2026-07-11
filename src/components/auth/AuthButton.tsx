"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { IS_SERVER_MODE } from "@/store/marketStore";

export function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!IS_SERVER_MODE || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // 로컬(공통 시장) 모드: 로그인 개념 없음 — 아무것도 표시하지 않는다
  if (!IS_SERVER_MODE) {
    return null;
  }

  if (loading) return null;

  if (email) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[120px] truncate text-xs text-[var(--muted)] sm:inline">
          {email.split("@")[0]}
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
