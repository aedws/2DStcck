/**
 * data/companies.csv → src/data/generated.ts 변환.
 * CSV가 캐릭터 회사의 원본이다. 실행 후 sync:functions까지 자동 수행됨(package.json).
 *
 * 사용: npm run import:companies  (또는 node scripts/import-companies.mjs [csv경로])
 *
 * CSV 규격 (UTF-8, 첫 줄 헤더):
 *   ticker      영문 대문자 1~6자, 고유 (id는 소문자 변환)
 *   name        회사명
 *   sector      섹터 (같은 문자열끼리 섹터 이벤트로 묶임)
 *   initialPrice 상장가, 양의 정수(원)
 *   volatility  틱당 변동성 계수, 0.01~0.06 권장
 *   drift       장기 성향, -0.001~0.002 권장
 *   beta        시장(선물) 민감도, 1 = 시장과 동일
 *   description 회사 한 줄 소개
 *   eventBias   이벤트 태그별 가중치 "태그:배수;태그:배수" (빈칸 가능, 기본 1)
 *   ceoName     캐릭터 이름 (빈칸이면 캐릭터 없는 회사)
 *   ceoTitle    직함 (빈칸이면 CEO)
 *   ceoTraits   성격 태그 "천재;은둔형" (세미콜론 구분)
 *   ceoBio      캐릭터 한 줄 설정
 *   ceoEmoji    아바타 이모지 (빈칸이면 👤)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const csvPath = process.argv[2] ?? join(root, "data", "companies.csv");
const outPath = join(root, "src", "data", "generated.ts");

const HEADER = [
  "ticker", "name", "sector", "initialPrice", "volatility", "drift", "beta",
  "description", "eventBias", "ceoName", "ceoTitle", "ceoTraits", "ceoBio", "ceoEmoji",
];

/** 최소 RFC4180 파서: 따옴표 필드, "" 이스케이프, CRLF 지원 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function fail(line, msg) {
  console.error(`[import:companies] ${line}행: ${msg}`);
  process.exitCode = 1;
}

function parseNumber(value, name, line, { integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) { fail(line, `${name} 숫자 아님: "${value}"`); return null; }
  if (integer && !Number.isInteger(n)) { fail(line, `${name} 정수 아님: "${value}"`); return null; }
  return n;
}

/** "수주:4;스캔들:0.5" → { 수주: 4, 스캔들: 0.5 } */
function parseEventBias(value, line) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const bias = {};
  for (const pair of trimmed.split(";")) {
    const [tag, mult] = pair.split(":").map((s) => s.trim());
    const n = Number(mult);
    if (!tag || !Number.isFinite(n) || n < 0) {
      fail(line, `eventBias 형식 오류: "${pair}" (예: 수주:4;스캔들:0.5)`);
      return undefined;
    }
    bias[tag] = n;
  }
  return bias;
}

if (!existsSync(csvPath)) {
  console.error(`[import:companies] CSV 없음: ${csvPath}`);
  process.exit(1);
}

const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
const header = rows.shift()?.map((h) => h.trim());
if (!header || HEADER.some((h, i) => header[i] !== h)) {
  console.error(
    `[import:companies] 헤더가 규격과 다릅니다.\n기대: ${HEADER.join(",")}\n실제: ${header?.join(",")}`,
  );
  process.exit(1);
}

const companies = [];
const characters = [];
const seenTickers = new Set();

rows.forEach((cols, idx) => {
  const line = idx + 2; // 헤더 다음부터
  const get = (name) => (cols[HEADER.indexOf(name)] ?? "").trim();

  const ticker = get("ticker");
  if (!/^[A-Z0-9]{1,6}$/.test(ticker)) {
    return fail(line, `ticker는 영문 대문자·숫자 1~6자: "${ticker}"`);
  }
  if (seenTickers.has(ticker)) return fail(line, `ticker 중복: ${ticker}`);
  seenTickers.add(ticker);

  const name = get("name");
  const sector = get("sector");
  if (!name || !sector) return fail(line, "name/sector는 필수");

  const initialPrice = parseNumber(get("initialPrice"), "initialPrice", line, { integer: true });
  const volatility = parseNumber(get("volatility"), "volatility", line);
  const drift = parseNumber(get("drift"), "drift", line);
  const beta = parseNumber(get("beta"), "beta", line);
  if (initialPrice === null || volatility === null || drift === null || beta === null) return;
  if (initialPrice <= 0) return fail(line, "initialPrice는 양수");
  if (volatility <= 0 || volatility > 0.2) return fail(line, "volatility는 0~0.2 사이");

  const id = ticker.toLowerCase();
  const company = {
    id,
    ticker,
    name,
    sector,
    initialPrice,
    volatility,
    drift,
    beta,
    description: get("description") || undefined,
    eventBias: parseEventBias(get("eventBias"), line),
  };

  const ceoName = get("ceoName");
  if (ceoName) {
    const characterId = `chr_${id}`;
    company.ceoId = characterId;
    characters.push({
      id: characterId,
      name: ceoName,
      title: get("ceoTitle") || "CEO",
      traits: get("ceoTraits").split(";").map((t) => t.trim()).filter(Boolean),
      bio: get("ceoBio"),
      emoji: get("ceoEmoji") || "👤",
    });
  }

  companies.push(company);
});

if (process.exitCode) process.exit(process.exitCode);

const banner = `// AUTO-GENERATED from data/companies.csv — 직접 수정 금지, \`npm run import:companies\` 로 재생성\n`;
const body = `${banner}import type { Character, StockDefinition } from "@/lib/types/market";

export const CSV_COMPANIES: StockDefinition[] = ${JSON.stringify(companies, null, 2)};

export const CSV_CHARACTERS: Character[] = ${JSON.stringify(characters, null, 2)};
`;

writeFileSync(outPath, body);
console.log(
  `[import:companies] 회사 ${companies.length}개, 캐릭터 ${characters.length}명 → src/data/generated.ts`,
);
