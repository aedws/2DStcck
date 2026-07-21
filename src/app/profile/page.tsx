"use client";

import Link from "next/link";
import { AuthButton } from "@/components/auth/AuthButton";
import { formatPrice } from "@/lib/market/engine";
import {
  PLAYER_TITLES,
  buildTradingStats,
  getPlayerTitle,
  koreaDateKey,
  unlockedPlayerTitles,
} from "@/lib/player/playerProfile";
import { useMarketStore } from "@/store/marketStore";
import {
  SEASON_REWARDS,
  getSeasonReward,
} from "@/lib/player/seasonRewards";
import { computePrestige } from "@/lib/player/prestige";
import { countFavoriteRelationships } from "@/lib/market/characterProgress";
import { INVESTMENT_SEASON_TIERS } from "@/lib/market/investmentSeasons";
import { getRoomItem, getRoomTheme } from "@/data/roomItems";

export default function ProfilePage() {
  const attendance = useMarketStore((state) => state.attendance);
  const selectedTitleId = useMarketStore((state) => state.selectedTitleId);
  const claimAttendance = useMarketStore((state) => state.claimDailyAttendance);
  const selectTitle = useMarketStore((state) => state.selectPlayerTitle);
  const unlockedSeasonRewardIds = useMarketStore((state) => state.unlockedSeasonRewardIds);
  const selectedSeasonFrameId = useMarketStore((state) => state.selectedSeasonFrameId);
  const selectSeasonFrame = useMarketStore((state) => state.selectSeasonFrame);
  const trades = useMarketStore((state) => state.trades);
  const initialCash = useMarketStore((state) => state.initialCash);
  const investmentSeason = useMarketStore((state) => state.investmentSeason);
  const investmentMastery = useMarketStore((state) => state.investmentMastery);
  const achievements = useMarketStore((state) => state.achievements);
  const characterProgress = useMarketStore((state) => state.characterProgress);
  const reputation = useMarketStore((state) => state.reputation);
  const ownedLuxuries = useMarketStore((state) => state.ownedLuxuries);
  const myRoomItems = useMarketStore((state) => state.myRoomItems);
  const myRoomTheme = useMarketStore((state) => state.myRoomTheme);
  const netWorth = useMarketStore((state) => state.getTotalAssets());
  const stats = buildTradingStats(trades);
  const prestige = computePrestige({
    achievements,
    characterProgress,
    unlockedSeasonRewardIds,
    investmentMastery,
    investmentSeason,
    ownedLuxuries,
    reputation,
  });
  const bestSeasonTier =
    prestige.bestSeasonTierIndex >= 0
      ? INVESTMENT_SEASON_TIERS[prestige.bestSeasonTierIndex]
      : null;
  const titleContext = {
    tradeCount: stats.tradeCount,
    attendanceStreak: attendance.streak,
    attendanceTotalDays: attendance.totalDays,
    netWorth,
    initialCash,
    seasonState: investmentSeason,
    mastery: investmentMastery,
    favoriteCount: countFavoriteRelationships(characterProgress),
  };
  const unlocked = new Set(
    unlockedPlayerTitles(titleContext).map((title) => title.id),
  );
  const selectedTitle = getPlayerTitle(selectedTitleId);
  const selectedFrame = getSeasonReward(selectedSeasonFrameId);
  const claimedToday = attendance.lastClaimDate === koreaDateKey();
  const roomTheme = getRoomTheme(myRoomTheme);
  const roomShowcase = myRoomItems
    .map((placed) => getRoomItem(placed.itemId))
    .filter((item) => item?.category === "프리미엄")
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className={`mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border p-5 ring-1 ${selectedFrame?.frameClass ?? "border-[var(--border)] bg-[var(--surface)] ring-transparent"}`}>
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">
            {selectedTitle.emoji} {selectedTitle.name}
          </p>
          <h1 className="mt-1 text-2xl font-black">투자자 프로필</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            출석 기록, 거래 성과와 랭킹에 표시할 대표 칭호를 관리합니다.
          </p>
        </div>
        <div className="min-w-40">
          <AuthButton wide />
        </div>
      </div>

      <section className="mb-6 rounded-3xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-fuchsia-300">대표 마이룸</p>
            <h2 className="mt-1 text-lg font-bold">
              {roomTheme.emoji} {roomTheme.name}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              가구 {myRoomItems.length}개 · 프리미엄 컬렉션 {roomShowcase.length}개
            </p>
            {roomShowcase.length > 0 && (
              <p className="mt-2 text-2xl">{roomShowcase.map((item) => item?.emoji).join(" ")}</p>
            )}
          </div>
          <Link
            href="/myroom"
            className="rounded-xl bg-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white"
          >
            방 꾸미기·포토 모드 →
          </Link>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-violet-400/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-violet-300">
              수집·경쟁 종합 지표
            </p>
            <h2 className="mt-1 text-lg font-bold">✨ 프레스티지 점수</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              캐릭터 호감도·업적·시즌 티어·숙련도·과시를 합산합니다. 자산(현금)은 이
              점수의 연료일 뿐, 대표 성취는 이 점수로 드러납니다.
            </p>
          </div>
          <p className="text-4xl font-black tabular-nums text-violet-200">
            {prestige.total.toLocaleString()}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <PrestigePart label="캐릭터" value={prestige.characters} sub={`유대 ${prestige.bondedCharacters}명`} />
          <PrestigePart label="업적" value={prestige.achievements} />
          <PrestigePart label="시즌" value={prestige.season} sub={bestSeasonTier ? `최고 ${bestSeasonTier.emoji}${bestSeasonTier.name}` : "미달성"} />
          <PrestigePart label="숙련도" value={prestige.mastery} />
          <PrestigePart label="과시" value={prestige.luxury} />
          <PrestigePart label="평판" value={prestige.reputation} />
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-400/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--muted)]">매일 00:00 KST 초기화</p>
            <h2 className="mt-1 text-lg font-bold">📅 일일 출석</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              현재 {attendance.streak}일 연속 · 누적 {attendance.totalDays}일
            </p>
          </div>
          <button
            type="button"
            disabled={claimedToday}
            onClick={claimAttendance}
            className="min-h-12 rounded-xl bg-emerald-400 px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
          >
            {claimedToday ? "오늘 출석 완료" : "출석 보상 받기"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, index) => (
            <div
              key={index}
              className={`rounded-xl py-2 text-center text-xs font-bold ${index < Math.min(7, attendance.streak) ? "bg-emerald-400 text-black" : "bg-[var(--surface)] text-[var(--muted)]"}`}
            >
              {index + 1}일
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">거래 통계</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="총 체결" value={`${stats.tradeCount}회`} />
          <Stat label="진입" value={`${stats.buyCount}회`} />
          <Stat label="청산" value={`${stats.sellCount}회`} />
          <Stat label="승리 청산" value={`${stats.winningCloses}/${stats.closeCount}`} />
          <Stat label="승률" value={`${stats.winRate.toFixed(1)}%`} />
          <Stat label="누적 거래대금" value={formatPrice(stats.turnover)} />
        </div>
        <div className="mt-3 rounded-2xl bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--muted)]">현물·공매도 기준 추정 실현손익</p>
          <p className={`mt-1 text-xl font-black ${stats.realizedPnl >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
            {stats.realizedPnl >= 0 ? "+" : ""}{formatPrice(stats.realizedPnl)}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">시즌 영구 보상</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              시즌 티어를 처음 달성하면 해당 티어까지의 인장·프로필 프레임이 영구 해금됩니다.
            </p>
          </div>
          <p className="text-xs font-semibold text-violet-300">
            {unlockedSeasonRewardIds.length}/{SEASON_REWARDS.length} 해금
          </p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => selectSeasonFrame(null)}
            className={`rounded-2xl border p-4 text-left ${selectedSeasonFrameId === null ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface)]"}`}
          >
            <p className="font-bold">○ 기본 프로필 프레임</p>
            <p className="mt-2 text-xs text-[var(--muted)]">시즌 장식을 사용하지 않습니다.</p>
          </button>
          {SEASON_REWARDS.map((reward) => {
            const isUnlocked = unlockedSeasonRewardIds.includes(reward.id);
            const selected = selectedSeasonFrameId === reward.id;
            const count = investmentSeason.history.filter(
              (season) => season.tierId === reward.tierId,
            ).length;
            return (
              <button
                key={reward.id}
                type="button"
                disabled={!isUnlocked}
                onClick={() => selectSeasonFrame(reward.id)}
                className={`rounded-2xl border p-4 text-left ring-1 transition ${selected ? reward.frameClass : "border-[var(--border)] bg-[var(--surface)] ring-transparent"} disabled:opacity-40`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{reward.emoji} {reward.name}</p>
                  {isUnlocked && <span className="text-[10px] text-[var(--muted)]">최근 기록 {count}회</span>}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                  {isUnlocked ? reward.description : `🔒 ${reward.tierId.toUpperCase()} 시즌 달성`}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">칭호 선택</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          선택한 칭호는 다음 10분 랭킹 갱신 때 프로필에 반영됩니다.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLAYER_TITLES.map((title) => {
            const isUnlocked = unlocked.has(title.id);
            const selected = selectedTitleId === title.id;
            return (
              <button
                key={title.id}
                type="button"
                disabled={!isUnlocked}
                onClick={() => selectTitle(title.id)}
                className={`rounded-2xl border p-4 text-left transition ${selected ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface)]"} disabled:opacity-45`}
              >
                <p className="font-bold">{title.emoji} {title.name}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {isUnlocked ? title.condition : `🔒 ${title.condition}`}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function PrestigePart({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--background)]/40 p-3 text-center">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums text-violet-200">
        {value.toLocaleString()}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}
