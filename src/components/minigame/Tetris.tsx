"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 테트리스 — 10×20 보드. 스와이프/버튼/방향키로 조각을 옮기고 회전해 가로줄을
 * 꽉 채우면 지워지며 점수가 오른다. T-스핀 인식(회전으로 T를 끼워 넣기), 줄 삭제
 * 플래시, 조각 착지 플래시 이펙트 포함. 상태는 ref + 버전 카운터로 관리한다.
 */

const COLS = 10;
const ROWS = 20;
const LINE_SCORE = [0, 100, 300, 500, 800];
const TSPIN_SCORE = [400, 800, 1200, 1600]; // 라인 0~3
const CLEAR_ANIM_MS = 220;

const COLORS = [
  "",
  "#22d3ee", // I
  "#eab308", // O
  "#a855f7", // T
  "#22c55e", // S
  "#ef4444", // Z
  "#3b82f6", // J
  "#f97316", // L
];
const T_COLOR = 3;

type Cell = number; // 0 빈칸, 1..7 색, -1 고스트
interface Piece {
  cells: number[][];
  color: number;
  x: number;
  y: number;
}

const SHAPES: { color: number; cells: number[][] }[] = [
  { color: 1, cells: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  { color: 2, cells: [[1, 1], [1, 1]] },
  { color: 3, cells: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  { color: 4, cells: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  { color: 5, cells: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  { color: 6, cells: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  { color: 7, cells: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
];

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}
function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) out[c][n - 1 - r] = m[r][c];
  return out;
}
function collides(board: Cell[][], p: Piece, nx = p.x, ny = p.y, cells = p.cells): boolean {
  for (let r = 0; r < cells.length; r++)
    for (let c = 0; c < cells[r].length; c++) {
      if (!cells[r][c]) continue;
      const x = nx + c;
      const y = ny + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x] !== 0) return true;
    }
  return false;
}
function spawn(): Piece {
  const s = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const cells = s.cells.map((r) => r.slice());
  return { cells, color: s.color, x: Math.floor((COLS - cells[0].length) / 2), y: 0 };
}

interface Game {
  board: Cell[][];
  piece: Piece;
  next: Piece;
  score: number;
  lines: number;
  over: boolean;
  paused: boolean;
  clearing: number[];
  lockFlash: Set<string>;
  lastRotate: boolean;
  tspin: { id: number; text: string } | null;
}

function initGame(): Game {
  return {
    board: emptyBoard(),
    piece: spawn(),
    next: spawn(),
    score: 0,
    lines: 0,
    over: false,
    paused: false,
    clearing: [],
    lockFlash: new Set(),
    lastRotate: false,
    tspin: null,
  };
}

export function Tetris({
  onGameOver,
}: {
  onGameOver: (result: { score: number; lines: number }) => void;
}) {
  const gRef = useRef<Game>(initGame());
  const [, setV] = useState(0);
  const overRef = useRef(false);
  const idRef = useRef(1);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const rerender = useCallback(() => setV((v) => v + 1), []);

  const finishIfOver = useCallback(() => {
    const g = gRef.current;
    if (g.over && !overRef.current) {
      overRef.current = true;
      setTimeout(() => onGameOver({ score: g.score, lines: g.lines }), 0);
    }
  }, [onGameOver]);

  const spawnNext = useCallback(
    (g: Game) => {
      g.piece = g.next;
      g.next = spawn();
      g.lastRotate = false;
      if (collides(g.board, g.piece)) g.over = true;
    },
    [],
  );

  const doLock = useCallback(
    (g: Game) => {
      const p = g.piece;
      const locked: string[] = [];
      for (let r = 0; r < p.cells.length; r++)
        for (let c = 0; c < p.cells[r].length; c++)
          if (p.cells[r][c] && p.y + r >= 0) {
            g.board[p.y + r][p.x + c] = p.color;
            locked.push(`${p.y + r},${p.x + c}`);
          }

      // T-스핀 판정: T + 마지막 동작이 회전 + 중심 대각 코너 3개 이상 채워짐
      let tspin = false;
      if (p.color === T_COLOR && g.lastRotate) {
        const cy = p.y + 1;
        const cx = p.x + 1;
        let filled = 0;
        for (const [yy, xx] of [
          [cy - 1, cx - 1],
          [cy - 1, cx + 1],
          [cy + 1, cx - 1],
          [cy + 1, cx + 1],
        ]) {
          if (xx < 0 || xx >= COLS || yy < 0 || yy >= ROWS) filled++;
          else if (g.board[yy][xx] !== 0) filled++;
        }
        if (filled >= 3) tspin = true;
      }

      const fullRows: number[] = [];
      for (let r = 0; r < ROWS; r++)
        if (g.board[r].every((v) => v !== 0)) fullRows.push(r);
      const n = fullRows.length;
      const gained = tspin ? TSPIN_SCORE[Math.min(n, 3)] : LINE_SCORE[n];

      // 착지 플래시
      g.lockFlash = new Set(locked);
      setTimeout(() => {
        gRef.current.lockFlash = new Set();
        rerender();
      }, 170);

      // T-스핀 팝업
      if (tspin) {
        const suffix = ["", " SINGLE", " DOUBLE", " TRIPLE"][Math.min(n, 3)];
        g.tspin = { id: idRef.current++, text: `T-SPIN${suffix}` };
        setTimeout(() => {
          gRef.current.tspin = null;
          rerender();
        }, 850);
      }

      if (n > 0) {
        // 두 단계: 줄 플래시 → 제거
        g.paused = true;
        g.clearing = fullRows;
        rerender();
        setTimeout(() => {
          const gg = gRef.current;
          gg.board = gg.board.filter((_, idx) => !fullRows.includes(idx));
          while (gg.board.length < ROWS)
            gg.board.unshift(Array<Cell>(COLS).fill(0));
          gg.score += gained;
          gg.lines += n;
          gg.clearing = [];
          gg.paused = false;
          spawnNext(gg);
          finishIfOver();
          rerender();
        }, CLEAR_ANIM_MS);
      } else {
        g.score += gained; // T-스핀(0줄) 보너스 포함
        spawnNext(g);
        finishIfOver();
        rerender();
      }
    },
    [rerender, spawnNext, finishIfOver],
  );

  const move = useCallback(
    (dx: number) => {
      const g = gRef.current;
      if (g.over || g.paused) return;
      if (!collides(g.board, g.piece, g.piece.x + dx, g.piece.y)) {
        g.piece.x += dx;
        g.lastRotate = false;
        rerender();
      }
    },
    [rerender],
  );
  const rotate = useCallback(() => {
    const g = gRef.current;
    if (g.over || g.paused) return;
    const rotated = rotateCW(g.piece.cells);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(g.board, g.piece, g.piece.x + kick, g.piece.y, rotated)) {
        g.piece.cells = rotated;
        g.piece.x += kick;
        g.lastRotate = true;
        rerender();
        return;
      }
    }
  }, [rerender]);
  const softDrop = useCallback(() => {
    const g = gRef.current;
    if (g.over || g.paused) return;
    if (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) {
      g.piece.y += 1;
      rerender();
    } else doLock(g);
  }, [rerender, doLock]);
  const hardDrop = useCallback(() => {
    const g = gRef.current;
    if (g.over || g.paused) return;
    while (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) g.piece.y += 1;
    doLock(g);
  }, [doLock]);

  useEffect(() => {
    const id = setInterval(() => {
      const g = gRef.current;
      if (g.over || g.paused) return;
      if (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) {
        g.piece.y += 1;
        rerender();
      } else doLock(g);
    }, 550);
    return () => clearInterval(id);
  }, [rerender, doLock]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(k))
        e.preventDefault();
      if (k === "ArrowLeft") move(-1);
      else if (k === "ArrowRight") move(1);
      else if (k === "ArrowUp") rotate();
      else if (k === "ArrowDown") softDrop();
      else if (k === " ") hardDrop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, rotate, softDrop, hardDrop]);

  const onPointerUp = (e: React.PointerEvent) => {
    const s = startRef.current;
    startRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < 16 && ady < 16) return rotate();
    if (adx > ady) move(dx > 0 ? 1 : -1);
    else if (dy > 0) (ady > 80 ? hardDrop : softDrop)();
  };

  const g = gRef.current;
  const disp = g.board.map((row) => row.slice());
  if (!g.over && !g.paused) {
    let gy = g.piece.y;
    while (!collides(g.board, g.piece, g.piece.x, gy + 1)) gy++;
    for (let r = 0; r < g.piece.cells.length; r++)
      for (let c = 0; c < g.piece.cells[r].length; c++)
        if (g.piece.cells[r][c]) {
          const y = gy + r;
          const x = g.piece.x + c;
          if (y >= 0 && disp[y][x] === 0) disp[y][x] = -1;
        }
    for (let r = 0; r < g.piece.cells.length; r++)
      for (let c = 0; c < g.piece.cells[r].length; c++)
        if (g.piece.cells[r][c]) {
          const y = g.piece.y + r;
          const x = g.piece.x + c;
          if (y >= 0) disp[y][x] = g.piece.color;
        }
  }
  const clearingSet = new Set(g.clearing);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-full max-w-[300px] items-center justify-between text-sm">
        <span className="rounded-lg bg-[var(--surface)] px-3 py-1 font-semibold">
          점수 {g.score.toLocaleString()}
        </span>
        <span className="rounded-lg bg-[var(--surface)] px-3 py-1 font-semibold">
          라인 {g.lines}
        </span>
      </div>

      <div className="relative" style={{ width: "min(300px, 86vw)" }}>
        <div
          onPointerDown={(e) =>
            (startRef.current = { x: e.clientX, y: e.clientY })
          }
          onPointerUp={onPointerUp}
          className="grid w-full touch-none rounded-2xl border border-[var(--border)] bg-[var(--background)] p-1.5"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: "2px",
            aspectRatio: `${COLS} / ${ROWS}`,
          }}
        >
          {disp.flat().map((v, i) => {
            const y = Math.floor(i / COLS);
            const x = i % COLS;
            const fx = clearingSet.has(y)
              ? "mg-tetris-clear"
              : g.lockFlash.has(`${y},${x}`)
                ? "mg-tetris-lock"
                : "";
            return (
              <div
                key={i}
                className={`rounded-[3px] ${fx}`}
                style={{
                  background:
                    v === -1
                      ? "transparent"
                      : v === 0
                        ? "var(--surface)"
                        : COLORS[v],
                  border: v === -1 ? "1.5px solid var(--border)" : undefined,
                }}
              />
            );
          })}
        </div>
        {g.tspin && (
          <div
            key={g.tspin.id}
            className="mg-tspin-pop rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-extrabold tracking-wide text-white shadow-lg"
          >
            {g.tspin.text}
          </div>
        )}
      </div>

      <div className="mt-3 grid w-full max-w-[300px] grid-cols-5 gap-1.5">
        <CtrlBtn label="◀" onClick={() => move(-1)} />
        <CtrlBtn label="⟳" onClick={rotate} />
        <CtrlBtn label="▶" onClick={() => move(1)} />
        <CtrlBtn label="▼" onClick={softDrop} />
        <CtrlBtn label="⤓" onClick={hardDrop} accent />
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        스와이프(좌우 이동·탭 회전·아래 드롭) 또는 버튼·방향키. 회전으로 T를 끼워
        넣으면 T-스핀 보너스!
      </p>
    </div>
  );
}

function CtrlBtn({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`min-h-11 rounded-xl text-lg font-bold transition active:scale-95 ${
        accent
          ? "bg-[var(--accent)] text-white"
          : "border border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      {label}
    </button>
  );
}
