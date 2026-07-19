/**
 * 스켈핑 차트 보조 시각 검증 — 실제 시세를 결정론 리플레이하고, 앱과 똑같은
 * chartIndicators 함수로 EMA·VWAP·볼린저·거래량을 계산해 SVG 한 장으로 그린다.
 * 브라우저 없이 순수 계산→SVG라 재현 가능하고 안정적이다.
 *
 *   npx tsx scripts/render-chart-preview.ts > scratchpad/chart-preview.svg
 */
import { createGenesisStocks, replayMarket } from "../src/lib/market/localSim";
import { SESSION_DURATION_MS, SIM_TICK_MS } from "../src/lib/market/constants";
import type { Candle, StockState } from "../src/lib/types/market";
import {
  bollingerBands,
  candleVolumes,
  exponentialMovingAverage,
  simpleMovingAverage,
  volumeWeightedAveragePrice,
} from "../src/lib/market/chartIndicators";

const SESSION_TICKS = SESSION_DURATION_MS / SIM_TICK_MS;
const WARMUP_SESSIONS = 4;
const BAR_COUNT = 160; // 마지막 160개 30초봉 ≈ 80분(1.3 거래일)

// ── 리플레이 ──
let stocks = createGenesisStocks();
for (let session = 1; session <= WARMUP_SESSIONS; session++) {
  stocks = replayMarket(stocks, [], (session - 1) * SESSION_TICKS, session * SESSION_TICKS).stocks;
}

const byId = new Map(stocks.map((s) => [s.id, s]));
const futures = stocks.find((s) => s.sector === "선물");

// 읽기 좋은 스윙(마지막 BAR_COUNT봉 고저 스프레드 8~16%)에 가장 가까운 종목 자동 선택
function lastBars(s: StockState): Candle[] {
  return (s.candles ?? []).slice(-BAR_COUNT);
}
function spreadPct(cs: Candle[]): number {
  if (cs.length === 0) return 0;
  const hi = Math.max(...cs.map((c) => c.high));
  const lo = Math.min(...cs.map((c) => c.low));
  return lo > 0 ? (hi / lo - 1) * 100 : 0;
}
const candidates = stocks.filter(
  (s) =>
    s.sector !== "ETF" &&
    s.sector !== "지수" &&
    s.sector !== "선물" &&
    s.sector !== "채권" &&
    lastBars(s).length >= BAR_COUNT,
);
// 가장 많이 움직인 종목(스프레드 최대)을 골라 지표가 또렷이 보이게 한다.
candidates.sort((a, b) => spreadPct(lastBars(b)) - spreadPct(lastBars(a)));
const pick = candidates[0] ?? stocks[0];
const candles = lastBars(pick);

// ── 지표 계산 (앱과 동일한 함수) ──
const ema9 = exponentialMovingAverage(candles, 9);
const ema20 = exponentialMovingAverage(candles, 20);
const sma5 = simpleMovingAverage(candles, 5);
const vwap = volumeWeightedAveragePrice(candles, SESSION_DURATION_MS);
const boll = bollingerBands(candles, 20, 2);
const vols = candleVolumes(candles);

// ── 선물 선행 뱃지 값 ──
function futuresMomentum(f: StockState): number | null {
  const h = f.priceHistory;
  if (!h || h.length < 2) return null;
  const last = h[h.length - 1];
  const target = last.timestamp - 60_000;
  let past = h[0];
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].timestamp <= target) {
      past = h[i];
      break;
    }
  }
  return past.price > 0 ? (last.price - past.price) / past.price : null;
}
const mom = futures ? futuresMomentum(futures) : null;

// ── SVG 좌표 ──
const W = 1040;
const padL = 8;
const padR = 74;
const padT = 64;
const mainH = 360;
const volH = 90;
const gap = 22;
const axisH = 26;
const H = padT + mainH + gap + volH + axisH + 70;
const plotW = W - padL - padR;
const n = candles.length;
const barW = plotW / n;
const bodyW = Math.max(1.5, barW * 0.62);

const highs = candles.map((c) => c.high);
const lows = candles.map((c) => c.low);
let pMax = Math.max(...highs, ...boll.map((b) => b.upper));
let pMin = Math.min(...lows, ...boll.map((b) => b.lower));
const padP = (pMax - pMin) * 0.06;
pMax += padP;
pMin -= padP;
const volMax = Math.max(...vols.map((v) => v.volume), 1);

const xAt = (i: number) => padL + i * barW + barW / 2;
const yAt = (p: number) => padT + ((pMax - p) / (pMax - pMin)) * mainH;
const volY = (v: number) => padT + mainH + gap + (1 - v / volMax) * volH;
const fmt$ = (cents: number) => "$" + (cents / 100).toFixed(2);

// 봉 인덱스 → 지표 타임스탬프 매핑(지표는 앞쪽이 잘려 시작 오프셋이 있음)
const tsIndex = new Map(candles.map((c, i) => [c.timestamp, i]));
function linePath(points: Array<{ timestamp: number; value: number }>): string {
  return points
    .map((pt) => {
      const i = tsIndex.get(pt.timestamp);
      if (i === undefined) return "";
      return `${xAt(i).toFixed(1)},${yAt(pt.value).toFixed(1)}`;
    })
    .filter(Boolean)
    .map((c, idx) => (idx === 0 ? `M${c}` : `L${c}`))
    .join(" ");
}

// ── 그리기 ──
const parts: string[] = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,'Apple SD Gothic Neo',sans-serif">`,
);
parts.push(`<rect width="${W}" height="${H}" fill="#0f141a"/>`);

// 제목
parts.push(
  `<text x="${padL + 4}" y="26" fill="#e5e9ef" font-size="16" font-weight="700">${pick.name} · ${pick.ticker} · 30초봉 (실제 리플레이)</text>`,
);
parts.push(
  `<text x="${padL + 4}" y="45" fill="#8b95a1" font-size="12">스켈핑 차트 보조 시각 검증 — 선은 전부 앱과 동일한 chartIndicators 함수로 계산</text>`,
);

// 볼린저 밴드 영역 채움
const bollUpperPath = linePath(boll.map((b) => ({ timestamp: b.timestamp, value: b.upper })));
const bollLowerPts = boll.map((b) => ({ timestamp: b.timestamp, value: b.lower }));
const bollLowerPathRev = bollLowerPts
  .slice()
  .reverse()
  .map((pt) => {
    const i = tsIndex.get(pt.timestamp);
    return i === undefined ? "" : `L${xAt(i).toFixed(1)},${yAt(pt.value).toFixed(1)}`;
  })
  .filter(Boolean)
  .join(" ");
if (bollUpperPath) {
  parts.push(
    `<path d="${bollUpperPath} ${bollLowerPathRev} Z" fill="rgba(129,140,248,0.10)" stroke="none"/>`,
  );
}

// 캔들
candles.forEach((c, i) => {
  const up = c.close >= c.open;
  const color = up ? "#f04452" : "#3182f6";
  const x = xAt(i);
  parts.push(
    `<line x1="${x.toFixed(1)}" y1="${yAt(c.high).toFixed(1)}" x2="${x.toFixed(1)}" y2="${yAt(c.low).toFixed(1)}" stroke="${color}" stroke-width="1"/>`,
  );
  const yo = yAt(c.open);
  const yc = yAt(c.close);
  const top = Math.min(yo, yc);
  const h = Math.max(1, Math.abs(yc - yo));
  parts.push(
    `<rect x="${(x - bodyW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>`,
  );
});

// 거래량 바
vols.forEach((v, i) => {
  const x = xAt(i);
  const y = volY(v.volume);
  const h = padT + mainH + gap + volH - y;
  const color = v.up ? "rgba(240,68,82,0.5)" : "rgba(49,130,246,0.5)";
  parts.push(
    `<rect x="${(x - bodyW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="${color}"/>`,
  );
});

// 오버레이 라인
const overlay = (path: string, color: string, dash = "", width = 2) =>
  path
    ? `<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`
    : "";
parts.push(overlay(linePath(boll.map((b) => ({ timestamp: b.timestamp, value: b.upper }))), "rgba(129,140,248,0.8)", "", 1));
parts.push(overlay(linePath(boll.map((b) => ({ timestamp: b.timestamp, value: b.middle }))), "rgba(129,140,248,0.5)", "3 3", 1));
parts.push(overlay(linePath(boll.map((b) => ({ timestamp: b.timestamp, value: b.lower }))), "rgba(129,140,248,0.8)", "", 1));
parts.push(overlay(linePath(sma5), "#f2b94b", "", 1.5));
parts.push(overlay(linePath(ema9), "#34d399"));
parts.push(overlay(linePath(ema20), "#fb7185"));
parts.push(overlay(linePath(vwap), "#eab308", "6 4"));

// 가격축 라벨 (5칸)
for (let k = 0; k <= 4; k++) {
  const p = pMin + ((pMax - pMin) * k) / 4;
  const y = yAt(p);
  parts.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" stroke="#1c2430" stroke-width="1"/>`);
  parts.push(`<text x="${padL + plotW + 6}" y="${(y + 4).toFixed(1)}" fill="#8b95a1" font-size="11">${fmt$(p)}</text>`);
}

// 시간축 (양끝 + 중앙, KST)
const kst = (ts: number) => {
  const d = new Date(ts + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
};
[0, Math.floor(n / 2), n - 1].forEach((i) => {
  parts.push(`<text x="${xAt(i).toFixed(1)}" y="${(padT + mainH + gap + volH + 16).toFixed(1)}" fill="#8b95a1" font-size="10" text-anchor="middle">${kst(candles[i].timestamp)}</text>`);
});
parts.push(`<text x="${padL + 2}" y="${(padT + mainH + gap + 12).toFixed(1)}" fill="#5b6570" font-size="10">거래량(결정론 가상)</text>`);

// 범례
const legend: Array<[string, string, string]> = [
  ["캔들 상승/하락", "#f04452", "#3182f6"],
  ["EMA 9", "#34d399", ""],
  ["EMA 20", "#fb7185", ""],
  ["VWAP", "#eab308", ""],
  ["볼린저 20·2σ", "rgba(129,140,248,0.9)", ""],
  ["이평5(SMA)", "#f2b94b", ""],
];
let lx = padL + 4;
const ly = H - 44;
legend.forEach(([label, c1, c2]) => {
  parts.push(`<rect x="${lx}" y="${ly - 9}" width="12" height="10" fill="${c1}"/>`);
  if (c2) parts.push(`<rect x="${lx + 13}" y="${ly - 9}" width="12" height="10" fill="${c2}"/>`);
  const tx = lx + (c2 ? 28 : 16);
  parts.push(`<text x="${tx}" y="${ly}" fill="#c3cad3" font-size="11">${label}</text>`);
  lx = tx + label.length * 8.5 + 20;
});

// 선물 선행 뱃지
if (mom !== null) {
  const rising = mom > 0.001;
  const falling = mom < -0.001;
  const arrow = rising ? "▲ 상승 우세" : falling ? "▼ 하락 우세" : "─ 방향 중립";
  const bc = rising ? "#f04452" : falling ? "#3182f6" : "#8b95a1";
  parts.push(`<text x="${padL + 4}" y="${H - 16}" fill="${bc}" font-size="13" font-weight="700">🔮 선물 ${arrow}  ${(mom * 100).toFixed(2)}%</text>`);
  parts.push(`<text x="${padL + 250}" y="${H - 16}" fill="#8b95a1" font-size="11">지수 90초 선행 · 선물 60초 모멘텀</text>`);
}

parts.push(`</svg>`);

process.stdout.write(parts.join("\n"));

// 콘솔에 요약(stderr)
console.error(
  `선택 종목: ${pick.name}(${pick.ticker}) 섹터 ${pick.sector} · ${n}봉 · 스프레드 ${spreadPct(candles).toFixed(1)}%\n` +
    `EMA9 ${ema9.length}점 · EMA20 ${ema20.length}점 · VWAP ${vwap.length}점 · 볼린저 ${boll.length}점\n` +
    `선물 모멘텀: ${mom === null ? "n/a" : (mom * 100).toFixed(2) + "%"}`,
);
