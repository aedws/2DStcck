"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/market/engine";
import {
  autoPickNumbers,
  LOTTERY_MAX_PER_WINDOW,
  LOTTERY_TICKET_PRICE,
  LOTTO_MAX_NUMBER,
  LOTTO_PICK,
  PENSION_TICKET_PRICE,
  type LotteryPrize,
} from "@/lib/market/lottery";
import { useMarketStore } from "@/store/marketStore";

const TIER_STYLE: Record<string, string> = {
  lose: "text-[var(--muted)]",
  refund: "text-sky-400",
  small: "text-emerald-400",
  mid: "text-emerald-400",
  big: "text-amber-400",
  jackpot: "text-amber-300",
};

type Tab = "lotto" | "pension";

interface LottoView {
  picks: number[];
  winning: number[];
  matches: number;
  prize: LotteryPrize;
}

export default function LotteryPage() {
  const cash = useMarketStore((s) => s.cash);
  const buyLottoTicket = useMarketStore((s) => s.buyLottoTicket);
  const buyPensionTicket = useMarketStore((s) => s.buyPensionTicket);
  const getLotteryTicketsLeft = useMarketStore((s) => s.getLotteryTicketsLeft);
  const pensionAnnuities = useMarketStore((s) => s.pensionAnnuities);
  const saveCloud = useMarketStore((s) => s.saveCloud);

  const [tab, setTab] = useState<Tab>("lotto");
  const [picks, setPicks] = useState<number[]>([]);
  const [lottoResult, setLottoResult] = useState<LottoView | null>(null);
  const [pensionResult, setPensionResult] = useState<LotteryPrize | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [popKey, setPopKey] = useState(0);

  const left = getLotteryTicketsLeft();
  const numbers = useMemo(
    () => Array.from({ length: LOTTO_MAX_NUMBER }, (_, i) => i + 1),
    [],
  );

  function toggleNumber(n: number) {
    setErrorMsg(null);
    setPicks((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= LOTTO_PICK) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  }

  function quickPick() {
    setErrorMsg(null);
    setPicks(autoPickNumbers(Math.floor(Date.now() ^ (Math.random() * 1e9))));
  }

  function drawLottoTicket() {
    if (picks.length !== LOTTO_PICK) {
      setErrorMsg(`숫자 ${LOTTO_PICK}개를 골라주세요.`);
      return;
    }
    const r = buyLottoTicket(picks);
    setPopKey((k) => k + 1);
    if (!r.success) {
      setErrorMsg(r.message);
      return;
    }
    setErrorMsg(null);
    if (r.prize && r.winning && r.matches !== undefined) {
      setLottoResult({
        picks: r.picks ?? picks,
        winning: r.winning,
        matches: r.matches,
        prize: r.prize,
      });
      void saveCloud();
    }
  }

  function drawPensionTicket() {
    const r = buyPensionTicket();
    setPopKey((k) => k + 1);
    if (!r.success) {
      setErrorMsg(r.message);
      return;
    }
    setErrorMsg(null);
    if (r.prize) {
      setPensionResult(r.prize);
      void saveCloud();
    }
  }

  const canBuyLotto =
    left > 0 && cash >= LOTTERY_TICKET_PRICE && picks.length === LOTTO_PICK;
  const canBuyPension = left > 0 && cash >= PENSION_TICKET_PRICE;

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">🎟️ 복권</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          5거래일마다 일반·연금 합쳐 최대 {LOTTERY_MAX_PER_WINDOW}장. 사면 바로
          결과가 나옵니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="mb-4 flex rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1 text-sm font-semibold">
        <button
          onClick={() => {
            setTab("lotto");
            setErrorMsg(null);
          }}
          className={`flex-1 rounded-xl py-2 transition ${
            tab === "lotto"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)]"
          }`}
        >
          일반 복권
        </button>
        <button
          onClick={() => {
            setTab("pension");
            setErrorMsg(null);
          }}
          className={`flex-1 rounded-xl py-2 transition ${
            tab === "pension"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)]"
          }`}
        >
          연금 복권
        </button>
      </div>

      <div className="mb-3 flex items-center justify-center gap-4 text-sm">
        <span className="text-[var(--muted)]">
          남은 티켓{" "}
          <span className="font-semibold text-[var(--foreground)]">{left}</span>
          /{LOTTERY_MAX_PER_WINDOW}
        </span>
        <span className="text-[var(--muted)]">보유 현금 {formatPrice(cash)}</span>
      </div>

      {errorMsg && (
        <p className="mb-3 rounded-xl bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-400">
          {errorMsg}
        </p>
      )}

      {tab === "lotto" ? (
        <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--background)] p-5">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">
              1~{LOTTO_MAX_NUMBER} 중 {LOTTO_PICK}개 선택
            </span>
            <span className="font-semibold">
              {picks.length}/{LOTTO_PICK}
            </span>
          </div>

          {/* 선택된 번호 */}
          <div className="mb-3 flex min-h-[2.5rem] items-center justify-center gap-2">
            {picks.length > 0 ? (
              picks.map((n) => (
                <span
                  key={n}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white"
                >
                  {n}
                </span>
              ))
            ) : (
              <span className="text-xs text-[var(--muted)]">
                아래에서 번호를 고르세요
              </span>
            )}
          </div>

          {/* 번호 그리드 */}
          <div className="grid grid-cols-9 gap-1.5">
            {numbers.map((n) => {
              const on = picks.includes(n);
              return (
                <button
                  key={n}
                  onClick={() => toggleNumber(n)}
                  className={`aspect-square rounded-full text-xs font-semibold transition ${
                    on
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--border)]"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={quickPick}
              className="flex-1 rounded-2xl border border-[var(--border)] py-3 text-sm font-semibold transition hover:bg-[var(--surface)]"
            >
              🎲 자동 (퀵픽)
            </button>
            <button
              onClick={() => setPicks([])}
              className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-semibold transition hover:bg-[var(--surface)]"
            >
              지우기
            </button>
          </div>

          <button
            onClick={drawLottoTicket}
            disabled={!canBuyLotto}
            className="mt-3 w-full rounded-2xl bg-[var(--accent)] py-4 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {left <= 0
              ? "이번 회차 소진 — 다음 회차를 기다리세요"
              : cash < LOTTERY_TICKET_PRICE
                ? "현금 부족"
                : `구매 (${formatPrice(LOTTERY_TICKET_PRICE)})`}
          </button>

          {/* 결과 */}
          {lottoResult && (
            <div
              key={popKey}
              className="toast-in mt-4 rounded-2xl border border-dashed border-[var(--border)] p-4 text-center"
            >
              <div className="mb-2 flex items-center justify-center gap-1.5">
                {lottoResult.winning.map((n) => (
                  <span
                    key={n}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      lottoResult.picks.includes(n)
                        ? "bg-amber-400 text-black"
                        : "bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                  >
                    {n}
                  </span>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)]">
                당첨 번호 · {lottoResult.matches}개 일치
              </p>
              <p
                className={`mt-1 text-xl font-bold ${TIER_STYLE[lottoResult.prize.tier] ?? ""}`}
              >
                {lottoResult.prize.tier === "lose" ? "🙈 낙첨" : "🎉 "}
                {lottoResult.prize.label}
              </p>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-[var(--muted)]">
            등수: 5개 일치 → 1등 잭팟 · 4개 → 2등 · 3개 → 3등 · 2개 → 4등. 추첨은
            구매 순간 즉석으로 정해집니다. 어떤 번호를 골라도 확률은 같아요.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--background)] p-5">
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center">
            <p className="text-3xl">🏦</p>
            <p className="mt-2 text-sm font-semibold">연금 복권</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              당첨되면 한 번에 큰돈 대신 <b>5거래일마다 정기 지급</b>되는 연금을
              받습니다.
            </p>
            <ul className="mx-auto mt-3 max-w-[16rem] space-y-1 text-left text-[11px] text-[var(--muted)]">
              <li>· 1등 $500 × 40회 (총 $20,000)</li>
              <li>· 2등 $100 × 20회 (총 $2,000)</li>
              <li>· 3등 $120 일시금</li>
            </ul>
          </div>

          <button
            onClick={drawPensionTicket}
            disabled={!canBuyPension}
            className="mt-4 w-full rounded-2xl bg-[var(--accent)] py-4 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {left <= 0
              ? "이번 회차 소진 — 다음 회차를 기다리세요"
              : cash < PENSION_TICKET_PRICE
                ? "현금 부족"
                : `구매 (${formatPrice(PENSION_TICKET_PRICE)})`}
          </button>

          {pensionResult && (
            <div
              key={popKey}
              className="toast-in mt-4 rounded-2xl border border-dashed border-[var(--border)] p-4 text-center"
            >
              <span className="text-4xl">
                {pensionResult.tier === "lose" ? "🙈" : "🎊"}
              </span>
              <p
                className={`mt-2 text-xl font-bold ${TIER_STYLE[pensionResult.tier] ?? ""}`}
              >
                {pensionResult.label}
              </p>
            </div>
          )}

          {/* 진행 중인 연금 */}
          {pensionAnnuities.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                수령 중인 연금
              </p>
              <div className="space-y-2">
                {pensionAnnuities.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{a.label}</span>
                      <span className="text-[var(--muted)]">
                        {a.paidPeriods}/{a.totalPeriods}회
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{
                          width: `${(a.paidPeriods / a.totalPeriods) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-[var(--muted)]">
            연금은 5거래일마다 자동 입금됩니다. 앱을 오래 켜두지 않아도 다음
            접속 때 밀린 회차가 한꺼번에 정산돼요.
          </p>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--muted)]">
        기대값은 티켓가보다 낮습니다. 재미로 즐기고, 자산은 투자로 키우세요.
      </p>
    </div>
  );
}
