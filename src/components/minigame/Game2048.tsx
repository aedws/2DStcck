"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 2048 — 4×4 슬라이드 퍼즐 (애니메이션판). 타일은 id로 추적돼 이동 시 left/top이
 * CSS 트랜지션으로 슬라이드하고, 병합·생성은 팝 애니메이션이 붙는다. 스와이프
 * (또는 방향키)로 조작하며, 더 움직일 수 없으면 게임오버 시 점수를 넘겨준다.
 */

const SIZE = 4;
const PAD = 2; // %
const TILE = 22.5; // %
const STEP = TILE + PAD; // 24.5%

type Dir = "left" | "right" | "up" | "down";
interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  isNew?: boolean;
  merged?: boolean;
}

const TILE_STYLE: Record<number, string> = {
  2: "bg-[#eee4da] text-[#776e65]",
  4: "bg-[#ede0c8] text-[#776e65]",
  8: "bg-[#f2b179] text-white",
  16: "bg-[#f59563] text-white",
  32: "bg-[#f67c5f] text-white",
  64: "bg-[#f65e3b] text-white",
  128: "bg-[#edcf72] text-white",
  256: "bg-[#edcc61] text-white",
  512: "bg-[#edc850] text-white",
  1024: "bg-[#edc53f] text-white",
  2048: "bg-[#edc22e] text-white",
};

const vector: Record<Dir, [number, number]> = {
  left: [0, -1],
  right: [0, 1],
  up: [-1, 0],
  down: [1, 0],
};

function traversal(dir: Dir): { r: number; c: number }[] {
  const rOrder = dir === "down" ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cOrder = dir === "right" ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const out: { r: number; c: number }[] = [];
  for (const r of rOrder) for (const c of cOrder) out.push({ r, c });
  return out;
}

function toGrid(tiles: Tile[]): (Tile | null)[][] {
  const g: (Tile | null)[][] = Array.from({ length: SIZE }, () =>
    Array<Tile | null>(SIZE).fill(null),
  );
  for (const t of tiles) g[t.row][t.col] = t;
  return g;
}

function hasMoves(tiles: Tile[]): boolean {
  if (tiles.length < SIZE * SIZE) return true;
  const g = toGrid(tiles);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = g[r][c]?.value;
      if (c + 1 < SIZE && g[r][c + 1]?.value === v) return true;
      if (r + 1 < SIZE && g[r + 1][c]?.value === v) return true;
    }
  }
  return false;
}

export function Game2048({
  onGameOver,
  onProgress,
  paused = false,
}: {
  onGameOver: (result: { score: number; best: number }) => void;
  onProgress?: (result: { score: number; best: number }) => void;
  paused?: boolean;
}) {
  const idRef = useRef(1);
  const overRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const mkTile = useCallback(
    (value: number, row: number, col: number, flags?: Partial<Tile>): Tile => ({
      id: idRef.current++,
      value,
      row,
      col,
      ...flags,
    }),
    [],
  );

  const spawnInto = useCallback(
    (tiles: Tile[]): Tile[] => {
      const occupied = new Set(tiles.map((t) => t.row * SIZE + t.col));
      const empties: number[] = [];
      for (let i = 0; i < SIZE * SIZE; i++) if (!occupied.has(i)) empties.push(i);
      if (empties.length === 0) return tiles;
      const idx = empties[Math.floor(Math.random() * empties.length)];
      const value = Math.random() < 0.9 ? 2 : 4;
      return [...tiles, mkTile(value, Math.floor(idx / SIZE), idx % SIZE, { isNew: true })];
    },
    [mkTile],
  );

  const [tiles, setTiles] = useState<Tile[]>(() =>
    spawnInto(spawnInto([])),
  );
  const [score, setScore] = useState(0);

  useEffect(() => {
    onProgress?.({
      score,
      best: Math.max(...tiles.map((tile) => tile.value)),
    });
  }, [onProgress, score, tiles]);

  const doMove = useCallback(
    (dir: Dir) => {
      if (overRef.current || paused) return;
      setTiles((prev) => {
        const grid = toGrid(prev);
        const occ: (Tile | null)[][] = Array.from({ length: SIZE }, () =>
          Array<Tile | null>(SIZE).fill(null),
        );
        const merged: boolean[][] = Array.from({ length: SIZE }, () =>
          Array<boolean>(SIZE).fill(false),
        );
        const [dr, dc] = vector[dir];
        let gained = 0;
        let changed = false;

        for (const { r, c } of traversal(dir)) {
          const tile = grid[r][c];
          if (!tile) continue;
          let nr = r;
          let nc = c;
          while (true) {
            const tr = nr + dr;
            const tc = nc + dc;
            if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
            if (occ[tr][tc]) break;
            nr = tr;
            nc = tc;
          }
          const br = nr + dr;
          const bc = nc + dc;
          const target =
            br >= 0 && br < SIZE && bc >= 0 && bc < SIZE ? occ[br][bc] : null;
          if (target && target.value === tile.value && !merged[br][bc]) {
            occ[br][bc] = {
              id: tile.id,
              value: tile.value * 2,
              row: br,
              col: bc,
              merged: true,
            };
            merged[br][bc] = true;
            gained += tile.value * 2;
            changed = true;
          } else {
            occ[nr][nc] = { id: tile.id, value: tile.value, row: nr, col: nc };
            if (nr !== r || nc !== c) changed = true;
          }
        }

        if (!changed) return prev;

        let result: Tile[] = [];
        for (let r = 0; r < SIZE; r++)
          for (let c = 0; c < SIZE; c++) if (occ[r][c]) result.push(occ[r][c]!);
        result = spawnInto(result);

        if (gained > 0) setScore((s) => s + gained);
        if (!hasMoves(result)) {
          overRef.current = true;
          const best = Math.max(...result.map((t) => t.value));
          const finalScore = score + gained;
          setTimeout(() => onGameOver({ score: finalScore, best }), 250);
        }
        return result;
      });
    },
    [onGameOver, paused, score, spawnInto],
  );

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        doMove(dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove, paused]);

  const onPointerUp = (e: React.PointerEvent) => {
    if (paused) return;
    const s = startRef.current;
    startRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
    else doMove(dy > 0 ? "down" : "up");
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-full max-w-[360px] items-center justify-between text-sm">
        <span className="rounded-lg bg-[var(--surface)] px-3 py-1 font-semibold">
          점수 {score.toLocaleString()}
        </span>
        <span className="text-xs text-[var(--muted)]">스와이프 · 방향키</span>
      </div>
      <div
        onPointerDown={(e) => (startRef.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={onPointerUp}
        className="relative aspect-square w-full max-w-[360px] touch-none rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
      >
        {/* 배경 격자 */}
        {Array.from({ length: SIZE * SIZE }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-lg bg-[var(--background)]"
            style={{
              width: `${TILE}%`,
              height: `${TILE}%`,
              left: `${PAD + (i % SIZE) * STEP}%`,
              top: `${PAD + Math.floor(i / SIZE) * STEP}%`,
            }}
          />
        ))}
        {/* 타일 */}
        {tiles.map((t) => (
          <div
            key={t.id}
            className={`absolute flex items-center justify-center rounded-lg font-bold tabular-nums ${
              TILE_STYLE[t.value] ?? "bg-[#3c3a32] text-white"
            } ${t.merged ? "mg-tile-merged" : ""} ${t.isNew ? "mg-tile-new" : ""}`}
            style={{
              width: `${TILE}%`,
              height: `${TILE}%`,
              left: `${PAD + t.col * STEP}%`,
              top: `${PAD + t.row * STEP}%`,
              fontSize: t.value >= 1024 ? "1rem" : t.value >= 128 ? "1.25rem" : "1.4rem",
              transition: "left 0.11s ease, top 0.11s ease",
            }}
          >
            {t.value}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        같은 수를 밀어 합치세요. 더 움직일 수 없으면 종료됩니다.
      </p>
    </div>
  );
}
