"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import { formatPrice } from "@/lib/market/engine";
import { MODAL_PRIORITY, useModalSlot } from "@/components/layout/ModalQueue";

const CONFETTI = ["🎉", "✨", "💸", "📈", "🎊", "💰", "🥳", "⭐"];

/**
 * 첫 매수 축하 연출 — 보유 0에서 첫 종목을 담는 순간(라이브 전환)에 한 번만
 * 뜬다. 판단 직후 즉각적인 보상감을 주고, 매매의 손익 루프를 한 문장으로 짚어
 * 다음 한 걸음으로 이어준다. 이미 거래가 있던 유저는 소급 연출 없이 플래그만
 * 조용히 세팅해 다음 안내(레이어2)가 정상 진행되게 한다.
 */
export function FirstTradeCelebration() {
  const trades = useMarketStore((s) => s.trades);
  const onboarded = useSettingsStore((s) => s.onboarded);
  const celebrated = useSettingsStore((s) => s.firstTradeCelebrated);
  const setCelebrated = useSettingsStore((s) => s.setFirstTradeCelebrated);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const prevCount = useRef<number | null>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !onboarded) return;
    const count = trades.length;
    // 마운트 첫 관측: 이미 거래가 있으면 소급 연출 없이 본 것으로 처리한다.
    if (prevCount.current === null) {
      prevCount.current = count;
      if (count >= 1 && !celebrated) setCelebrated(true);
      return;
    }
    if (prevCount.current === 0 && count >= 1 && !celebrated) {
      setOpen(true);
    }
    prevCount.current = count;
  }, [mounted, onboarded, trades.length, celebrated, setCelebrated]);

  const show = useModalSlot(
    "first-trade",
    MODAL_PRIORITY.firstTrade,
    mounted && open,
  );
  if (!show || !mounted || !open) return null;

  const firstBuy = trades.find((t) => t.type === "buy") ?? trades[0];

  const close = () => {
    setOpen(false);
    setCelebrated(true);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4">
      {/* 색종이 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="confetti-piece text-xl"
            style={{
              left: `${(i * 5.5 + 4) % 100}%`,
              animationDelay: `${(i % 6) * 0.09}s`,
            }}
          >
            {CONFETTI[i % CONFETTI.length]}
          </span>
        ))}
      </div>

      <div className="celebrate-pop relative w-full max-w-sm rounded-3xl border border-[var(--accent)]/30 bg-[var(--surface)] p-6 text-center shadow-2xl">
        <div className="text-5xl">🎉</div>
        <h2 className="mt-3 text-xl font-black">첫 거래 완료!</h2>
        {firstBuy && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--foreground)]">
              {firstBuy.ticker}
            </span>{" "}
            {firstBuy.quantity.toLocaleString("ko-KR", {
              maximumFractionDigits: 4,
            })}
            주 · {formatPrice(firstBuy.total)}
          </p>
        )}
        <p className="mt-4 text-sm leading-relaxed text-[var(--foreground)]">
          이제 이 회사의 <b>주주</b>예요. 가격이 오르면 그만큼 내 자산도
          늘어납니다. 시세는 실시간으로 움직이니, 오르면 팔아 차익을 실현해
          보세요.
        </p>
        <div className="mt-4 rounded-xl bg-[var(--background)] p-3 text-left">
          <p className="text-[11px] font-semibold text-[var(--accent)]">
            🛟 잃어도 괜찮아요
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
            20거래일마다 고정급 $10,000이 들어옵니다. 부담 없이 여러 종목을
            눌러보며 감을 잡아보세요.
          </p>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            계속 둘러보기
          </button>
          <Link
            href="/portfolio"
            onClick={close}
            className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            내 자산 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
