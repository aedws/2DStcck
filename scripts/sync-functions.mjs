/**
 * src/lib 의 시장 로직을 Supabase Edge Functions(_shared)로 복사하면서
 * "@/..." alias import를 Deno용 상대경로(.ts 확장자 포함)로 변환한다.
 *
 * 사용: npm run sync:functions
 * (src/lib/market, src/data, src/lib/types 수정 후 반드시 재실행)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "supabase", "functions", "_shared");
mkdirSync(outDir, { recursive: true });

const FILES = [
  ["src/lib/types/market.ts", "types.ts"],
  ["src/lib/market/constants.ts", "constants.ts"],
  ["src/lib/market/salary.ts", "salary.ts"],
  ["src/lib/market/distributions.ts", "distributions.ts"],
  ["src/data/stocks.ts", "stocks.ts"],
  ["src/data/characters.ts", "characters.ts"],
  ["src/data/generated.ts", "generated.ts"],
  ["src/lib/market/orderBook.ts", "orderBook.ts"],
  ["src/lib/market/engine.ts", "engine.ts"],
  ["src/lib/market/trading.ts", "trading.ts"],
  ["src/lib/market/serverState.ts", "serverState.ts"],
  ["src/lib/market/localSim.ts", "localSim.ts"],
];

const IMPORT_MAP = {
  "@/lib/types/market": "./types.ts",
  "@/lib/market/constants": "./constants.ts",
  "@/lib/market/salary": "./salary.ts",
  "@/lib/market/distributions": "./distributions.ts",
  "@/lib/market/localSim": "./localSim.ts",
  "@/lib/market/orderBook": "./orderBook.ts",
  "@/lib/market/engine": "./engine.ts",
  "@/lib/market/trading": "./trading.ts",
  "@/lib/market/serverState": "./serverState.ts",
  "@/data/stocks": "./stocks.ts",
  "@/data/characters": "./characters.ts",
  "@/data/generated": "./generated.ts",
};

for (const [srcRel, outName] of FILES) {
  let code = readFileSync(join(root, srcRel), "utf8");
  for (const [from, to] of Object.entries(IMPORT_MAP)) {
    code = code.replaceAll(`"${from}"`, `"${to}"`);
  }
  const banner = `// AUTO-GENERATED from ${srcRel} — edit the original and run \`npm run sync:functions\`\n`;
  writeFileSync(join(outDir, outName), banner + code);
  console.log(`synced ${srcRel} -> supabase/functions/_shared/${outName}`);
}
