"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { formatPrice } from "@/lib/market/engine";
import { toastResult } from "@/store/toastStore";
import {
  ROOM_DOOR_X,
  ROOM_DOOR_Y,
  ROOM_ITEMS,
  ROOM_SELL_RATIO,
  ROOM_THEMES,
  ROOM_WALL_ROWS,
  getRoomItem,
  getRoomTheme,
  isBathRow,
  isWallRow,
  nextRoomExpansion,
  roomDimsForLevel,
  roomMaxItemsForLevel,
  type RoomItemCategory,
  type RoomItemDefinition,
} from "@/data/roomItems";

const CATEGORY_ORDER: RoomItemCategory[] = ["가구", "욕실", "장식", "펫", "프리미엄"];

/** 날마다 바뀌는 숙소 주민 — 문으로 들어와 돌아다니다 나간다. */
const RESIDENT_EMOJIS = ["🐰", "🐱", "🦊", "🐻", "🐹", "🐧"];
const RESIDENT_STEP_MS = 850;

interface ResidentState {
  x: number;
  y: number;
  visible: boolean;
  facing: 1 | -1;
  bathing: boolean;
}

function RoomResident({
  cols,
  rows,
  occupiedCells,
  cellText,
}: {
  cols: number;
  rows: number;
  occupiedCells: Set<string>;
  cellText: string;
}) {
  const [state, setState] = useState<ResidentState>({
    x: ROOM_DOOR_X,
    y: ROOM_WALL_ROWS,
    visible: false,
    facing: 1,
    bathing: false,
  });
  const emoji = useMemo(
    () =>
      RESIDENT_EMOJIS[
        Math.floor(Date.now() / 86_400_000) % RESIDENT_EMOJIS.length
      ],
    [],
  );

  useEffect(() => {
    // 간단한 상태기계: 입장 → 랜덤 산책(가구 칸 회피) → 문으로 복귀 → 퇴장·대기.
    let x = ROOM_DOOR_X;
    let y = ROOM_WALL_ROWS;
    let facing: 1 | -1 = 1;
    let visible = false;
    let leaving = false;
    let steps = 0;
    let waitTicks = 2;

    const free = (nx: number, ny: number) =>
      nx >= 0 &&
      nx < cols &&
      ny >= ROOM_WALL_ROWS &&
      ny < rows &&
      !occupiedCells.has(`${nx}:${ny}`);
    const doorDistance = (nx: number, ny: number) =>
      Math.abs(nx - ROOM_DOOR_X) + (ny - ROOM_WALL_ROWS);

    const id = window.setInterval(() => {
      if (!visible) {
        if (waitTicks > 0) {
          waitTicks--;
          return;
        }
        visible = true;
        leaving = false;
        steps = 0;
        x = ROOM_DOOR_X;
        y = ROOM_WALL_ROWS;
        facing = 1;
        setState({ x, y, visible, facing, bathing: false });
        return;
      }
      if (leaving && x === ROOM_DOOR_X && y === ROOM_WALL_ROWS) {
        visible = false;
        waitTicks = 6 + Math.floor(Math.random() * 8);
        setState((prev) => ({ ...prev, visible: false }));
        return;
      }
      let candidates = (
        [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ] as const
      ).filter(([nx, ny]) => free(nx, ny));
      if (leaving) {
        const closer = candidates.filter(
          ([nx, ny]) => doorDistance(nx, ny) < doorDistance(x, y),
        );
        if (closer.length > 0) candidates = closer;
      }
      if (candidates.length > 0 && (leaving || Math.random() > 0.18)) {
        const [nx, ny] =
          candidates[Math.floor(Math.random() * candidates.length)];
        if (nx !== x) facing = nx > x ? 1 : -1;
        x = nx;
        y = ny;
      }
      steps++;
      if (!leaving && steps > 22 + Math.random() * 18) leaving = true;
      setState({
        x,
        y,
        visible: true,
        facing,
        bathing: isBathRow(y, rows),
      });
    }, RESIDENT_STEP_MS);
    return () => window.clearInterval(id);
  }, [cols, rows, occupiedCells]);

  if (!state.visible) return null;
  return (
    <div
      className={`pointer-events-none absolute z-10 flex items-center justify-center ${cellText}`}
      style={{
        left: `${(state.x / cols) * 100}%`,
        top: `${(state.y / rows) * 100}%`,
        width: `${100 / cols}%`,
        height: `${100 / rows}%`,
        transition: `left ${RESIDENT_STEP_MS}ms linear, top ${RESIDENT_STEP_MS}ms linear`,
      }}
    >
      {state.bathing && (
        <span className="absolute -top-1 right-0 text-[8px] sm:text-[10px]">♨️</span>
      )}
      <span style={{ transform: `scaleX(${state.facing})` }}>{emoji}</span>
    </div>
  );
}

type RoomMode =
  | { type: "idle" }
  | { type: "placing"; item: RoomItemDefinition }
  | { type: "moving"; index: number }
  | { type: "selected"; index: number };

export default function MyRoomPage() {
  const cash = useMarketStore((s) => s.cash);
  const myRoomItems = useMarketStore((s) => s.myRoomItems);
  const myRoomLevel = useMarketStore((s) => s.myRoomLevel);
  const myRoomTheme = useMarketStore((s) => s.myRoomTheme);
  const myRoomOwnedThemes = useMarketStore((s) => s.myRoomOwnedThemes);
  const buyRoomItem = useMarketStore((s) => s.buyRoomItem);
  const moveRoomItem = useMarketStore((s) => s.moveRoomItem);
  const sellRoomItem = useMarketStore((s) => s.sellRoomItem);
  const expandMyRoom = useMarketStore((s) => s.expandMyRoom);
  const buyRoomTheme = useMarketStore((s) => s.buyRoomTheme);
  const selectRoomTheme = useMarketStore((s) => s.selectRoomTheme);

  const [mode, setMode] = useState<RoomMode>({ type: "idle" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    myRoomItems.forEach((placed, index) => map.set(`${placed.x}:${placed.y}`, index));
    return map;
  }, [myRoomItems]);
  const occupiedCells = useMemo(() => new Set(cellMap.keys()), [cellMap]);

  const roomValue = useMemo(
    () => myRoomItems.reduce((sum, placed) => sum + placed.paidPrice, 0),
    [myRoomItems],
  );

  if (!mounted) return null;

  const dims = roomDimsForLevel(myRoomLevel);
  const maxItems = roomMaxItemsForLevel(myRoomLevel);
  const expansion = nextRoomExpansion(myRoomLevel);
  const theme = getRoomTheme(myRoomTheme);
  const palette = theme.palette;
  const darkRoomPalette = theme.id === "midnight";
  const roomLabelColor = darkRoomPalette ? "#f5f3ff" : "#4a044e";
  const roomLabelBackground = darkRoomPalette
    ? "rgba(15, 23, 42, 0.9)"
    : "rgba(255, 255, 255, 0.9)";
  const roomGridColor = darkRoomPalette
    ? "rgba(221, 214, 254, 0.2)"
    : `${palette.frame}40`;
  // 격자가 커질수록 타일·이모지를 작게 그려 전체 구도가 한눈에 들어오게 한다.
  const cellText =
    dims.cols >= 26
      ? "text-[10px] sm:text-sm"
      : dims.cols >= 20
        ? "text-xs sm:text-base"
        : "text-sm sm:text-lg";

  const placingItem =
    mode.type === "placing"
      ? mode.item
      : mode.type === "moving"
        ? getRoomItem(myRoomItems[mode.index]?.itemId ?? "")
        : undefined;

  function cellPlaceable(x: number, y: number): boolean {
    if (!placingItem) return false;
    if (cellMap.has(`${x}:${y}`)) return false;
    if (x === ROOM_DOOR_X && y === ROOM_DOOR_Y) return false;
    return placingItem.wallOnly ? isWallRow(y) : !isWallRow(y);
  }

  function onCellClick(x: number, y: number) {
    const occupiedIndex = cellMap.get(`${x}:${y}`);
    if (mode.type === "placing") {
      if (!cellPlaceable(x, y)) return;
      const result = buyRoomItem(mode.item.id, x, y);
      toastResult(result);
      if (result.success) setMode({ type: "idle" });
      return;
    }
    if (mode.type === "moving") {
      if (!cellPlaceable(x, y)) return;
      const result = moveRoomItem(mode.index, x, y);
      toastResult(result);
      if (result.success) setMode({ type: "idle" });
      return;
    }
    if (occupiedIndex !== undefined) {
      setMode(
        mode.type === "selected" && mode.index === occupiedIndex
          ? { type: "idle" }
          : { type: "selected", index: occupiedIndex },
      );
    } else {
      setMode({ type: "idle" });
    }
  }

  const selected =
    mode.type === "selected" ? myRoomItems[mode.index] : undefined;
  const selectedDef = selected ? getRoomItem(selected.itemId) : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">마이룸</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            숙소를 꾸미고 아래층 욕장까지 채워 보세요. 되팔면 구매가의{" "}
            {Math.round(ROOM_SELL_RATIO * 100)}%만 돌려받습니다.
          </p>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          <p>
            보유 현금 <span className="font-semibold text-[var(--foreground)]">{formatPrice(cash)}</span>
          </p>
          <p className="mt-0.5">
            꾸미기 누적 <span className="font-semibold text-[var(--foreground)]">{formatPrice(roomValue)}</span> ·{" "}
            {myRoomItems.length}/{maxItems}개 · {dims.cols}×{dims.rows}
          </p>
        </div>
      </div>

      {/* 방 — 테마 팔레트로 벽지·바닥·욕실 타일을 통째로 칠한다 */}
      <div
        className="myroom-color-canvas overflow-hidden rounded-3xl border-4 p-1.5 shadow-lg sm:p-2"
        style={{ borderColor: palette.frame, background: `${palette.frame}55` }}
      >
        <div
          className="relative grid overflow-hidden rounded-2xl"
          style={{ gridTemplateColumns: `repeat(${dims.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: dims.rows }).flatMap((_, y) =>
            Array.from({ length: dims.cols }).map((_, x) => {
              const key = `${x}:${y}`;
              const occupiedIndex = cellMap.get(key);
              const placed =
                occupiedIndex !== undefined ? myRoomItems[occupiedIndex] : undefined;
              const def = placed ? getRoomItem(placed.itemId) : undefined;
              const wall = isWallRow(y);
              const bath = !wall && isBathRow(y, dims.rows);
              const targetable = placingItem ? cellPlaceable(x, y) : false;
              const isSelected =
                mode.type === "selected" && occupiedIndex === mode.index;
              const isMovingSource =
                mode.type === "moving" && occupiedIndex === mode.index;
              const background = wall
                ? `linear-gradient(180deg, ${palette.wallFrom}, ${palette.wallTo})`
                : bath
                  ? (x + y) % 2 === 0
                    ? palette.bathA
                    : palette.bathB
                  : (x + y) % 2 === 0
                    ? palette.floorA
                    : palette.floorB;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => onCellClick(x, y)}
                  aria-label={
                    def ? `${def.name} (${x + 1}, ${y + 1})` : `빈 칸 (${x + 1}, ${y + 1})`
                  }
                  style={{
                    background,
                    borderColor: roomGridColor,
                    ...(bath && y === dims.rows - 3
                      ? { borderTopWidth: 2, borderTopColor: palette.divider }
                      : {}),
                    ...(wall && y === 1
                      ? { borderBottomWidth: 2, borderBottomColor: `${palette.divider}88` }
                      : {}),
                  }}
                  className={`relative flex aspect-square items-center justify-center border transition ${cellText} ${
                    placingItem
                      ? targetable
                        ? "cursor-pointer ring-2 ring-inset ring-emerald-400/80 hover:brightness-110"
                        : "cursor-not-allowed opacity-50"
                      : def
                        ? "cursor-pointer hover:brightness-95"
                        : "cursor-default"
                  } ${isSelected ? "ring-2 ring-inset ring-sky-500" : ""} ${
                    isMovingSource ? "opacity-40" : ""
                  }`}
                >
                  {/* 뒷벽 출입문 — 항상 비워 두는 고정 구조물 */}
                  {x === ROOM_DOOR_X && y === ROOM_DOOR_Y && (
                    <span
                      aria-hidden
                      className="absolute inset-x-[14%] bottom-0 top-[12%] rounded-t-[45%]"
                      style={{
                        background: "linear-gradient(180deg, #92400e, #78350f)",
                        boxShadow:
                          "inset 0 0 0 2px #f59e0b99, 0 1px 4px #11182766",
                      }}
                    >
                      <span
                        className="absolute right-[18%] top-1/2 h-[3px] w-[3px] rounded-full sm:h-1 sm:w-1"
                        style={{ background: "#fcd34d" }}
                      />
                    </span>
                  )}
                  {/* 문 앞 발매트 */}
                  {x === ROOM_DOOR_X && y === ROOM_WALL_ROWS && !def && (
                    <span
                      aria-hidden
                      className="absolute inset-x-[16%] inset-y-[28%] rounded-[30%] opacity-75"
                      style={{ background: palette.divider }}
                    />
                  )}
                  {def && (
                    <span className={def.category === "프리미엄" ? "drop-shadow-[0_0_6px_rgba(250,204,21,0.9)]" : ""}>
                      {def.emoji}
                    </span>
                  )}
                </button>
              );
            }),
          )}

          {/* 구역 라벨 — 공간의 용도를 드러낸다 */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 z-10 rounded-md border px-1.5 py-0.5 text-[8px] font-bold shadow-sm sm:text-[10px]"
            style={{
              top: `calc(${(ROOM_WALL_ROWS / dims.rows) * 100}% + 2px)`,
              color: roomLabelColor,
              background: roomLabelBackground,
              borderColor: `${palette.divider}88`,
            }}
          >
            🛏️ 숙소
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 z-10 rounded-md border px-1.5 py-0.5 text-[8px] font-bold shadow-sm sm:text-[10px]"
            style={{
              top: `calc(${((dims.rows - 3) / dims.rows) * 100}% + 2px)`,
              color: roomLabelColor,
              background: roomLabelBackground,
              borderColor: `${palette.divider}88`,
            }}
          >
            ♨️ 욕장
          </span>

          {/* 숙소 주민 — 문으로 들어와 산책하고 탕도 들른다 */}
          <RoomResident
            cols={dims.cols}
            rows={dims.rows}
            occupiedCells={occupiedCells}
            cellText={cellText}
          />
        </div>
      </div>

      {/* 조작 안내·선택 액션 */}
      {mode.type === "placing" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          <span>
            {mode.item.emoji} <b>{mode.item.name}</b> ({formatPrice(mode.item.price)}) —{" "}
            {mode.item.wallOnly ? "벽" : "바닥"}의 초록 칸을 눌러 배치하세요.
          </span>
          <button
            type="button"
            onClick={() => setMode({ type: "idle" })}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
          >
            취소
          </button>
        </div>
      )}
      {mode.type === "moving" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm">
          <span>이동할 칸을 눌러 주세요.</span>
          <button
            type="button"
            onClick={() => setMode({ type: "idle" })}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
          >
            취소
          </button>
        </div>
      )}
      {selected && selectedDef && mode.type === "selected" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
          <span>
            {selectedDef.emoji} <b>{selectedDef.name}</b>
            <span className="ml-2 text-xs text-[var(--muted)]">
              구매가 {formatPrice(selected.paidPrice)}
            </span>
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setMode({ type: "moving", index: mode.index })}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
            >
              이동
            </button>
            <button
              type="button"
              onClick={() => {
                toastResult(sellRoomItem(mode.index));
                setMode({ type: "idle" });
              }}
              className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-400"
            >
              되팔기 ({formatPrice(Math.round(selected.paidPrice * ROOM_SELL_RATIO))})
            </button>
          </div>
        </div>
      )}
      {mode.type === "idle" && myRoomItems.length === 0 && (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center text-sm text-[var(--muted)]">
          아직 텅 빈 숙소예요. 아래 카탈로그에서 첫 가구를 들여 보세요.
        </p>
      )}

      {/* 숙소 테마(도배) */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">
          숙소 테마
          <span className="ml-2 text-[11px] font-normal text-[var(--muted)]">
            벽지·바닥·욕실 타일을 통째로 바꿉니다
          </span>
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ROOM_THEMES.map((entry) => {
            const owned = myRoomOwnedThemes.includes(entry.id);
            const active = theme.id === entry.id;
            const affordable = entry.price <= cash;
            return (
              <li
                key={entry.id}
                className={`rounded-2xl border p-3 transition ${
                  active
                    ? "border-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border"
                    style={{ borderColor: entry.palette.frame }}
                    aria-hidden
                  >
                    <span
                      className="block h-1/2 w-full"
                      style={{
                        background: `linear-gradient(180deg, ${entry.palette.wallFrom}, ${entry.palette.wallTo})`,
                      }}
                    />
                    <span className="flex h-1/2 w-full">
                      <span className="h-full w-1/2" style={{ background: entry.palette.floorB }} />
                      <span className="h-full w-1/2" style={{ background: entry.palette.bathB }} />
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {entry.emoji} {entry.name}
                    </p>
                    <p className="truncate text-[10px] text-[var(--muted)]">
                      {entry.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={active || (!owned && !affordable)}
                  onClick={() =>
                    toastResult(owned ? selectRoomTheme(entry.id) : buyRoomTheme(entry.id))
                  }
                  className={`mt-2 w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-40 ${
                    active
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : owned
                        ? "border border-[var(--border)]"
                        : "bg-[var(--accent)] text-white"
                  }`}
                >
                  {active
                    ? "적용 중"
                    : owned
                      ? "적용하기"
                      : affordable
                        ? `${formatPrice(entry.price)}`
                        : "현금 부족"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 방 크기 확장권 */}
      {expansion ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">
              🏗️ 확장권 · {expansion.name}
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                {dims.cols}×{dims.rows} → {expansion.cols}×{expansion.rows} · 가구 한도 +30
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              확장권은 1회성 소비이며 환불되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            disabled={expansion.price > cash}
            onClick={() => toastResult(expandMyRoom())}
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white transition disabled:opacity-40"
          >
            {formatPrice(expansion.price)}에 확장
          </button>
        </div>
      ) : (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center text-xs text-[var(--muted)]">
          🏰 최대 크기의 방입니다 — 대저택 홀에 오신 것을 환영합니다.
        </p>
      )}

      {/* 카탈로그 */}
      <div className="space-y-4">
        {CATEGORY_ORDER.map((category) => {
          const items = ROOM_ITEMS.filter((item) => item.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="mb-2 text-sm font-semibold">
                {category}
                {category === "프리미엄" && (
                  <span className="ml-2 text-[11px] font-normal text-amber-400">
                    큰손 전용 컬렉션
                  </span>
                )}
              </h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((item) => {
                  const affordable = item.price <= cash;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{item.emoji}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {item.name}
                            {item.wallOnly && (
                              <span className="ml-1.5 rounded bg-pink-500/15 px-1 py-0.5 text-[10px] font-medium text-pink-400">
                                벽걸이
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-[var(--muted)]">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold tabular-nums">
                          {formatPrice(item.price)}
                        </span>
                        <button
                          type="button"
                          disabled={!affordable}
                          onClick={() => setMode({ type: "placing", item })}
                          className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition disabled:opacity-40"
                        >
                          {affordable ? "배치하기" : "현금 부족"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="pb-4 text-center text-[11px] leading-relaxed text-[var(--muted)]">
        마이룸 가구·테마는 순자산·시즌·랭킹에 합산되지 않는 순수 소비 공간입니다.
        로그인 계정은 방 배치·테마가 클라우드에 함께 저장됩니다.
      </p>
    </div>
  );
}
