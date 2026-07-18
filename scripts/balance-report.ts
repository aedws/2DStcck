/**
 * 밸런스 실측 — 이벤트(뉴스) 없이 기저 시장(드리프트·변동성·베타·국면/사이클/위기)만
 * N세션 결정론 리플레이해 종목·ETF·섹터의 총수익률·세션변동성·최대낙폭을 집계한다.
 * 손으로 잡은 수치가 의도한 리스크-리턴 스펙트럼을 만드는지 확인하는 용도.
 *
 *   npx tsx scripts/balance-report.ts [세션수]
 */
import { createGenesisStocks, replayMarket } from "../src/lib/market/localSim";
import { STOCK_DEFINITIONS } from "../src/data/stocks";
import { SESSION_DURATION_MS, SIM_TICK_MS } from "../src/lib/market/constants";

const SESSIONS = Number(process.argv[2] ?? 200);
const SESSION_TICKS = SESSION_DURATION_MS / SIM_TICK_MS;

const defById = new Map(STOCK_DEFINITIONS.map((d) => [d.id, d]));

// 세션별 종가 시계열 수집
let stocks = createGenesisStocks();
const series = new Map<string, number[]>();
for (const s of stocks) series.set(s.id, [s.currentPrice]);

for (let session = 1; session <= SESSIONS; session++) {
  const from = (session - 1) * SESSION_TICKS;
  const to = session * SESSION_TICKS;
  stocks = replayMarket(stocks, [], from, to).stocks;
  for (const s of stocks) series.get(s.id)?.push(s.currentPrice);
}

interface Row {
  id: string;
  sector: string;
  beta: number;
  totalReturn: number; // %
  vol: number; // 세션 로그수익률 표준편차 %
  maxDrawdown: number; // %
}

function analyze(prices: number[]): Omit<Row, "id" | "sector" | "beta"> {
  const first = prices[0];
  const last = prices[prices.length - 1];
  const totalReturn = (last / first - 1) * 100;
  // 세션 로그수익률
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) rets.push(Math.log(prices[i] / prices[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const vol = Math.sqrt(variance) * 100;
  // 최대낙폭
  let peak = prices[0];
  let maxDd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (p / peak - 1) * 100;
    if (dd < maxDd) maxDd = dd;
  }
  return { totalReturn, vol, maxDrawdown: maxDd };
}

const rows: Row[] = [];
for (const [id, prices] of series) {
  const def = defById.get(id);
  if (!def) continue;
  rows.push({
    id,
    sector: def.sector,
    beta: def.beta ?? 0,
    ...analyze(prices),
  });
}

const fmt = (n: number, w = 8) => n.toFixed(1).padStart(w);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

console.log(`\n=== 밸런스 실측: ${SESSIONS}세션 (이벤트 없음, 기저 시장만) ===\n`);

// 섹터별 요약
const bySector = new Map<string, Row[]>();
for (const r of rows) {
  if (["지수", "선물"].includes(r.sector)) continue;
  (bySector.get(r.sector) ?? bySector.set(r.sector, []).get(r.sector)!).push(r);
}
console.log("[섹터별 평균]  종목수  총수익  변동성  최대낙폭  평균β");
const sectorRows = [...bySector.entries()]
  .map(([sector, rs]) => {
    const avg = (f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    return { sector, n: rs.length, ret: avg((r) => r.totalReturn), vol: avg((r) => r.vol), dd: avg((r) => r.maxDrawdown), beta: avg((r) => r.beta) };
  })
  .sort((a, b) => b.beta - a.beta);
for (const s of sectorRows) {
  console.log(`${s.sector.padEnd(12)} ${String(s.n).padStart(4)}  ${fmt(s.ret)}  ${fmt(s.vol)}  ${fmt(s.dd)}  ${s.beta.toFixed(2).padStart(6)}`);
}

// ETF 별도
console.log("\n[주요 ETF]");
for (const id of ["baspy", "baqqq", "semix", "divx", "bndx", "pmcx"]) {
  const r = rows.find((x) => x.id === id);
  if (r) console.log(`${id.toUpperCase().padEnd(8)} 총수익 ${pct(r.totalReturn).padStart(8)}  변동성 ${r.vol.toFixed(1)}%  최대낙폭 ${pct(r.maxDrawdown)}`);
}

// 벤치마크
const bench = rows.find((x) => x.id === "vnasdaq");
if (bench) console.log(`\n[벤치마크 V-NASDAQ] 총수익 ${pct(bench.totalReturn)}  변동성 ${bench.vol.toFixed(1)}%  최대낙폭 ${pct(bench.maxDrawdown)}`);

// 이상치 (극단 수익/낙폭)
console.log("\n[이상치 점검]");
const equities = rows.filter((r) => !["지수", "선물", "ETF", "채권"].includes(r.sector));
const sortedRet = [...equities].sort((a, b) => b.totalReturn - a.totalReturn);
console.log("  최고 수익 3:", sortedRet.slice(0, 3).map((r) => `${r.id}(${pct(r.totalReturn)})`).join(", "));
console.log("  최저 수익 3:", sortedRet.slice(-3).map((r) => `${r.id}(${pct(r.totalReturn)})`).join(", "));
const worstDd = [...equities].sort((a, b) => a.maxDrawdown - b.maxDrawdown).slice(0, 3);
console.log("  최대 낙폭 3:", worstDd.map((r) => `${r.id}(${pct(r.maxDrawdown)})`).join(", "));

// 새 종목 집중 점검
console.log("\n[신규 종목 점검]");
for (const id of ["aeyvn", "nkmna", "wwmne", "wwlcl", "nkccl", "nkilg", "aegil", "wwlne", "ersua"]) {
  const r = rows.find((x) => x.id === id);
  if (r) console.log(`  ${id.padEnd(7)} ${r.sector.padEnd(12)} β${r.beta.toFixed(2)}  총수익 ${pct(r.totalReturn).padStart(8)}  변동성 ${r.vol.toFixed(1)}%  낙폭 ${pct(r.maxDrawdown)}`);
}
console.log("");
