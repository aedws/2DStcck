import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CHARACTERS } from "../src/data/characters";
import {
  NEGATIVE_GENERIC,
  NEGATIVE_QUOTES,
  POSITIVE_GENERIC,
  POSITIVE_QUOTES,
} from "../src/data/eventQuotes";
import { CSV_CHARACTER_QUOTES } from "../src/data/generated";
import { EVENT_TEMPLATES, STOCK_DEFINITIONS } from "../src/data/stocks";
import { instrumentTypeOf } from "../src/lib/market/taxonomy";

const root = join(import.meta.dirname, "..");
const output = join(root, "v2-reuse");

function writeJson(path: string, value: unknown) {
  writeFileSync(join(output, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

for (const directory of [
  "content",
  "content/legacy-source",
  "design/components",
  "design/references",
  "design/assets/logos",
]) {
  mkdirSync(join(output, directory), { recursive: true });
}

const instruments = STOCK_DEFINITIONS.map((stock) => ({
  id: stock.id,
  ticker: stock.ticker,
  name: stock.name,
  kind: instrumentTypeOf(stock),
  fundType: stock.fundType,
  strategyType: stock.strategyType,
  sector: stock.sector,
  subsector: stock.subsector,
  marketTags: stock.marketTags,
  description: stock.description,
  logo: stock.logo,
  characterId: stock.ceoId,
  composition: stock.etfHoldings,
  underlyingId: stock.leverageUnderlyingId ?? stock.coveredCallUnderlyingId,
  generatedDerivative: Boolean(stock.universalDerivative),
}));

const baseInstruments = instruments.filter((stock) => !stock.generatedDerivative);

const eventCopy = EVENT_TEMPLATES.map((event) => ({
  category: event.category,
  tag: event.tag,
  title: event.title,
  description: event.description,
  affectedStockIds: event.affectedStockIds,
  sector: event.sector,
  companyId: event.companyId,
  requiresCharacter: event.requiresCeo,
}));

writeJson("content/instruments.json", instruments);
writeJson("content/base-instruments.json", baseInstruments);
writeJson("content/characters.json", CHARACTERS);
writeJson("content/character-quotes.json", CSV_CHARACTER_QUOTES);
writeJson("content/event-copy.json", eventCopy);
writeJson("content/generic-event-quotes.json", {
  positiveByTag: POSITIVE_QUOTES,
  negativeByTag: NEGATIVE_QUOTES,
  positiveGeneric: POSITIVE_GENERIC,
  negativeGeneric: NEGATIVE_GENERIC,
});
writeJson("manifest.json", {
  package: "2DStock V2 reuse handoff",
  exportedAt: "2026-08-09",
  counts: {
    instruments: instruments.length,
    baseInstruments: baseInstruments.length,
    generatedDerivatives: instruments.length - baseInstruments.length,
    characters: CHARACTERS.length,
    characterQuoteEntries: CSV_CHARACTER_QUOTES.length,
    eventCopyEntries: eventCopy.length,
  },
  excluded: [
    "market simulation and price generation",
    "wallet, ledger, cloud save, and recovery logic",
    "orders, settlement, derivatives, and preferred-share mechanics",
    "Supabase schema and migrations",
  ],
});

const copies: Array<[string, string]> = [
  ["data/companies.csv", "content/legacy-source/companies.csv"],
  ["data/character-quotes.csv", "content/legacy-source/character-quotes.csv"],
  ["src/components/ui/StockLogo.tsx", "design/components/StockLogo.tsx"],
  ["src/components/ui/Sparkline.tsx", "design/components/Sparkline.tsx"],
  ["src/components/ui/FlashValue.tsx", "design/components/FlashValue.tsx"],
  ["UI 기준.png", "design/references/UI-기준.png"],
  ["UI 기준_선물.png", "design/references/UI-기준-선물.png"],
  ["UI 기준_세부.png", "design/references/UI-기준-세부.png"],
  ["public/logos/baridc.png", "design/assets/logos/baridc.png"],
];

for (const [source, destination] of copies) {
  copyFileSync(join(root, source), join(output, destination));
}

console.log(
  `Exported ${baseInstruments.length} base instruments, ${instruments.length - baseInstruments.length} generated derivatives, ${CHARACTERS.length} characters, and ${CSV_CHARACTER_QUOTES.length} character quote entries to ${output}`,
);
