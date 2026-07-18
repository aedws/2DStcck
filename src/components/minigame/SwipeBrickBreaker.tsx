"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BALL_GRADE_DESC,
  BALL_GRADE_LABEL,
  BALL_PRICE,
  COIN_PER_BRICK,
  COIN_PER_ROUND,
  type BallGrade,
} from "@/lib/market/minigame";

/**
 * 스와이프 벽돌깨기 (Ballz 계열 + 등급 공 로그라이트).
 * 벽돌을 깨면 코인·점수가 오르고, 코인으로 공을 N/S/SS 등급으로 사서 화력을 키운다.
 * N=단일, S=주변 광역, SS=가로·세로 십자 데미지. 물리는 canvas + rAF 로 직접 구현하고
 * 상태는 리렌더를 피하려 ref 에 둔다. 게임오버 시 최종 점수를 넘겨준다.
 */

const COLS = 7;
const BALL_SPEED = 0.34;
const SUBSTEPS = 3;
const FIRE_INTERVAL_FRAMES = 4;

const GRADE_COLOR: Record<BallGrade, string> = {
  N: "#3b82f6",
  S: "#a855f7",
  SS: "#f59e0b",
};

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grade: BallGrade;
  trail: { x: number; y: number }[];
}
interface Brick {
  col: number;
  row: number;
  hp: number;
  flash: number;
  flashColor: string;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Floater {
  x: number;
  y: number;
  life: number;
  text: string;
  color: string;
}
interface Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  max: number;
  color: string;
}
interface Beam {
  kind: "h" | "v";
  pos: number; // 중심 좌표(가로 빔=y, 세로 빔=x)
  half: number; // 반두께
  life: number;
  max: number;
  color: string;
}

interface GameState {
  W: number;
  H: number;
  cell: number;
  ballR: number;
  rows: number;
  launchX: number;
  launchY: number;
  arsenal: Record<BallGrade, number>;
  coins: number;
  score: number;
  rounds: number;
  bricksBroken: number;
  phase: "aim" | "fire" | "over";
  balls: Ball[];
  bricks: Brick[];
  particles: Particle[];
  floaters: Floater[];
  shockwaves: Shockwave[];
  beams: Beam[];
  toFire: BallGrade[];
  fireTimer: number;
  aimDir: { x: number; y: number } | null;
  returnX: number | null;
}

interface Hud {
  rounds: number;
  coins: number;
  score: number;
  arsenal: Record<BallGrade, number>;
  phase: GameState["phase"];
}

function brickCenter(gs: GameState, br: Brick) {
  return {
    x: br.col * gs.cell + gs.cell / 2,
    y: br.row * gs.cell + gs.cell / 2,
  };
}

function damageBrick(gs: GameState, br: Brick, color: string) {
  br.flash = 8;
  br.flashColor = color;
  br.hp -= 1;
  if (br.hp <= 0) {
    const idx = gs.bricks.indexOf(br);
    if (idx >= 0) gs.bricks.splice(idx, 1);
    gs.bricksBroken += 1;
    gs.coins += COIN_PER_BRICK;
    gs.score += COIN_PER_BRICK;
    // 파편 파티클 + 코인 팝업
    const { x, y } = brickCenter(gs, br);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      const sp = gs.cell * (0.06 + Math.random() * 0.1);
      gs.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 26,
        max: 26,
        color,
        size: gs.cell * (0.08 + Math.random() * 0.08),
      });
    }
    gs.floaters.push({
      x,
      y,
      life: 34,
      text: `+${COIN_PER_BRICK.toLocaleString()}`,
      color,
    });
  }
}

function applyGradeDamage(gs: GameState, grade: BallGrade, hit: Brick) {
  const color = GRADE_COLOR[grade];
  const { x: hx, y: hy } = brickCenter(gs, hit);
  const targets = new Set<Brick>([hit]);
  if (grade === "S") {
    for (const b of gs.bricks) {
      if (Math.abs(b.col - hit.col) <= 1 && Math.abs(b.row - hit.row) <= 1) {
        targets.add(b);
      }
    }
    // 광역 충격파(3×3 범위를 덮는 링)
    gs.shockwaves.push({
      x: hx,
      y: hy,
      r: gs.cell * 0.4,
      maxR: gs.cell * 1.6,
      life: 16,
      max: 16,
      color,
    });
  } else if (grade === "SS") {
    for (const b of gs.bricks) {
      if (b.col === hit.col || b.row === hit.row) targets.add(b);
    }
    // 십자 빔(가로 행 + 세로 열 전체)
    gs.beams.push({ kind: "h", pos: hy, half: gs.cell * 0.5, life: 16, max: 16, color });
    gs.beams.push({ kind: "v", pos: hx, half: gs.cell * 0.5, life: 16, max: 16, color });
  }
  for (const t of targets) damageBrick(gs, t, color);
}

function updateEffects(gs: GameState) {
  for (let i = gs.particles.length - 1; i >= 0; i--) {
    const p = gs.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += gs.cell * 0.006; // 약한 중력
    p.life -= 1;
    if (p.life <= 0) gs.particles.splice(i, 1);
  }
  for (let i = gs.floaters.length - 1; i >= 0; i--) {
    const f = gs.floaters[i];
    f.y -= gs.cell * 0.02;
    f.life -= 1;
    if (f.life <= 0) gs.floaters.splice(i, 1);
  }
  for (let i = gs.shockwaves.length - 1; i >= 0; i--) {
    const w = gs.shockwaves[i];
    w.r += (w.maxR - w.r) * 0.25;
    w.life -= 1;
    if (w.life <= 0) gs.shockwaves.splice(i, 1);
  }
  for (let i = gs.beams.length - 1; i >= 0; i--) {
    gs.beams[i].life -= 1;
    if (gs.beams[i].life <= 0) gs.beams.splice(i, 1);
  }
  for (const b of gs.bricks) if (b.flash > 0) b.flash -= 1;
}

export function SwipeBrickBreaker({
  onGameOver,
  running,
}: {
  onGameOver: (result: { rounds: number; bricks: number; score: number }) => void;
  running: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gsRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const overRef = useRef(false);
  const [hud, setHud] = useState<Hud>({
    rounds: 1,
    coins: 0,
    score: 0,
    arsenal: { N: 1, S: 0, SS: 0 },
    phase: "aim",
  });

  const brickHpForRound = (round: number) =>
    Math.max(1, Math.round(round * 0.7) + Math.floor(Math.random() * 2));

  const spawnRow = useCallback((gs: GameState) => {
    let placed = 0;
    const cols = [...Array(COLS).keys()].sort(() => Math.random() - 0.5);
    for (const col of cols) {
      if (Math.random() < 0.62) {
        gs.bricks.push({ col, row: 0, hp: brickHpForRound(gs.rounds), flash: 0, flashColor: "#fff" });
        placed++;
      }
    }
    if (placed === 0) {
      gs.bricks.push({
        col: Math.floor(Math.random() * COLS),
        row: 0,
        hp: brickHpForRound(gs.rounds),
        flash: 0,
        flashColor: "#fff",
      });
    }
  }, []);

  const syncHud = useCallback((gs: GameState) => {
    setHud((prev) =>
      prev.rounds === gs.rounds &&
      prev.coins === gs.coins &&
      prev.score === gs.score &&
      prev.phase === gs.phase &&
      prev.arsenal.N === gs.arsenal.N &&
      prev.arsenal.S === gs.arsenal.S &&
      prev.arsenal.SS === gs.arsenal.SS
        ? prev
        : {
            rounds: gs.rounds,
            coins: gs.coins,
            score: gs.score,
            arsenal: { ...gs.arsenal },
            phase: gs.phase,
          },
    );
  }, []);

  const init = useCallback(
    (W: number, H: number): GameState => {
      const cell = W / COLS;
      const gs: GameState = {
        W,
        H,
        cell,
        ballR: cell * 0.11,
        rows: Math.max(6, Math.floor(H / cell)),
        launchX: W / 2,
        launchY: H - cell * 0.5,
        arsenal: { N: 1, S: 0, SS: 0 },
        coins: 0,
        score: 0,
        rounds: 1,
        bricksBroken: 0,
        phase: "aim",
        balls: [],
        bricks: [],
        particles: [],
        floaters: [],
        shockwaves: [],
        beams: [],
        toFire: [],
        fireTimer: 0,
        aimDir: null,
        returnX: null,
      };
      spawnRow(gs);
      return gs;
    },
    [spawnRow],
  );

  const endTurn = useCallback(
    (gs: GameState) => {
      gs.launchX = gs.returnX ?? gs.launchX;
      gs.returnX = null;
      gs.rounds += 1;
      gs.coins += COIN_PER_ROUND;
      gs.score += COIN_PER_ROUND;
      for (const b of gs.bricks) b.row += 1;
      spawnRow(gs);
      const overLine = gs.launchY - gs.cell * 0.6;
      gs.phase = gs.bricks.some((b) => (b.row + 1) * gs.cell >= overLine)
        ? "over"
        : "aim";
    },
    [spawnRow],
  );

  const stepPhysics = useCallback(
    (gs: GameState) => {
      if (gs.toFire.length > 0 && gs.aimDir) {
        gs.fireTimer -= 1;
        if (gs.fireTimer <= 0) {
          const grade = gs.toFire.shift()!;
          gs.balls.push({
            x: gs.launchX,
            y: gs.launchY,
            vx: gs.aimDir.x * gs.cell * BALL_SPEED,
            vy: gs.aimDir.y * gs.cell * BALL_SPEED,
            grade,
            trail: [],
          });
          gs.fireTimer = FIRE_INTERVAL_FRAMES;
        }
      }

      const r = gs.ballR;
      // 프레임당 잔상 기록
      for (const ball of gs.balls) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 6) ball.trail.shift();
      }
      for (let s = 0; s < SUBSTEPS; s++) {
        for (let i = gs.balls.length - 1; i >= 0; i--) {
          const ball = gs.balls[i];
          ball.x += ball.vx / SUBSTEPS;
          ball.y += ball.vy / SUBSTEPS;
          if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx); }
          if (ball.x > gs.W - r) { ball.x = gs.W - r; ball.vx = -Math.abs(ball.vx); }
          if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); }
          if (ball.y > gs.H - r) {
            if (gs.returnX === null) gs.returnX = ball.x;
            gs.balls.splice(i, 1);
            continue;
          }
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
              if (Math.abs(dx) > Math.abs(dy)) {
                ball.vx = dx >= 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
                ball.x += ball.vx >= 0 ? r : -r;
              } else {
                ball.vy = dy >= 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
                ball.y += ball.vy >= 0 ? r : -r;
              }
              applyGradeDamage(gs, ball.grade, br);
              break;
            }
          }
        }
      }

      if (gs.phase === "fire" && gs.toFire.length === 0 && gs.balls.length === 0) {
        endTurn(gs);
      }
    },
    [endTurn],
  );

  const draw = useCallback((gs: GameState, ctx: CanvasRenderingContext2D) => {
    const style = getComputedStyle(document.documentElement);
    const fg = style.getPropertyValue("--foreground").trim() || "#111";
    const border = style.getPropertyValue("--border").trim() || "#ddd";
    ctx.clearRect(0, 0, gs.W, gs.H);

    const overLine = gs.launchY - gs.cell * 0.6;
    ctx.strokeStyle = border;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, overLine);
    ctx.lineTo(gs.W, overLine);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const br of gs.bricks) {
      const x = br.col * gs.cell + gs.cell * 0.04;
      const y = br.row * gs.cell + gs.cell * 0.04;
      const sz = gs.cell * 0.92;
      const t = Math.min(1, br.hp / (gs.rounds + 3));
      ctx.fillStyle = `hsl(${210 - t * 200}, 70%, ${60 - t * 15}%)`;
      ctx.beginPath();
      ctx.roundRect(x, y, sz, sz, gs.cell * 0.12);
      ctx.fill();
      if (br.flash > 0) {
        ctx.globalAlpha = (br.flash / 8) * 0.75;
        ctx.fillStyle = br.flashColor;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.floor(gs.cell * 0.32)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(br.hp), x + sz / 2, y + sz / 2);
    }

    // 십자 빔(SS)
    for (const bm of gs.beams) {
      ctx.globalAlpha = Math.max(0, (bm.life / bm.max) * 0.5);
      ctx.fillStyle = bm.color;
      if (bm.kind === "h") {
        ctx.fillRect(0, bm.pos - bm.half, gs.W, bm.half * 2);
      } else {
        ctx.fillRect(bm.pos - bm.half, 0, bm.half * 2, gs.H);
      }
    }
    // 광역 충격파(S)
    for (const w of gs.shockwaves) {
      ctx.globalAlpha = Math.max(0, (w.life / w.max) * 0.8);
      ctx.strokeStyle = w.color;
      ctx.lineWidth = gs.cell * 0.1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 공 잔상
    for (const ball of gs.balls) {
      for (let i = 0; i < ball.trail.length; i++) {
        const p = ball.trail[i];
        ctx.globalAlpha = ((i + 1) / (ball.trail.length + 1)) * 0.35;
        ctx.fillStyle = GRADE_COLOR[ball.grade];
        ctx.beginPath();
        ctx.arc(p.x, p.y, gs.ballR * (0.5 + (i / ball.trail.length) * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 파편 파티클
    for (const p of gs.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const ball of gs.balls) {
      ctx.fillStyle = GRADE_COLOR[ball.grade];
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, gs.ballR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 코인 팝업
    for (const f of gs.floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 20));
      ctx.fillStyle = f.color;
      ctx.font = `bold ${Math.floor(gs.cell * 0.22)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (gs.phase === "aim" && gs.aimDir) {
      ctx.strokeStyle = GRADE_COLOR.N;
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

    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(gs.launchX, gs.launchY, gs.ballR * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

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
    syncHud(gs);

    const loop = () => {
      if (gs.phase === "fire") stepPhysics(gs);
      updateEffects(gs);
      draw(gs, ctx);
      syncHud(gs);
      if (gs.phase === "over" && !overRef.current) {
        overRef.current = true;
        onGameOver({ rounds: gs.rounds, bricks: gs.bricksBroken, score: gs.score });
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, init, stepPhysics, draw, syncHud, onGameOver]);

  const aimFrom = useCallback((clientX: number, clientY: number) => {
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    if (!gs || !canvas || gs.phase !== "aim") return;
    const rect = canvas.getBoundingClientRect();
    const dx = clientX - rect.left - gs.launchX;
    let dy = clientY - rect.top - gs.launchY;
    if (dy > -gs.cell * 0.3) dy = -gs.cell * 0.3;
    const len = Math.hypot(dx, dy) || 1;
    gs.aimDir = { x: dx / len, y: dy / len };
  }, []);

  const onPointerUp = () => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim" || !gs.aimDir) return;
    const queue: BallGrade[] = [
      ...Array<BallGrade>(gs.arsenal.N).fill("N"),
      ...Array<BallGrade>(gs.arsenal.S).fill("S"),
      ...Array<BallGrade>(gs.arsenal.SS).fill("SS"),
    ];
    if (queue.length === 0) return;
    gs.toFire = queue;
    gs.fireTimer = 0;
    gs.phase = "fire";
  };

  const buyBall = (grade: BallGrade) => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim") return;
    if (gs.coins < BALL_PRICE[grade]) return;
    gs.coins -= BALL_PRICE[grade];
    gs.arsenal[grade] += 1;
    syncHud(gs);
  };

  const totalBalls = hud.arsenal.N + hud.arsenal.S + hud.arsenal.SS;

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 grid w-full max-w-[420px] grid-cols-3 gap-1.5 text-xs">
        <span className="rounded-lg bg-[var(--surface)] px-2 py-1 text-center font-semibold">
          라운드 {hud.rounds}
        </span>
        <span className="rounded-lg bg-[var(--surface)] px-2 py-1 text-center font-semibold">
          🪙 {hud.coins.toLocaleString()}
        </span>
        <span className="rounded-lg bg-[var(--surface)] px-2 py-1 text-center font-semibold">
          점수 {hud.score.toLocaleString()}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={(e) => aimFrom(e.clientX, e.clientY)}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === "mouse") return;
          aimFrom(e.clientX, e.clientY);
        }}
        onPointerUp={onPointerUp}
        className="touch-none rounded-2xl border border-[var(--border)] bg-[var(--background)]"
      />

      {/* 공 상점 (조준 단계에서만) */}
      <div className="mt-3 grid w-full max-w-[420px] grid-cols-3 gap-1.5">
        {(["N", "S", "SS"] as BallGrade[]).map((g) => {
          const affordable = hud.coins >= BALL_PRICE[g] && hud.phase === "aim";
          return (
            <button
              key={g}
              type="button"
              onClick={() => buyBall(g)}
              disabled={!affordable}
              title={BALL_GRADE_DESC[g]}
              className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-1 py-2 transition enabled:hover:border-[var(--accent)] disabled:opacity-40"
            >
              <span
                className="flex items-center gap-1 text-sm font-bold"
                style={{ color: GRADE_COLOR[g] }}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: GRADE_COLOR[g] }}
                />
                {g}
              </span>
              <span className="text-[10px] text-[var(--muted)]">
                {BALL_GRADE_LABEL[g]} · 보유 {hud.arsenal[g]}
              </span>
              <span className="mt-0.5 text-[11px] font-semibold">
                🪙 {BALL_PRICE[g].toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] leading-relaxed text-[var(--muted)]">
        {hud.phase === "aim"
          ? `판을 스와이프해 조준·발사. 공 ${totalBalls}개 · 코인으로 N(단일)·S(광역)·SS(십자) 공을 사서 화력을 키우세요.`
          : hud.phase === "fire"
            ? "공이 굴러가는 중…"
            : "게임 종료!"}
      </p>
    </div>
  );
}
