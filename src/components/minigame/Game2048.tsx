"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 2048 — 4×4 슬라이드 퍼즐. 스와이프(또는 방향키)로 타일을 밀어, 같은 수가 만나면
 * 합쳐지며 2배가 된다. 매 이동마다 빈 칸에 2(또는 4)가 생기고, 더 움직일 수 없으면
 * 게임오버. 점수 = 합쳐진 값의 누적. 게임오버 시 점수를 넘겨준다.
 */

const SIZE = 4;
type Grid = number[]; // length 16, 0 = 빈 칸

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

function emptyGrid(): Grid {
  return Array<number>(SIZE * SIZE).fill(0);
}

function spawn(grid: Grid): Grid {
  const empties: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) empties.push(i);
  if (empties.length === 0) return grid;
  const idx = empties[Math.floor(Math.random() * empties.length)];
  const next = grid.slice();
  next[idx] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

/** 한 줄(4칸)을 왼쪽으로 밀어 합친다. 결과 줄과 얻은 점수를 반환. */
function slideRow(row: number[]): { row: number[]; gained: number } {
  const nums = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const merged = nums[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, gained };
}

type Dir = "left" | "right" | "up" | "down";

function move(grid: Grid, dir: Dir): { grid: Grid; gained: number; changed: boolean } {
  const next = emptyGrid();
  let gained = 0;
  for (let i = 0; i < SIZE; i++) {
    // 방향별로 한 줄(4칸)을 뽑아 왼쪽 밀기 형태로 정규화한다.
    const line: number[] = [];
    for (let j = 0; j < SIZE; j++) {
      let r: number, c: number;
      if (dir === "left") { r = i; c = j; }
      else if (dir === "right") { r = i; c = SIZE - 1 - j; }
      else if (dir === "up") { r = j; c = i; }
      else { r = SIZE - 1 - j; c = i; }
      line.push(grid[r * SIZE + c]);
    }
    const { row, gained: g } = slideRow(line);
    gained += g;
    for (let j = 0; j < SIZE; j++) {
      let r: number, c: number;
      if (dir === "left") { r = i; c = j; }
      else if (dir === "right") { r = i; c = SIZE - 1 - j; }
      else if (dir === "up") { r = j; c = i; }
      else { r = SIZE - 1 - j; c = i; }
      next[r * SIZE + c] = row[j];
    }
  }
  const changed = next.some((v, i) => v !== grid[i]);
  return { grid: next, gained, changed };
}

function hasMoves(grid: Grid): boolean {
  if (grid.some((v) => v === 0)) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r * SIZE + c];
      if (c + 1 < SIZE && grid[r * SIZE + c + 1] === v) return true;
      if (r + 1 < SIZE && grid[(r + 1) * SIZE + c] === v) return true;
    }
  }
  return false;
}

export function Game2048({
  onGameOver,
}: {
  onGameOver: (result: { score: number; best: number }) => void;
}) {
  const [grid, setGrid] = useState<Grid>(() => spawn(spawn(emptyGrid())));
  const [score, setScore] = useState(0);
  const overRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const doMove = useCallback(
    (dir: Dir) => {
      if (overRef.current) return;
      setGrid((prev) => {
        const { grid: moved, gained, changed } = move(prev, dir);
        if (!changed) return prev;
        const withSpawn = spawn(moved);
        if (gained > 0) setScore((s) => s + gained);
        if (!hasMoves(withSpawn)) {
          overRef.current = true;
          const best = Math.max(...withSpawn);
          // 점수 상태 갱신 뒤 콜백이 최신 점수를 받도록 다음 틱에 넘긴다.
          const finalScore = score + gained;
          setTimeout(() => onGameOver({ score: finalScore, best }), 0);
        }
        return withSpawn;
      });
    },
    [onGameOver, score],
  );

  useEffect(() => {
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
  }, [doMove]);

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = startRef.current;
    startRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 24) return; // 탭은 무시
    if (absX > absY) doMove(dx > 0 ? "right" : "left");
    else doMove(dy > 0 ? "down" : "up");
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-full max-w-[360px] items-center justify-between text-sm">
        <span className="rounded-lg bg-[var(--surface)] px-3 py-1 font-semibold">
          점수 {score.toLocaleString()}
        </span>
        <span className="text-xs text-[var(--muted)]">
          스와이프 · 방향키로 이동
        </span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="grid aspect-square w-full max-w-[360px] touch-none grid-cols-4 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2"
      >
        {grid.map((v, i) => (
          <div
            key={i}
            className={`flex items-center justify-center rounded-lg text-lg font-bold tabular-nums ${
              v === 0
                ? "bg-[var(--background)]"
                : TILE_STYLE[v] ?? "bg-[#3c3a32] text-white"
            }`}
            style={{ fontSize: v >= 1024 ? "1rem" : undefined }}
          >
            {v !== 0 ? v : ""}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        같은 수를 밀어 합치세요. 더 움직일 수 없으면 종료됩니다.
      </p>
    </div>
  );
}
