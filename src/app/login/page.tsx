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
      // 처음 접근하는 아이디면 자동 가입. 서버측 Edge Function 없이 클라이언트에서
      // 바로 signUp 하고, DB 트리거가 game_accounts 매핑을 자동 생성한다.
      // (game_id 중복은 이메일 유일성으로 걸러진다 → signUp 오류로 반환)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: pin,
        options: { data: { game_id: normalizedId } },
      });

      if (signUpError) {
        // 자격 불일치(이미 쓰는 아이디+다른 PIN 등)와 서버 오류를 구분해 안내한다.
        const status = (signUpError as { status?: number }).status;
        setMessage(
          status === 400 || status === 422
            ? "아이디 또는 PIN이 일치하지 않습니다."
            : "서버 문제로 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        );
        setLoading(false);
        return;
      }

      if (signUpData.session) {
        // Confirm email 비활성 시: 가입과 동시에 세션이 생겨 바로 로그인 완료.
        error = null;
      } else {
        // Confirm email 활성 시: 자동확인 트리거로 이미 확인 처리됐으므로 재로그인.
        ({ error } = await supabase.auth.signInWithPassword({
          email,
          password: pin,
        }));
      }
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
