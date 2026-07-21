"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  isRoomBathPassageCell,
  isWallRow,
  nextRoomExpansion,
  roomDimsForLevel,
  roomBathDoorColumns,
  roomBathStartRow,
  roomMaxItemsForLevel,
  roomItemCells,
  roomItemLayer,
  roomItemSize,
  isValidRoomPlacement,
  type RoomItemCategory,
  type RoomItemDefinition,
  type RoomRotation,
  type PlacedRoomItem,
} from "@/data/roomItems";
import { CHARACTERS, getCharacterById } from "@/data/characters";
import { getCharacterProgress } from "@/lib/market/characterProgress";
import {
  ROOM_RESIDENT_AFFINITY,
  ROOM_RESIDENT_LIMIT,
} from "@/lib/player/roomResidents";

const CATEGORY_ORDER: RoomItemCategory[] = ["가구", "욕실", "장식", "펫", "프리미엄"];

/** 날마다 바뀌는 숙소 주민 — 문으로 들어와 돌아다니다 나간다. */
const RESIDENT_EMOJIS = ["🐰", "🐱", "🦊", "🐻", "🐹", "🐧"];
const RESIDENT_STEP_MS = 850;

const ROOM_SETS = [
  { name: "온천 휴양", emoji: "♨️", ids: ["bath", "duck", "towel", "sauna"] },
  { name: "아늑한 숙소", emoji: "🛏️", ids: ["bed", "lamp", "plant", "cozy-rug"] },
  { name: "투자광", emoji: "📈", ids: ["tv", "clock", "bookshelf", "trading-desk"] },
  { name: "대저택", emoji: "🏰", ids: ["fountain", "private-theater", "indoor-pool", "rooftop-garden"] },
] as const;

const DEFAULT_INTERACTIONS: Record<RoomItemCategory, string> = {
  가구: "가구를 살펴보며 잠시 쉬었습니다.",
  욕실: "따뜻한 김이 피어오릅니다. ♨️",
  장식: "방의 분위기가 한층 살아납니다. ✨",
  펫: "반갑게 다가와 쓰다듬어 달라고 합니다. 💕",
  프리미엄: "압도적인 재력이 방 안에서 빛납니다. 💎",
};

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
  visitor,
  permanent = false,
  startDelayTicks = 2,
}: {
  cols: number;
  rows: number;
  occupiedCells: Set<string>;
  cellText: string;
  visitor?: { emoji: string; name: string };
  permanent?: boolean;
  startDelayTicks?: number;
}) {
  const [state, setState] = useState<ResidentState>({
    x: ROOM_DOOR_X,
    y: ROOM_WALL_ROWS,
    visible: false,
    facing: 1,
    bathing: false,
  });
  const dailyEmoji = useMemo(
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
    let waitTicks = permanent ? startDelayTicks : 2;
    const bathStart = roomBathStartRow(rows);
    const bathDoorColumns = roomBathDoorColumns(cols);
    const crossesBathWall = (fromY: number, toY: number, atX: number) =>
      ((fromY === bathStart - 1 && toY === bathStart) ||
        (fromY === bathStart && toY === bathStart - 1)) &&
      !bathDoorColumns.includes(atX);

    const free = (nx: number, ny: number) =>
      nx >= 0 &&
      nx < cols &&
      ny >= ROOM_WALL_ROWS &&
      ny < rows &&
      !crossesBathWall(y, ny, nx) &&
      !occupiedCells.has(`${nx}:${ny}`);
    const doorDistance = (nx: number, ny: number) => {
      if (ny < bathStart) {
        return Math.abs(nx - ROOM_DOOR_X) + (ny - ROOM_WALL_ROWS);
      }
      const bathDoorX = bathDoorColumns.reduce((nearest, candidate) =>
        Math.abs(candidate - nx) < Math.abs(nearest - nx) ? candidate : nearest,
      );
      return (
        Math.abs(nx - bathDoorX) +
        (ny - bathStart + 1) +
        Math.abs(bathDoorX - ROOM_DOOR_X) +
        (bathStart - 1 - ROOM_WALL_ROWS)
      );
    };

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
      if (!permanent && !leaving && steps > 22 + Math.random() * 18) leaving = true;
      setState({
        x,
        y,
        visible: true,
        facing,
        bathing: isBathRow(y, rows),
      });
    }, RESIDENT_STEP_MS);
    return () => window.clearInterval(id);
  }, [cols, rows, occupiedCells, permanent, startDelayTicks]);

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
      {visitor && (
        <span className="absolute -top-4 whitespace-nowrap rounded bg-black/70 px-1 text-[7px] font-semibold text-white sm:text-[9px]">
          {visitor.name}
        </span>
      )}
      <span style={{ transform: `scaleX(${state.facing})` }}>{visitor?.emoji ?? dailyEmoji}</span>
    </div>
  );
}

type RoomMode =
  | { type: "idle" }
  | { type: "placing"; item: RoomItemDefinition; rotation: RoomRotation }
  | { type: "moving"; index: number }
  | { type: "selected"; index: number };

export default function MyRoomPage() {
  const cash = useMarketStore((s) => s.cash);
  const userId = useMarketStore((s) => s.userId);
  const holdings = useMarketStore((s) => s.holdings);
  const stocks = useMarketStore((s) => s.stocks);
  const characterProgress = useMarketStore((s) => s.characterProgress);
  const myRoomItems = useMarketStore((s) => s.myRoomItems);
  const myRoomLevel = useMarketStore((s) => s.myRoomLevel);
  const myRoomTheme = useMarketStore((s) => s.myRoomTheme);
  const myRoomOwnedThemes = useMarketStore((s) => s.myRoomOwnedThemes);
  const myRoomResidentCharacterIds = useMarketStore(
    (s) => s.myRoomResidentCharacterIds,
  );
  const buyRoomItem = useMarketStore((s) => s.buyRoomItem);
  const moveRoomItem = useMarketStore((s) => s.moveRoomItem);
  const sellRoomItem = useMarketStore((s) => s.sellRoomItem);
  const rotateRoomItem = useMarketStore((s) => s.rotateRoomItem);
  const applyRoomLayout = useMarketStore((s) => s.applyRoomLayout);
  const expandMyRoom = useMarketStore((s) => s.expandMyRoom);
  const buyRoomTheme = useMarketStore((s) => s.buyRoomTheme);
  const selectRoomTheme = useMarketStore((s) => s.selectRoomTheme);
  const inviteRoomResident = useMarketStore((s) => s.inviteRoomResident);
  const dismissRoomResident = useMarketStore((s) => s.dismissRoomResident);

  const [mode, setMode] = useState<RoomMode>({ type: "idle" });
  const [mounted, setMounted] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [interaction, setInteraction] = useState<string | null>(null);
  const undoLayoutRef = useRef<PlacedRoomItem[] | null>(null);
  useEffect(() => setMounted(true), []);

  const cellMap = useMemo(() => {
    const map = new Map<string, number[]>();
    myRoomItems.forEach((placed, index) => {
      const item = getRoomItem(placed.itemId);
      if (!item) return;
      for (const cell of roomItemCells(item, placed.x, placed.y, placed.rotation ?? 0)) {
        const key = `${cell.x}:${cell.y}`;
        map.set(key, [...(map.get(key) ?? []), index]);
      }
    });
    return map;
  }, [myRoomItems]);
  const occupiedCells = useMemo(() => {
    const cells = new Set<string>();
    myRoomItems.forEach((placed) => {
      const item = getRoomItem(placed.itemId);
      if (!item || roomItemLayer(item) === "floor" || roomItemLayer(item) === "surface") return;
      roomItemCells(item, placed.x, placed.y, placed.rotation ?? 0).forEach((cell) =>
        cells.add(`${cell.x}:${cell.y}`),
      );
    });
    return cells;
  }, [myRoomItems]);

  const roomValue = useMemo(
    () => myRoomItems.reduce((sum, placed) => sum + placed.paidPrice, 0),
    [myRoomItems],
  );

  const visitor = useMemo(() => {
    const favorite = holdings
      .map((holding) => {
        const stock = stocks.find((entry) => entry.id === holding.stockId);
        return { stock, value: stock ? holding.quantity * stock.currentPrice : 0 };
      })
      .sort((a, b) => b.value - a.value)[0]?.stock;
    const character = getCharacterById(favorite?.ceoId);
    return character ? { emoji: character.emoji, name: character.name } : undefined;
  }, [holdings, stocks]);

  const residentCharacters = useMemo(
    () =>
      myRoomResidentCharacterIds
        .map((id) => getCharacterById(id))
        .filter((character): character is NonNullable<typeof character> => Boolean(character)),
    [myRoomResidentCharacterIds],
  );
  const residentCandidates = useMemo(
    () =>
      CHARACTERS.map((character) => ({
        character,
        affinity: getCharacterProgress(characterProgress, character.id).affinity,
        invited: myRoomResidentCharacterIds.includes(character.id),
      }))
        .filter(
          (entry) => entry.invited || entry.affinity >= ROOM_RESIDENT_AFFINITY,
        )
        .sort(
          (a, b) =>
            Number(b.invited) - Number(a.invited) || b.affinity - a.affinity,
        ),
    [characterProgress, myRoomResidentCharacterIds],
  );

  const ownedItemIds = useMemo(
    () => new Set(myRoomItems.map((item) => item.itemId)),
    [myRoomItems],
  );
  const atmosphere = useMemo(() => {
    const score: Record<string, number> = { 아늑함: 0, 고급: 0, 온천: 0, 자연: 0, 투자광: 0 };
    for (const placed of myRoomItems) {
      const item = getRoomItem(placed.itemId);
      if (!item) continue;
      if (item.category === "가구" || item.category === "펫") score.아늑함 += 1;
      if (item.category === "욕실") score.온천 += 1;
      if (item.category === "프리미엄") score.고급 += 2;
      if (["plant", "flower", "rooftop-garden"].includes(item.id)) score.자연 += 2;
      if (["tv", "clock", "bookshelf", "trading-desk"].includes(item.id)) score.투자광 += 2;
      for (const tag of item.tags ?? []) if (tag in score) score[tag] += 1;
    }
    return Object.entries(score).sort((a, b) => b[1] - a[1]);
  }, [myRoomItems]);
  const marketMood = useMemo(() => {
    const benchmark = stocks.find((stock) => stock.id === "vnasdaq") ?? stocks[0];
    if (!benchmark || benchmark.initialPrice <= 0) return "시세 연결 대기 중";
    const change = ((benchmark.currentPrice - benchmark.initialPrice) / benchmark.initialPrice) * 100;
    return change >= 2
      ? "📈 강세장 · TV와 거래실이 활기찹니다."
      : change <= -2
        ? "📉 약세장 · 주민들이 시세판을 걱정스럽게 봅니다."
        : "➖ 보합장 · 숙소가 차분합니다.";
  }, [stocks]);

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
  const bathStart = roomBathStartRow(dims.rows);
  const bathDoorColumns = roomBathDoorColumns(dims.cols);
  const bathDoorLeft = (bathDoorColumns[0] / dims.cols) * 100;
  const bathDoorWidth = (bathDoorColumns.length / dims.cols) * 100;
  // 격자가 커질수록 타일·이모지를 작게 그려 전체 구도가 한눈에 들어오게 한다.
  const cellText =
    dims.cols >= 26
      ? "text-[10px] sm:text-sm"
      : dims.cols >= 20
        ? "text-xs sm:text-base"
        : "text-sm sm:text-lg";
  const hour = new Date().getHours();
  const night = hour < 6 || hour >= 19;

  const placingItem =
    mode.type === "placing"
      ? mode.item
      : mode.type === "moving"
        ? getRoomItem(myRoomItems[mode.index]?.itemId ?? "")
        : undefined;
  const placingRotation: RoomRotation =
    mode.type === "placing"
      ? mode.rotation
      : mode.type === "moving"
        ? myRoomItems[mode.index]?.rotation ?? 0
        : 0;

  function cellPlaceable(x: number, y: number): boolean {
    if (!placingItem) return false;
    if (!isValidRoomPlacement(placingItem, x, y, myRoomLevel, placingRotation)) return false;
    const targetKeys = new Set(
      roomItemCells(placingItem, x, y, placingRotation).map((cell) => `${cell.x}:${cell.y}`),
    );
    const movingIndex = mode.type === "moving" ? mode.index : -1;
    let supported = !placingItem.requiresSupport;
    for (let index = 0; index < myRoomItems.length; index++) {
      if (index === movingIndex) continue;
      const placed = myRoomItems[index];
      const item = getRoomItem(placed.itemId);
      if (!item) continue;
      const overlaps = roomItemCells(item, placed.x, placed.y, placed.rotation ?? 0).some(
        (cell) => targetKeys.has(`${cell.x}:${cell.y}`),
      );
      if (!overlaps) continue;
      if (roomItemLayer(item) === roomItemLayer(placingItem)) return false;
      if (placingItem.requiresSupport && roomItemLayer(item) === "furniture") supported = true;
    }
    return supported;
  }

  function onCellClick(x: number, y: number) {
    const occupiedIndexes = cellMap.get(`${x}:${y}`) ?? [];
    const occupiedIndex = occupiedIndexes[occupiedIndexes.length - 1];
    if (mode.type === "placing") {
      if (!cellPlaceable(x, y)) return;
      const result = buyRoomItem(mode.item.id, x, y, mode.rotation);
      toastResult(result);
      if (result.success) setMode({ type: "idle" });
      return;
    }
    if (mode.type === "moving") {
      if (!cellPlaceable(x, y)) return;
      undoLayoutRef.current = myRoomItems.map((item) => ({ ...item }));
      const result = moveRoomItem(mode.index, x, y, placingRotation);
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
  const presetKey = `2dstock-room-presets:${userId ?? "guest"}`;
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  const missionCategories: RoomItemCategory[] = ["가구", "욕실", "장식", "펫", "프리미엄"];
  const missionCategory = missionCategories[week % missionCategories.length];
  const missionCount = myRoomItems.filter(
    (placed) => getRoomItem(placed.itemId)?.category === missionCategory,
  ).length;

  function readPresets() {
    try {
      return JSON.parse(window.localStorage.getItem(presetKey) || "{}") as Record<
        string,
        PlacedRoomItem[]
      >;
    } catch {
      return {} as Record<string, PlacedRoomItem[]>;
    }
  }

  function savePreset(slot: number) {
    const saved = readPresets();
    saved[String(slot)] = myRoomItems.map((item) => ({ ...item }));
    window.localStorage.setItem(presetKey, JSON.stringify(saved));
    toastResult({ success: true, message: `🗂️ 프리셋 ${slot}에 현재 배치를 저장했습니다.` });
  }

  function loadPreset(slot: number) {
    const saved = readPresets();
    const layout = saved[String(slot)];
    if (!layout) {
      toastResult({ success: false, message: `프리셋 ${slot}이 비어 있습니다.` });
      return;
    }
    undoLayoutRef.current = myRoomItems.map((item) => ({ ...item }));
    toastResult(applyRoomLayout(layout));
  }

  async function shareRoom() {
    const topMood = atmosphere[0]?.[0] ?? "빈 방";
    const completedSets = ROOM_SETS.filter((set) =>
      set.ids.every((id) => ownedItemIds.has(id)),
    ).length;
    const text = `2DStock 마이룸 · ${theme.emoji} ${theme.name} · ${myRoomItems.length}개 가구 · ${topMood} · 세트 ${completedSets}/${ROOM_SETS.length}`;
    try {
      if (navigator.share) await navigator.share({ title: "내 2DStock 마이룸", text });
      else {
        await navigator.clipboard.writeText(text);
        toastResult({ success: true, message: "📸 마이룸 소개를 클립보드에 복사했습니다." });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toastResult({ success: false, message: "마이룸 소개를 공유하지 못했습니다." });
    }
  }

  return (
    <div className={`mx-auto max-w-4xl space-y-5 ${photoMode ? "myroom-photo-mode" : ""}`}>
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
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setPhotoMode((value) => !value)}
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-semibold"
            >
              {photoMode ? "편집으로" : "📷 포토 모드"}
            </button>
            <button
              type="button"
              onClick={() => void shareRoom()}
              className="rounded-lg bg-[var(--accent)] px-2 py-1 text-[10px] font-semibold text-white"
            >
              공유
            </button>
          </div>
        </div>
      </div>

      {/* 방 — 테마 팔레트로 벽지·바닥·욕실 타일을 통째로 칠한다 */}
      <div
        className="myroom-color-canvas mx-auto w-full max-w-[680px] overflow-hidden rounded-3xl border-4 p-1 shadow-lg sm:p-1.5"
        style={{ borderColor: palette.frame, background: `${palette.frame}55` }}
      >
        <div
          className="relative grid overflow-hidden rounded-2xl"
          style={{
            gridTemplateColumns: `repeat(${dims.cols}, minmax(0, 1fr))`,
            filter: night ? "brightness(0.82) saturate(1.08)" : undefined,
          }}
        >
          {Array.from({ length: dims.rows }).flatMap((_, y) =>
            Array.from({ length: dims.cols }).map((_, x) => {
              const key = `${x}:${y}`;
              const occupiedIndexes = cellMap.get(key) ?? [];
              const occupiedIndex = occupiedIndexes[occupiedIndexes.length - 1];
              const placed =
                occupiedIndex !== undefined ? myRoomItems[occupiedIndex] : undefined;
              const def = placed ? getRoomItem(placed.itemId) : undefined;
              const anchorIndexes = occupiedIndexes.filter((index) => {
                const entry = myRoomItems[index];
                return entry.x === x && entry.y === y;
              });
              const wall = isWallRow(y);
              const bath = !wall && isBathRow(y, dims.rows);
              const targetable = placingItem ? cellPlaceable(x, y) : false;
              const isSelected =
                mode.type === "selected" && occupiedIndex === mode.index;
              const isMovingSource =
                mode.type === "moving" && occupiedIndex === mode.index;
              const bathPassage = isRoomBathPassageCell(x, y, myRoomLevel);
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
                  draggable={Boolean(def && !photoMode)}
                  onDragStart={() => {
                    if (occupiedIndex !== undefined) setMode({ type: "moving", index: occupiedIndex });
                  }}
                  onDragOver={(event) => {
                    if (placingItem && cellPlaceable(x, y)) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    onCellClick(x, y);
                  }}
                  aria-label={
                    def
                      ? `${def.name} (${x + 1}, ${y + 1})`
                      : bathPassage
                        ? `욕탕 출입문 통로 (${x + 1}, ${y + 1})`
                        : `빈 칸 (${x + 1}, ${y + 1})`
                  }
                  style={{
                    background,
                    borderLeftColor: photoMode ? "transparent" : roomGridColor,
                    borderRightColor: photoMode ? "transparent" : roomGridColor,
                    borderTopColor:
                      bath && y === dims.rows - 3
                        ? palette.divider
                        : photoMode
                          ? "transparent"
                          : roomGridColor,
                    borderBottomColor:
                      wall && y === 1
                        ? `${palette.divider}88`
                        : photoMode
                          ? "transparent"
                          : roomGridColor,
                    ...(bath && y === dims.rows - 3
                      ? { borderTopWidth: 2 }
                      : {}),
                    ...(wall && y === 1
                      ? { borderBottomWidth: 2 }
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
                  {anchorIndexes.map((index) => {
                    const entry = myRoomItems[index];
                    const item = getRoomItem(entry.itemId);
                    if (!item) return null;
                    const size = roomItemSize(item, entry.rotation ?? 0);
                    const layer = roomItemLayer(item);
                    return (
                      <span
                        key={`${entry.itemId}:${entry.purchasedAt}`}
                        className={`pointer-events-none absolute left-0 top-0 flex items-center justify-center ${
                          item.category === "프리미엄"
                            ? "drop-shadow-[0_0_6px_rgba(250,204,21,0.9)]"
                            : ""
                        }`}
                        style={{
                          width: `${size.width * 100}%`,
                          height: `${size.height * 100}%`,
                          zIndex: layer === "surface" ? 12 : layer === "furniture" ? 8 : layer === "wall" ? 6 : 2,
                          background:
                            layer === "floor" ? `${palette.divider}33` : undefined,
                          borderRadius: layer === "floor" ? "18%" : undefined,
                          fontSize: size.width > 1 || size.height > 1 ? "1.45em" : undefined,
                        }}
                      >
                        {item.emoji}
                      </span>
                    );
                  })}
                </button>
              );
            }),
          )}

          {/* 숙소·욕탕 경계벽 — 중앙 양문형 출입구만 통과할 수 있다. */}
          <div
            aria-hidden
            data-testid="room-bath-boundary"
            className="pointer-events-none absolute inset-x-0 z-20 h-2 -translate-y-1/2 sm:h-2.5"
            style={{ top: `${(bathStart / dims.rows) * 100}%` }}
          >
            <span
              className="absolute inset-y-0 left-0 border-y shadow-sm"
              style={{
                width: `${bathDoorLeft}%`,
                borderColor: palette.divider,
                background: `linear-gradient(180deg, ${palette.wallFrom}, ${palette.wallTo})`,
              }}
            />
            <span
              className="absolute inset-y-0 right-0 border-y shadow-sm"
              style={{
                width: `${100 - bathDoorLeft - bathDoorWidth}%`,
                borderColor: palette.divider,
                background: `linear-gradient(180deg, ${palette.wallFrom}, ${palette.wallTo})`,
              }}
            />
            <span
              data-testid="room-bath-door"
              className="absolute bottom-1/2 h-6 rounded-t-lg border-x-[3px] border-t-[3px] sm:h-8"
              style={{
                left: `${bathDoorLeft}%`,
                width: `${bathDoorWidth}%`,
                borderColor: palette.frame,
                boxShadow: `0 -2px 6px ${palette.frame}55`,
              }}
            >
              <span
                className="absolute bottom-0 left-0 h-4/5 w-[18%] rounded-sm border"
                style={{
                  borderColor: palette.divider,
                  background: palette.wallTo,
                  transform: "translateX(-18%) rotate(-7deg)",
                  transformOrigin: "bottom left",
                }}
              />
              <span
                className="absolute bottom-0 right-0 h-4/5 w-[18%] rounded-sm border"
                style={{
                  borderColor: palette.divider,
                  background: palette.wallTo,
                  transform: "translateX(18%) rotate(7deg)",
                  transformOrigin: "bottom right",
                }}
              />
            </span>
            <span
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
              style={{
                left: `${bathDoorLeft}%`,
                width: `${bathDoorWidth}%`,
                background: palette.divider,
              }}
            />
          </div>

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
              top: `calc(${(bathStart / dims.rows) * 100}% + 8px)`,
              color: roomLabelColor,
              background: roomLabelBackground,
              borderColor: `${palette.divider}88`,
            }}
          >
            ♨️ 욕장
          </span>

          {/* 숙소 주민 — 문으로 들어와 산책하고 탕도 들른다 */}
          {residentCharacters.length > 0 ? (
            residentCharacters.map((character, index) => (
              <RoomResident
                key={character.id}
                cols={dims.cols}
                rows={dims.rows}
                occupiedCells={occupiedCells}
                cellText={cellText}
                visitor={{ emoji: character.emoji, name: character.name }}
                permanent
                startDelayTicks={index * 2}
              />
            ))
          ) : (
            <RoomResident
              cols={dims.cols}
              rows={dims.rows}
              occupiedCells={occupiedCells}
              cellText={cellText}
              visitor={visitor}
            />
          )}
        </div>
      </div>

      {/* 조작 안내·선택 액션 */}
      {!photoMode && mode.type === "placing" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          <span>
            {mode.item.emoji} <b>{mode.item.name}</b> ({formatPrice(mode.item.price)}) —{" "}
            {mode.item.wallOnly ? "벽" : "바닥"}의 초록 칸을 눌러 배치하세요.
          </span>
          <div className="flex shrink-0 gap-1.5">
            {mode.item.rotatable && (
              <button
                type="button"
                onClick={() =>
                  setMode({
                    ...mode,
                    rotation: mode.rotation === 90 ? 0 : 90,
                  })
                }
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
              >
                ↻ 회전
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode({ type: "idle" })}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
            >
              취소
            </button>
          </div>
        </div>
      )}
      {!photoMode && mode.type === "moving" && (
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
      {!photoMode && selected && selectedDef && mode.type === "selected" && (
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
              onClick={() => {
                setInteraction(
                  selectedDef.interaction ?? DEFAULT_INTERACTIONS[selectedDef.category],
                );
                window.setTimeout(() => setInteraction(null), 3_000);
              }}
              className="rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-300"
            >
              ✨ 사용
            </button>
            {selectedDef.rotatable && (
              <button
                type="button"
                onClick={() => {
                  undoLayoutRef.current = myRoomItems.map((item) => ({ ...item }));
                  toastResult(rotateRoomItem(mode.index));
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
              >
                ↻ 회전
              </button>
            )}
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
      {interaction && (
        <p className="mx-auto max-w-[680px] rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-center text-sm font-semibold text-violet-200 animate-pulse">
          {interaction}
        </p>
      )}
      {!photoMode && undoLayoutRef.current && (
        <button
          type="button"
          onClick={() => {
            const layout = undoLayoutRef.current;
            if (!layout) return;
            toastResult(applyRoomLayout(layout));
            undoLayoutRef.current = null;
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
        >
          ↶ 마지막 이동·회전 취소
        </button>
      )}
      {!photoMode && mode.type === "idle" && myRoomItems.length === 0 && (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center text-sm text-[var(--muted)]">
          아직 텅 빈 숙소예요. 아래 카탈로그에서 첫 가구를 들여 보세요.
        </p>
      )}

      {!photoMode && (
        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-bold">✨ 방 분위기</h2>
            <div className="mt-3 grid grid-cols-5 gap-1">
              {atmosphere.map(([label, value], index) => (
                <div
                  key={label}
                  className={`rounded-lg px-1 py-2 text-center ${
                    index === 0 && value > 0
                      ? "bg-violet-500/15 text-violet-300"
                      : "bg-[var(--background)] text-[var(--muted)]"
                  }`}
                >
                  <p className="text-[9px]">{label}</p>
                  <p className="mt-0.5 text-sm font-black">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
              {residentCharacters.length > 0
                ? `${residentCharacters.map((character) => character.name).join(", ")}이(가) 상주 중입니다.`
                : visitor
                  ? `오늘은 보유 종목의 ${visitor.name}이 방문합니다.`
                  : "관련 기업을 보유하면 경영 캐릭터가 방을 방문합니다."}
              {night ? " 현재는 야간 조명으로 전환됐습니다." : " 현재는 주간 채광입니다."}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{marketMood}</p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-bold">🎯 주간 꾸미기 의뢰</h2>
            <p className="mt-2 text-xs">
              이번 주: <b>{missionCategory}</b> 항목 4개 배치
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--background)]">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${Math.min(100, (missionCount / 4) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--muted)]">
              {missionCount >= 4
                ? "🏅 완료 · 이번 주 장식 배지를 획득했습니다."
                : `${missionCount}/4 · 현금 보상 없이 수집 배지만 제공`}
            </p>
          </div>

          <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-4 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">🏠 상주 CEO 초대</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                  친밀도 {ROOM_RESIDENT_AFFINITY} 이상인 CEO를 최대 {ROOM_RESIDENT_LIMIT}명까지
                  초대할 수 있습니다. 초대 후에는 보유 종목과 관계없이 계속 방에서 생활합니다.
                </p>
              </div>
              <span className="rounded-full bg-violet-400/15 px-2 py-1 text-[10px] font-bold text-violet-300">
                상주 {residentCharacters.length}/{ROOM_RESIDENT_LIMIT}
              </span>
            </div>
            {residentCandidates.length === 0 ? (
              <p className="mt-3 rounded-xl bg-[var(--background)] px-3 py-3 text-xs text-[var(--muted)]">
                아직 초대 가능한 CEO가 없습니다. 직접 주식 장기 보유·의뢰·사건 선택으로
                친밀도 {ROOM_RESIDENT_AFFINITY}을 달성해 보세요.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {residentCandidates.map(({ character, affinity, invited }) => {
                  const limitReached =
                    !invited && residentCharacters.length >= ROOM_RESIDENT_LIMIT;
                  return (
                    <div
                      key={character.id}
                      className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)]/75 p-2.5"
                    >
                      <span
                        aria-label={`${character.name} 임시 캐릭터 이미지`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-xl"
                      >
                        {character.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold">{character.name}</p>
                        <p className="text-[10px] text-[var(--muted)]">친밀도 {affinity}/120</p>
                      </div>
                      <button
                        type="button"
                        disabled={limitReached}
                        onClick={() =>
                          toastResult(
                            invited
                              ? dismissRoomResident(character.id)
                              : inviteRoomResident(character.id),
                          )
                        }
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                          invited
                            ? "bg-rose-500/15 text-rose-300"
                            : "bg-violet-500 text-white"
                        }`}
                      >
                        {invited ? "상주 해제" : limitReached ? "정원 초과" : "초대"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-[10px] text-[var(--muted)]">
              캐릭터 전용 이미지 에셋은 임시로 기존 이모지를 사용합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">🗂️ 배치 프리셋</h2>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                  같은 보유 가구 구성에서 배치·회전만 즉시 교체합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3].map((slot) => (
                  <div key={slot} className="flex overflow-hidden rounded-lg border border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => savePreset(slot)}
                      className="px-2 py-1 text-[10px] font-semibold"
                    >
                      {slot} 저장
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPreset(slot)}
                      className="border-l border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px]"
                    >
                      불러오기
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:col-span-2">
            <h2 className="text-sm font-bold">📝 오늘의 방명록</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              {residentCharacters[0]
                ? `${residentCharacters[0].emoji} ${residentCharacters[0].name}: “이제 이 방에서 지내겠습니다. ${atmosphere[0]?.[0] ?? "새로운"} 분위기도 마음에 드네요.”`
                : visitor
                  ? `${visitor.emoji} ${visitor.name}: “${atmosphere[0]?.[0] ?? "새로운"} 분위기가 인상적이네요. 다음에도 들르겠습니다.”`
                  : "🐰 오늘의 주민: “가구를 더 놓으면 친구들과 함께 방문할게요!”"}
            </p>
            <p className="mt-2 text-[10px] text-[var(--muted)]">
              대표 프리미엄 가구는 프로필과 랭킹 과시 목록에도 공개됩니다.
            </p>
          </div>
        </section>
      )}

      {!photoMode && (
        <section>
          <div className="mb-2 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">가구 도감·세트</h2>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                {ownedItemIds.size}/{ROOM_ITEMS.length}종 수집
              </p>
            </div>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--surface)]">
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: `${(ownedItemIds.size / ROOM_ITEMS.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROOM_SETS.map((set) => {
              const count = set.ids.filter((id) => ownedItemIds.has(id)).length;
              return (
                <div
                  key={set.name}
                  className={`rounded-xl border p-3 ${
                    count === set.ids.length
                      ? "border-amber-400/50 bg-amber-400/10"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  <p className="text-xs font-bold">{set.emoji} {set.name}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {count}/{set.ids.length} {count === set.ids.length ? "· 완성!" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 숙소 테마(도배) */}
      <section className={photoMode ? "hidden" : ""}>
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
      {!photoMode && (expansion ? (
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
      ))}

      {/* 카탈로그 */}
      <div className={photoMode ? "hidden" : "space-y-4"}>
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
                            {(item.width ?? 1) > 1 || (item.height ?? 1) > 1 ? (
                              <span className="ml-1 rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] font-medium text-cyan-300">
                                {item.width ?? 1}×{item.height ?? 1}{item.rotatable ? " · 회전" : ""}
                              </span>
                            ) : null}
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
                          onClick={() => setMode({ type: "placing", item, rotation: 0 })}
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

      <p className={`pb-4 text-center text-[11px] leading-relaxed text-[var(--muted)] ${photoMode ? "hidden" : ""}`}>
        마이룸 가구·테마는 순자산·시즌·랭킹에 합산되지 않는 순수 소비 공간입니다.
        로그인 계정은 방 배치·테마가 클라우드에 함께 저장됩니다.
      </p>
    </div>
  );
}
