"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 테트리스 — 10×20 보드. 스와이프/버튼/방향키로 조각을 옮기고 회전해 가로줄을
 * 꽉 채우면 지워지며 점수가 오른다. 새 조각을 놓을 수 없으면 게임오버 시 점수를
 * 넘겨준다. 상태는 리렌더 편의상 ref + 버전 카운터로 관리한다.
 */

const COLS = 10;
const ROWS = 20;
const LINE_SCORE = [0, 100, 300, 500, 800];

// 색 팔레트 (index 1..7)
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

type Cell = number; // 0 빈칸, 1..7 색, -1 고스트
interface Piece {
  cells: number[][]; // 0/1
  color: number;
  x: number;
  y: number;
}

const SHAPES: { color: number; cells: number[][] }[] = [
  { color: 1, cells: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] }, // I
  { color: 2, cells: [[1, 1], [1, 1]] }, // O
  { color: 3, cells: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] }, // T
  { color: 4, cells: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] }, // S
  { color: 5, cells: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] }, // Z
  { color: 6, cells: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] }, // J
  { color: 7, cells: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] }, // L
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
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (!cells[r][c]) continue;
      const x = nx + c;
      const y = ny + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x] !== 0) return true;
    }
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
}

function initGame(): Game {
  return {
    board: emptyBoard(),
    piece: spawn(),
    next: spawn(),
    score: 0,
    lines: 0,
    over: false,
  };
}

function lockAndNext(g: Game) {
  // 보드에 고정
  const { piece: p } = g;
  for (let r = 0; r < p.cells.length; r++)
    for (let c = 0; c < p.cells[r].length; c++)
      if (p.cells[r][c] && p.y + r >= 0) g.board[p.y + r][p.x + c] = p.color;
  // 줄 제거
  let cleared = 0;
  g.board = g.board.filter((row) => {
    const full = row.every((v) => v !== 0);
    if (full) cleared++;
    return !full;
  });
  while (g.board.length < ROWS) g.board.unshift(Array<Cell>(COLS).fill(0));
  if (cleared > 0) {
    g.score += LINE_SCORE[cleared];
    g.lines += cleared;
  }
  // 다음 조각
  g.piece = g.next;
  g.next = spawn();
  if (collides(g.board, g.piece)) g.over = true;
}

export function Tetris({
  onGameOver,
}: {
  onGameOver: (result: { score: number; lines: number }) => void;
}) {
  const gRef = useRef<Game>(initGame());
  const [, setV] = useState(0);
  const overRef = useRef(false);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const rerender = useCallback(() => setV((v) => v + 1), []);

  const finishIfOver = useCallback(() => {
    const g = gRef.current;
    if (g.over && !overRef.current) {
      overRef.current = true;
      setTimeout(() => onGameOver({ score: g.score, lines: g.lines }), 0);
    }
  }, [onGameOver]);

  const move = useCallback(
    (dx: number) => {
      const g = gRef.current;
      if (g.over) return;
      if (!collides(g.board, g.piece, g.piece.x + dx, g.piece.y)) {
        g.piece.x += dx;
        rerender();
      }
    },
    [rerender],
  );

  const rotate = useCallback(() => {
    const g = gRef.current;
    if (g.over) return;
    const rotated = rotateCW(g.piece.cells);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(g.board, g.piece, g.piece.x + kick, g.piece.y, rotated)) {
        g.piece.cells = rotated;
        g.piece.x += kick;
        rerender();
        return;
      }
    }
  }, [rerender]);

  const softDrop = useCallback(() => {
    const g = gRef.current;
    if (g.over) return;
    if (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) {
      g.piece.y += 1;
    } else {
      lockAndNext(g);
      finishIfOver();
    }
    rerender();
  }, [rerender, finishIfOver]);

  const hardDrop = useCallback(() => {
    const g = gRef.current;
    if (g.over) return;
    while (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) g.piece.y += 1;
    lockAndNext(g);
    finishIfOver();
    rerender();
  }, [rerender, finishIfOver]);

  // 중력
  useEffect(() => {
    const id = setInterval(() => {
      const g = gRef.current;
      if (g.over) return;
      const speed = Math.max(120, 700 - Math.floor(g.lines / 10) * 70);
      void speed;
      if (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) {
        g.piece.y += 1;
      } else {
        lockAndNext(g);
        finishIfOver();
      }
      rerender();
    }, 550);
    return () => clearInterval(id);
  }, [rerender, finishIfOver]);

  // 키보드
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(k)) {
        e.preventDefault();
      }
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
    if (adx < 16 && ady < 16) {
      rotate(); // 탭 = 회전
      return;
    }
    if (adx > ady) move(dx > 0 ? 1 : -1);
    else if (dy > 0) {
      if (ady > 80) hardDrop();
      else softDrop();
    }
  };

  const g = gRef.current;

  // 표시용 그리드 (보드 + 고스트 + 현재 조각)
  const disp = g.board.map((row) => row.slice());
  if (!g.over) {
    // 고스트
    let gy = g.piece.y;
    while (!collides(g.board, g.piece, g.piece.x, gy + 1)) gy++;
    for (let r = 0; r < g.piece.cells.length; r++)
      for (let c = 0; c < g.piece.cells[r].length; c++)
        if (g.piece.cells[r][c]) {
          const y = gy + r;
          const x = g.piece.x + c;
          if (y >= 0 && disp[y][x] === 0) disp[y][x] = -1;
        }
    // 현재 조각
    for (let r = 0; r < g.piece.cells.length; r++)
      for (let c = 0; c < g.piece.cells[r].length; c++)
        if (g.piece.cells[r][c]) {
          const y = g.piece.y + r;
          const x = g.piece.x + c;
          if (y >= 0) disp[y][x] = g.piece.color;
        }
  }

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

      <div
        onPointerDown={(e) =>
          (startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() })
        }
        onPointerUp={onPointerUp}
        className="grid touch-none rounded-2xl border border-[var(--border)] bg-[var(--background)] p-1.5"
        style={{
          width: "min(300px, 86vw)",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: "2px",
          aspectRatio: `${COLS} / ${ROWS}`,
        }}
      >
        {disp.flat().map((v, i) => (
          <div
            key={i}
            className="rounded-[3px]"
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
        ))}
      </div>

      {/* 조작 버튼 */}
      <div className="mt-3 grid w-full max-w-[300px] grid-cols-5 gap-1.5">
        <CtrlBtn label="◀" onClick={() => move(-1)} />
        <CtrlBtn label="⟳" onClick={rotate} />
        <CtrlBtn label="▶" onClick={() => move(1)} />
        <CtrlBtn label="▼" onClick={softDrop} />
        <CtrlBtn label="⤓" onClick={hardDrop} accent />
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        스와이프(좌우 이동·탭 회전·아래 드롭) 또는 버튼·방향키로 조작하세요.
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
