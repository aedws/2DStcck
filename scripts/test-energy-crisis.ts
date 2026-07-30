import assert from "node:assert/strict";
import { SESSION_DURATION_MS } from "../src/lib/market/constants";
import {
  crisisReturnForStock,
  getActiveMarketCrisis,
  getMarketCrisisWindow,
} from "../src/lib/market/marketCrises";

const energyCrisis = getMarketCrisisWindow(4);
const energyCrash = getActiveMarketCrisis(energyCrisis.startSession + 3)!;
assert.equal(energyCrash.theme.id, "energy-shock");
assert.ok(
  crisisReturnForStock(
    energyCrash,
    { id: "carrot", sector: "식품·외식", beta: 0.72 },
    SESSION_DURATION_MS / 1_000,
  ) > 0,
  "에너지 공급망 충격에서 CROT는 상방 압력을 받아야 합니다.",
);

const energyLastSession = getActiveMarketCrisis(energyCrisis.endSession - 1)!;
assert.notEqual(
  crisisReturnForStock(
    energyLastSession,
    { sector: "기술", beta: 1 },
    SESSION_DURATION_MS / 1_000,
  ),
  0,
);
assert.equal(
  crisisReturnForStock(
    energyLastSession,
    { sector: "기술", beta: 1 },
    SESSION_DURATION_MS / 1_000,
    [
      {
        id: "carrot-bumper-crop",
        tag: "대풍작",
        timestamp: energyCrisis.startSession * SESSION_DURATION_MS,
      },
    ],
  ),
  0,
  "대풍작 1회는 에너지 충격 효과를 1거래일 단축해야 합니다.",
);

console.log("energy crisis scenarios passed");
