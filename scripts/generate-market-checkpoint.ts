import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compactMarketCheckpoint,
  getBundledMarketCheckpoint,
  hydrateMarketCheckpoint,
} from "../src/lib/market/marketCheckpoint";
import { currentSimTick, replayMarket } from "../src/lib/market/localSim";
import { setLiquidityInterventions } from "../src/lib/market/liquidityInterventions";
import { listPublicLiquidityInterventions } from "../src/lib/supabase/liquidityInterventions";

async function main() {
  // 배포·일일 갱신 체크포인트도 이미 성공한 공동 위기 진화를 포함해야, 새 접속자와
  // 오래 열린 탭의 공통 시세가 갈라지지 않는다. 원장이 아직 배포되지 않았거나
  // 일시적으로 오프라인이면 빈 목록으로 안전하게 기존 결정론 경로를 유지한다.
  setLiquidityInterventions(await listPublicLiquidityInterventions());

  const targetTick = currentSimTick();
  const base = hydrateMarketCheckpoint(getBundledMarketCheckpoint());
  let stocks = base.stocks;
  let events = base.events;
  let tick = base.tick;

  while (tick < targetTick) {
    const nextTick = Math.min(targetTick, tick + 30_000);
    const replayed = replayMarket(stocks, events, tick, nextTick);
    stocks = replayed.stocks;
    events = replayed.events;
    tick = nextTick;
    console.log(`market checkpoint ${tick}/${targetTick}`);
  }

  // 앱 번들에는 부팅에 필요한 최근 구간만 싣는다. 일봉 보존 구간은 모바일 번들
  // 1MiB 예산에 맞춰 40거래일로 둔다(런타임은 이후 계속 누적).
  const checkpoint = compactMarketCheckpoint(stocks, events, tick, 40);
  const outputPath = resolve(process.cwd(), "src/data/market-checkpoint.json");
  writeFileSync(outputPath, `${JSON.stringify(checkpoint)}\n`, "utf8");
  console.log(`wrote ${outputPath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
