"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 스와이프 벽돌깨기 (Ballz 계열). 하단에서 스와이프로 각도를 조준해 공 무리를
 * 발사하고, 벽·벽돌에 튕기며 벽돌 내구도를 깎는다. 턴이 끝나면 벽돌이 한 줄
 * 내려오고 새 줄이 생긴다. 벽돌이 바닥에 닿으면 게임오버. 물리는 canvas +
 * requestAnimationFrame 으로 직접 구현하며, 상태는 리렌더를 피하려 ref 에 둔다.
 */

const COLS = 7;
const BALL_SPEED = 0.34; // cell/step
const SUBSTEPS = 3;
const FIRE_INTERVAL_FRAMES = 4;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Brick {
  col: number;
  row: number;
  hp: number;
}
interface Item {
  col: number;
  row: number;
}

interface GameState {
  W: number;
  H: number;
  cell: number;
  ballR: number;
  rows: number;
  launchX: number;
  launchY: number;
  ballCount: number;
  pendingAdd: number;
  rounds: number;
  bricksBroken: number;
  phase: "aim" | "fire" | "over";
  balls: Ball[];
  bricks: Brick[];
  items: Item[];
  toFire: number; // 아직 발사 대기 중인 공 수
  fireTimer: number;
  aimDir: { x: number; y: number } | null;
  returnX: number | null;
}

export function SwipeBrickBreaker({
  onGameOver,
  running,
}: {
  onGameOver: (result: { rounds: number; bricks: number }) => void;
  running: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gsRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const overRef = useRef(false);
  const [hud, setHud] = useState({ rounds: 1, balls: 1, bricks: 0, phase: "aim" as GameState["phase"] });

  const brickHpForRound = (round: number) =>
    Math.max(1, Math.round(round * 0.7) + Math.floor(Math.random() * 2));

  const spawnRow = useCallback((gs: GameState) => {
    let placed = 0;
    let itemPlaced = false;
    const cols = [...Array(COLS).keys()].sort(() => Math.random() - 0.5);
    for (const col of cols) {
      const roll = Math.random();
      if (!itemPlaced && roll < 0.14) {
        gs.items.push({ col, row: 0 });
        itemPlaced = true;
      } else if (roll < 0.72) {
        gs.bricks.push({ col, row: 0, hp: brickHpForRound(gs.rounds) });
        placed++;
      }
    }
    if (placed === 0) {
      const col = Math.floor(Math.random() * COLS);
      gs.bricks.push({ col, row: 0, hp: brickHpForRound(gs.rounds) });
    }
  }, []);

  const init = useCallback(
    (W: number, H: number): GameState => {
      const cell = W / COLS;
      const rows = Math.max(6, Math.floor(H / cell));
      const gs: GameState = {
        W,
        H,
        cell,
        ballR: cell * 0.11,
        rows,
        launchX: W / 2,
        launchY: H - cell * 0.5,
        ballCount: 1,
        pendingAdd: 0,
        rounds: 1,
        bricksBroken: 0,
        phase: "aim",
        balls: [],
        bricks: [],
        items: [],
        toFire: 0,
        fireTimer: 0,
        aimDir: null,
        returnX: null,
      };
      spawnRow(gs);
      return gs;
    },
    [spawnRow],
  );

  // 턴 종료 처리 (모든 공 복귀)
  const endTurn = useCallback(
    (gs: GameState) => {
      gs.launchX = gs.returnX ?? gs.launchX;
      gs.returnX = null;
      gs.ballCount += gs.pendingAdd;
      gs.pendingAdd = 0;
      gs.rounds += 1;
      // 한 줄 하강
      for (const b of gs.bricks) b.row += 1;
      for (const it of gs.items) it.row += 1;
      spawnRow(gs);
      // 게임오버 판정: 벽돌 하단이 발사선에 닿으면
      const overLine = gs.launchY - gs.cell * 0.6;
      const dead = gs.bricks.some((b) => (b.row + 1) * gs.cell >= overLine);
      if (dead) {
        gs.phase = "over";
      } else {
        gs.phase = "aim";
      }
    },
    [spawnRow],
  );

  const stepPhysics = useCallback((gs: GameState) => {
    // 발사 대기 공을 간격을 두고 내보낸다
    if (gs.toFire > 0 && gs.aimDir) {
      gs.fireTimer -= 1;
      if (gs.fireTimer <= 0) {
        gs.balls.push({
          x: gs.launchX,
          y: gs.launchY,
          vx: gs.aimDir.x * gs.cell * BALL_SPEED,
          vy: gs.aimDir.y * gs.cell * BALL_SPEED,
        });
        gs.toFire -= 1;
        gs.fireTimer = FIRE_INTERVAL_FRAMES;
      }
    }

    const r = gs.ballR;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (let i = gs.balls.length - 1; i >= 0; i--) {
        const ball = gs.balls[i];
        ball.x += ball.vx / SUBSTEPS;
        ball.y += ball.vy / SUBSTEPS;
        // 벽
        if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx); }
        if (ball.x > gs.W - r) { ball.x = gs.W - r; ball.vx = -Math.abs(ball.vx); }
        if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); }
        // 바닥 복귀
        if (ball.y > gs.H - r) {
          if (gs.returnX === null) gs.returnX = ball.x;
          gs.balls.splice(i, 1);
          continue;
        }
        // 아이템 수집
        for (let k = gs.items.length - 1; k >= 0; k--) {
          const it = gs.items[k];
          const ix = it.col * gs.cell + gs.cell / 2;
          const iy = it.row * gs.cell + gs.cell / 2;
          const dx = ball.x - ix;
          const dy = ball.y - iy;
          if (dx * dx + dy * dy < (gs.cell * 0.28) ** 2) {
            gs.items.splice(k, 1);
            gs.pendingAdd += 1;
          }
        }
        // 벽돌 충돌 (한 substep 당 한 벽돌만 처리)
        for (let k = 0; k < gs.bricks.length; k++) {
          const br = gs.bricks[k];
          const left = br.col * gs.cell + gs.cell * 0.04;
          const top = br.row * gs.cell + gs.cell * 0.04;
          const right = left + gs.cell * 0.92;
          const bottom = top + gs.cell * 0.92;
          const nx = Math.max(left, Math.min(ball.x, right));
          const ny = Math.max(top, Math.min(ball.y, bottom));
          const dx = ball.x - nx;
          const dy = ball.y - ny;
          if (dx * dx + dy * dy < r * r) {
            br.hp -= 1;
            if (Math.abs(dx) > Math.abs(dy)) {
              ball.vx = dx >= 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
              ball.x += ball.vx >= 0 ? r : -r;
            } else {
              ball.vy = dy >= 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
              ball.y += ball.vy >= 0 ? r : -r;
            }
            if (br.hp <= 0) {
              gs.bricks.splice(k, 1);
              gs.bricksBroken += 1;
            }
            break;
          }
        }
      }
    }

    // 턴 종료
    if (gs.phase === "fire" && gs.toFire === 0 && gs.balls.length === 0) {
      endTurn(gs);
    }
  }, [endTurn]);

  const draw = useCallback((gs: GameState, ctx: CanvasRenderingContext2D) => {
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim() || "#2f6bff";
    const fg = style.getPropertyValue("--foreground").trim() || "#111";
    const border = style.getPropertyValue("--border").trim() || "#ddd";
    ctx.clearRect(0, 0, gs.W, gs.H);

    // 발사선
    const overLine = gs.launchY - gs.cell * 0.6;
    ctx.strokeStyle = border;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, overLine);
    ctx.lineTo(gs.W, overLine);
    ctx.stroke();
    ctx.setLineDash([]);

    // 벽돌
    for (const br of gs.bricks) {
      const x = br.col * gs.cell + gs.cell * 0.04;
      const y = br.row * gs.cell + gs.cell * 0.04;
      const sz = gs.cell * 0.92;
      const t = Math.min(1, br.hp / (gs.rounds + 3));
      ctx.fillStyle = `hsl(${210 - t * 200}, 70%, ${60 - t * 15}%)`;
      ctx.beginPath();
      ctx.roundRect(x, y, sz, sz, gs.cell * 0.12);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.floor(gs.cell * 0.32)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(br.hp), x + sz / 2, y + sz / 2);
    }

    // 아이템(+1 공)
    for (const it of gs.items) {
      const ix = it.col * gs.cell + gs.cell / 2;
      const iy = it.row * gs.cell + gs.cell / 2;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ix, iy, gs.cell * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = `bold ${Math.floor(gs.cell * 0.26)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+1", ix, iy);
    }

    // 공
    ctx.fillStyle = accent;
    for (const ball of gs.balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, gs.ballR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 조준 가이드
    if (gs.phase === "aim" && gs.aimDir) {
      ctx.strokeStyle = accent;
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gs.launchX, gs.launchY);
      ctx.lineTo(
        gs.launchX + gs.aimDir.x * gs.cell * 4,
        gs.launchY + gs.aimDir.y * gs.cell * 4,
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 발사 지점
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(gs.launchX, gs.launchY, gs.ballR * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // 메인 루프
  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const W = Math.min(parent?.clientWidth ?? 360, 420);
    const H = Math.round(W * 1.4);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const gs = init(W, H);
    gsRef.current = gs;
    overRef.current = false;
    setHud({ rounds: gs.rounds, balls: gs.ballCount, bricks: gs.bricksBroken, phase: gs.phase });

    const loop = () => {
      if (gs.phase === "fire") stepPhysics(gs);
      draw(gs, ctx);
      // HUD 동기화(값이 바뀔 때만)
      setHud((prev) =>
        prev.rounds === gs.rounds &&
        prev.balls === gs.ballCount &&
        prev.bricks === gs.bricksBroken &&
        prev.phase === gs.phase
          ? prev
          : { rounds: gs.rounds, balls: gs.ballCount, bricks: gs.bricksBroken, phase: gs.phase },
      );
      if (gs.phase === "over" && !overRef.current) {
        overRef.current = true;
        onGameOver({ rounds: gs.rounds, bricks: gs.bricksBroken });
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, init, stepPhysics, draw, onGameOver]);

  // 조준 입력
  const aimFrom = useCallback((clientX: number, clientY: number) => {
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    if (!gs || !canvas || gs.phase !== "aim") return;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const dx = px - gs.launchX;
    let dy = py - gs.launchY;
    // 항상 위쪽으로만 발사 (dy<0), 너무 수평이면 클램프
    if (dy > -gs.cell * 0.3) dy = -gs.cell * 0.3;
    const len = Math.hypot(dx, dy) || 1;
    gs.aimDir = { x: dx / len, y: dy / len };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    aimFrom(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    aimFrom(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim" || !gs.aimDir) return;
    gs.phase = "fire";
    gs.toFire = gs.ballCount;
    gs.fireTimer = 0;
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-full max-w-[420px] items-center justify-between text-xs">
        <span className="rounded-lg bg-[var(--surface)] px-2.5 py-1 font-semibold">
          라운드 {hud.rounds}
        </span>
        <span className="rounded-lg bg-[var(--surface)] px-2.5 py-1 font-semibold">
          🔵 공 {hud.balls}
        </span>
        <span className="rounded-lg bg-[var(--surface)] px-2.5 py-1 font-semibold">
          벽돌 {hud.bricks}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="touch-none rounded-2xl border border-[var(--border)] bg-[var(--background)]"
      />
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        {hud.phase === "aim"
          ? "아래 판을 스와이프해 각도를 조준하고 손을 떼면 발사됩니다."
          : hud.phase === "fire"
            ? "공이 굴러가는 중…"
            : "게임 종료!"}
      </p>
    </div>
  );
}
