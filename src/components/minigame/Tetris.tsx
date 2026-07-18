"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 테트리스 — 10×20 보드. 표준 규칙을 따른다:
 *  - 7-bag 랜덤(7종을 셔플해 한 봉지씩 소진)
 *  - 홀드(조각 보관·교체, 착지 전 1회)
 *  - 락 딜레이(바닥에 닿아도 바로 굳지 않고 여유 시간; 이동·회전하면 연장)
 *  - 회전 월킥(벽·바닥 근처에서도 여유 있게 회전) + T-스핀 인식
 *  - 줄삭제 플래시·착지 플래시 이펙트
 * 상태는 리렌더 편의상 ref + 버전 카운터로 관리한다.
 */

const COLS = 10;
const ROWS = 20;
const LINE_SCORE = [0, 100, 300, 500, 800];
const TSPIN_SCORE = [400, 800, 1200, 1600];
const CLEAR_ANIM_MS = 220;
const GRAVITY_MS = 600;
const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const TICK_MS = 50;

const COLORS = ["", "#22d3ee", "#eab308", "#a855f7", "#22c55e", "#ef4444", "#3b82f6", "#f97316"];
const T_COLOR = 3;

type Cell = number;
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

// 회전 월킥 후보 (dx, dy). 벽·바닥 근처에서도 회전이 되도록 넉넉히 시도한다.
const KICKS: [number, number][] = [
  [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0],
  [0, -1], [-1, -1], [1, -1], [0, -2],
];

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}
function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[c][n - 1 - r] = m[r][c];
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
function shuffle(a: number[]): number[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makePiece(idx: number): Piece {
  const s = SHAPES[idx];
  const cells = s.cells.map((r) => r.slice());
  return { cells, color: s.color, x: Math.floor((COLS - cells[0].length) / 2), y: 0 };
}

interface Game {
  board: Cell[][];
  piece: Piece;
  bag: number[];
  nextIdx: number;
  hold: number | null;
  canHold: boolean;
  score: number;
  lines: number;
  over: boolean;
  paused: boolean;
  clearing: number[];
  lockFlash: Set<string>;
  lastRotate: boolean;
  tspin: { id: number; text: string } | null;
  lockAt: number | null;
  lockResets: number;
  gravAcc: number;
}

function drawIdx(g: Game): number {
  if (g.bag.length === 0) g.bag = shuffle([0, 1, 2, 3, 4, 5, 6]);
  return g.bag.shift()!;
}
function resetFall(g: Game) {
  g.lockAt = null;
  g.lockResets = 0;
  g.gravAcc = 0;
  g.lastRotate = false;
}
function initGame(): Game {
  const g: Game = {
    board: emptyBoard(),
    piece: makePiece(0),
    bag: shuffle([0, 1, 2, 3, 4, 5, 6]),
    nextIdx: 0,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    over: false,
    paused: false,
    clearing: [],
    lockFlash: new Set(),
    lastRotate: false,
    tspin: null,
    lockAt: null,
    lockResets: 0,
    gravAcc: 0,
  };
  g.piece = makePiece(drawIdx(g));
  g.nextIdx = drawIdx(g);
  return g;
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

  const spawnFromNext = useCallback((g: Game) => {
    g.piece = makePiece(g.nextIdx);
    g.nextIdx = drawIdx(g);
    resetFall(g);
    if (collides(g.board, g.piece)) g.over = true;
  }, []);

  const restLock = useCallback((g: Game) => {
    // 착지(내려갈 수 없음) 상태에서 이동·회전 후 락 타이머를 갱신(여유 연장).
    if (collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) {
      if (g.lockResets < MAX_LOCK_RESETS) {
        g.lockAt = Date.now() + LOCK_DELAY_MS;
        g.lockResets++;
      }
    } else {
      g.lockAt = null;
    }
  }, []);

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

      let tspin = false;
      if (p.color === T_COLOR && g.lastRotate) {
        const cy = p.y + 1;
        const cx = p.x + 1;
        let filled = 0;
        for (const [yy, xx] of [
          [cy - 1, cx - 1], [cy - 1, cx + 1], [cy + 1, cx - 1], [cy + 1, cx + 1],
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

      g.lockFlash = new Set(locked);
      setTimeout(() => {
        gRef.current.lockFlash = new Set();
        rerender();
      }, 170);

      if (tspin) {
        const suffix = ["", " SINGLE", " DOUBLE", " TRIPLE"][Math.min(n, 3)];
        g.tspin = { id: idRef.current++, text: `T-SPIN${suffix}` };
        setTimeout(() => {
          gRef.current.tspin = null;
          rerender();
        }, 850);
      }

      if (n > 0) {
        g.paused = true;
        g.clearing = fullRows;
        rerender();
        setTimeout(() => {
          const gg = gRef.current;
          gg.board = gg.board.filter((_, idx) => !fullRows.includes(idx));
          while (gg.board.length < ROWS) gg.board.unshift(Array<Cell>(COLS).fill(0));
          gg.score += gained;
          gg.lines += n;
          gg.clearing = [];
          gg.paused = false;
          spawnFromNext(gg);
          gg.canHold = true;
          finishIfOver();
          rerender();
        }, CLEAR_ANIM_MS);
      } else {
        g.score += gained;
        spawnFromNext(g);
        g.canHold = true;
        finishIfOver();
        rerender();
      }
    },
    [rerender, spawnFromNext, finishIfOver],
  );

  const move = useCallback(
    (dx: number) => {
      const g = gRef.current;
      if (g.over || g.paused) return;
      if (!collides(g.board, g.piece, g.piece.x + dx, g.piece.y)) {
        g.piece.x += dx;
        g.lastRotate = false;
        restLock(g);
        rerender();
      }
    },
    [rerender, restLock],
  );
  const rotate = useCallback(() => {
    const g = gRef.current;
    if (g.over || g.paused) return;
    const rotated = rotateCW(g.piece.cells);
    for (const [kx, ky] of KICKS) {
      if (!collides(g.board, g.piece, g.piece.x + kx, g.piece.y + ky, rotated)) {
        g.piece.cells = rotated;
        g.piece.x += kx;
        g.piece.y += ky;
        g.lastRotate = true;
        restLock(g);
        rerender();
        return;
      }
    }
  }, [rerender, restLock]);
  const softDrop = useCallback(() => {
    const g = gRef.current;
    if (g.over || g.paused) return;
    if (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) {
      g.piece.y += 1;
      g.gravAcc = 0;
      rerender();
    }
  }, [rerender]);
  const hardDrop = useCallback(() => {
    const g = gRef.current;
    if (g.over || g.paused) return;
    while (!collides(g.board, g.piece, g.piece.x, g.piece.y + 1)) g.piece.y += 1;
    doLock(g);
  }, [doLock]);
  const doHold = useCallback(() => {
    const g = gRef.current;
    if (g.over || g.paused || !g.canHold) return;
    const curIdx = g.piece.color - 1;
    if (g.hold === null) {
      g.hold = curIdx;
      spawnFromNext(g);
    } else {
      const swap = g.hold;
      g.hold = curIdx;
      g.piece = makePiece(swap);
      resetFall(g);
      if (collides(g.board, g.piece)) g.over = true;
    }
    g.canHold = false;
    finishIfOver();
    rerender();
  }, [rerender, spawnFromNext, finishIfOver]);

  // 통합 틱: 중력 누적 + 락 딜레이
  useEffect(() => {
    const id = setInterval(() => {
      const g = gRef.current;
      if (g.over || g.paused) return;
      const now = Date.now();
      const canDown = !collides(g.board, g.piece, g.piece.x, g.piece.y + 1);
      if (canDown) {
        g.lockAt = null;
        g.gravAcc += TICK_MS;
        if (g.gravAcc >= GRAVITY_MS) {
          g.piece.y += 1;
          g.gravAcc = 0;
          g.lockResets = 0;
          rerender();
        }
      } else {
        if (g.lockAt === null) g.lockAt = now + LOCK_DELAY_MS;
        else if (now >= g.lockAt) doLock(g);
      }
    }, TICK_MS);
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
      else if (k === "Shift" || k === "c" || k === "C") doHold();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, rotate, softDrop, hardDrop, doHold]);

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
      <div className="mb-2 flex w-full max-w-[300px] items-center justify-between gap-2">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            doHold();
          }}
          className="flex flex-col items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
        >
          <span className="text-[9px] text-[var(--muted)]">홀드</span>
          <Mini idx={g.hold} />
        </button>
        <div className="flex flex-col items-center text-xs">
          <span className="font-bold tabular-nums">{g.score.toLocaleString()}</span>
          <span className="text-[10px] text-[var(--muted)]">{g.lines}줄</span>
        </div>
        <div className="flex flex-col items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
          <span className="text-[9px] text-[var(--muted)]">다음</span>
          <Mini idx={g.nextIdx} />
        </div>
      </div>

      <div className="relative" style={{ width: "min(300px, 86vw)" }}>
        <div
          onPointerDown={(e) => (startRef.current = { x: e.clientX, y: e.clientY })}
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
                    v === -1 ? "transparent" : v === 0 ? "var(--surface)" : COLORS[v],
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

      <div className="mt-3 grid w-full max-w-[300px] grid-cols-6 gap-1.5">
        <CtrlBtn label="◀" onClick={() => move(-1)} />
        <CtrlBtn label="⟳" onClick={rotate} />
        <CtrlBtn label="▶" onClick={() => move(1)} />
        <CtrlBtn label="▼" onClick={softDrop} />
        <CtrlBtn label="H" onClick={doHold} />
        <CtrlBtn label="⤓" onClick={hardDrop} accent />
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        스와이프·버튼·방향키로 조작. H=홀드. 바닥에 닿아도 잠깐 여유가 있어 회전·이동·T-스핀이 됩니다.
      </p>
    </div>
  );
}

function Mini({ idx }: { idx: number | null }) {
  if (idx === null) return <div className="h-8 w-10" />;
  const cells = SHAPES[idx].cells;
  const color = COLORS[SHAPES[idx].color];
  // 빈 행/열 제거해 조각만 컴팩트하게
  const rows = cells.filter((r) => r.some((v) => v));
  const cols = cells[0].map((_, c) => cells.some((r) => r[c]));
  const trimmed = rows.map((r) => r.filter((_, c) => cols[c]));
  const w = trimmed[0]?.length ?? 1;
  return (
    <div
      className="grid h-8 items-center"
      style={{ gridTemplateColumns: `repeat(${w}, 8px)`, gap: "1px" }}
    >
      {trimmed.flat().map((v, i) => (
        <div
          key={i}
          className="h-2 w-2 rounded-[1px]"
          style={{ background: v ? color : "transparent" }}
        />
      ))}
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
      className={`min-h-11 rounded-xl text-base font-bold transition active:scale-95 ${
        accent
          ? "bg-[var(--accent)] text-white"
          : "border border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      {label}
    </button>
  );
}
