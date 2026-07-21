"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { formatPrice } from "@/lib/market/engine";
import { toastResult } from "@/store/toastStore";
import {
  ROOM_GRID_COLS,
  ROOM_GRID_ROWS,
  ROOM_ITEMS,
  ROOM_MAX_ITEMS,
  ROOM_SELL_RATIO,
  getRoomItem,
  isWallRow,
  type RoomItemCategory,
  type RoomItemDefinition,
} from "@/data/roomItems";

const CATEGORY_ORDER: RoomItemCategory[] = ["가구", "욕실", "장식", "펫", "프리미엄"];

type RoomMode =
  | { type: "idle" }
  | { type: "placing"; item: RoomItemDefinition }
  | { type: "moving"; index: number }
  | { type: "selected"; index: number };

export default function MyRoomPage() {
  const cash = useMarketStore((s) => s.cash);
  const myRoomItems = useMarketStore((s) => s.myRoomItems);
  const buyRoomItem = useMarketStore((s) => s.buyRoomItem);
  const moveRoomItem = useMarketStore((s) => s.moveRoomItem);
  const sellRoomItem = useMarketStore((s) => s.sellRoomItem);

  const [mode, setMode] = useState<RoomMode>({ type: "idle" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    myRoomItems.forEach((placed, index) => map.set(`${placed.x}:${placed.y}`, index));
    return map;
  }, [myRoomItems]);

  const roomValue = useMemo(
    () => myRoomItems.reduce((sum, placed) => sum + placed.paidPrice, 0),
    [myRoomItems],
  );

  if (!mounted) return null;

  const placingItem =
    mode.type === "placing"
      ? mode.item
      : mode.type === "moving"
        ? getRoomItem(myRoomItems[mode.index]?.itemId ?? "")
        : undefined;

  function cellPlaceable(x: number, y: number): boolean {
    if (!placingItem) return false;
    if (cellMap.has(`${x}:${y}`)) return false;
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
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">마이룸</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            벌어들인 현금으로 나만의 방을 꾸며 보세요. 되팔면 구매가의{" "}
            {Math.round(ROOM_SELL_RATIO * 100)}%만 돌려받습니다.
          </p>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          <p>
            보유 현금 <span className="font-semibold text-[var(--foreground)]">{formatPrice(cash)}</span>
          </p>
          <p className="mt-0.5">
            방 꾸미기 누적 <span className="font-semibold text-[var(--foreground)]">{formatPrice(roomValue)}</span> ·{" "}
            {myRoomItems.length}/{ROOM_MAX_ITEMS}개
          </p>
        </div>
      </div>

      {/* 방 — 파스텔 목욕탕 느낌의 고정 팔레트(다크 테마와 무관한 실내 공간) */}
      <div className="overflow-hidden rounded-3xl border-4 border-pink-300 bg-pink-100 p-2 shadow-lg">
        <div
          className="grid overflow-hidden rounded-2xl"
          style={{ gridTemplateColumns: `repeat(${ROOM_GRID_COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: ROOM_GRID_ROWS }).flatMap((_, y) =>
            Array.from({ length: ROOM_GRID_COLS }).map((_, x) => {
              const key = `${x}:${y}`;
              const occupiedIndex = cellMap.get(key);
              const placed =
                occupiedIndex !== undefined ? myRoomItems[occupiedIndex] : undefined;
              const def = placed ? getRoomItem(placed.itemId) : undefined;
              const wall = isWallRow(y);
              const targetable = placingItem ? cellPlaceable(x, y) : false;
              const isSelected =
                mode.type === "selected" && occupiedIndex === mode.index;
              const isMovingSource =
                mode.type === "moving" && occupiedIndex === mode.index;
              const base = wall
                ? "bg-gradient-to-b from-pink-300 to-pink-200"
                : (x + y) % 2 === 0
                  ? "bg-white"
                  : "bg-pink-50";
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => onCellClick(x, y)}
                  aria-label={
                    def ? `${def.name} (${x + 1}, ${y + 1})` : `빈 칸 (${x + 1}, ${y + 1})`
                  }
                  className={`relative flex aspect-square items-center justify-center text-xl transition sm:text-2xl ${base} ${
                    wall ? "border-b border-pink-400/40" : "border border-pink-200/60"
                  } ${
                    placingItem
                      ? targetable
                        ? "cursor-pointer ring-2 ring-inset ring-emerald-400/70 hover:bg-emerald-100"
                        : "cursor-not-allowed opacity-60"
                      : def
                        ? "cursor-pointer hover:brightness-95"
                        : "cursor-default"
                  } ${isSelected ? "ring-2 ring-inset ring-sky-500" : ""} ${
                    isMovingSource ? "opacity-40" : ""
                  }`}
                >
                  {def && (
                    <span className={def.category === "프리미엄" ? "drop-shadow-[0_0_6px_rgba(250,204,21,0.9)]" : ""}>
                      {def.emoji}
                    </span>
                  )}
                </button>
              );
            }),
          )}
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
          아직 텅 빈 방이에요. 아래 카탈로그에서 첫 가구를 들여 보세요.
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
        마이룸 가구는 순자산·시즌·랭킹에 합산되지 않는 순수 소비 공간입니다.
        로그인 계정은 방 배치가 클라우드에 함께 저장됩니다.
      </p>
    </div>
  );
}
