"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [gameId, setGameId] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const normalizedId = gameId.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedId)) {
      setMessage("아이디는 영문 소문자·숫자·밑줄 3~20자로 입력해 주세요.");
      setLoading(false);
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setMessage("PIN은 숫자 6자리로 입력해 주세요.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const email = `game.${normalizedId}@2dstock.local`;
    let { error } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });

    if (error) {
      // 처음 접근하는 아이디면 자동 가입. 이메일 발송·Edge Function·"Confirm email"
      // 설정에 의존하지 않도록 서버 DB 함수로 계정을 만든다(비밀번호는 bcrypt 해시).
      // 이미 존재하는 아이디면 'exists'만 반환하고 그대로 로그인으로 PIN을 검증한다.
      const { error: regError } = await supabase.rpc("register_game_account", {
        p_game_id: normalizedId,
        p_pin: pin,
      });

      if (regError) {
        setMessage("서버 문제로 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
        return;
      }

      // 신규 생성이든 기존 계정이든 표준 로그인으로 검증한다.
      ({ error } = await supabase.auth.signInWithPassword({ email, password: pin }));
    }

    if (error) setMessage("아이디 또는 PIN이 일치하지 않습니다.");
    else router.push("/");
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">2DStock 로그인</h1>
      <p className="mb-8 text-sm text-[var(--muted)]">
        아이디와 PIN만으로 접속하면 보유 종목과 매매내역이 저장됩니다.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">게임 아이디</label>
          <input
            type="text"
            required
            autoComplete="username"
            minLength={3}
            maxLength={20}
            value={gameId}
            onChange={(e) =>
              setGameId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
            placeholder="영문·숫자·밑줄"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">PIN</label>
          <input
            type="password"
            required
            inputMode="numeric"
            autoComplete="current-password"
            minLength={6}
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="숫자 6자리"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "확인 중..." : "시작하기"}
        </button>
      </form>

      <div className="mt-5 rounded-xl bg-[var(--surface)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
        처음 입력한 아이디는 자동으로 가입됩니다. 이메일을 받지 않으므로 아이디나
        PIN을 잊으면 복구할 수 없습니다.
      </div>

      {message && (
        <p className="mt-4 text-center text-sm text-[var(--muted)]">{message}</p>
      )}
    </div>
  );
}
