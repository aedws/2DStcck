/**
 * data/companies.csv → src/data/generated.ts 변환.
 * CSV가 캐릭터 회사의 원본이다.
 *
 * 사용: npm run import:companies  (또는 node scripts/import-companies.mjs [csv경로])
 *
 * CSV 규격 (UTF-8, 첫 줄 헤더):
 *   ticker      영문 대문자 1~6자, 고유 (id는 소문자 변환)
 *   name        회사명
 *   sector      섹터 (같은 문자열끼리 섹터 이벤트로 묶임)
 *   subsector   선택형 세부 섹터 (표시·검색용)
 *   initialPrice 상장가, 양의 정수(원)
 *   volatility  틱당 변동성 계수, 0.01~0.06 권장
 *   drift       장기 성향, -0.001~0.002 권장
 *   beta        시장(선물) 민감도, 1 = 시장과 동일
 *   description 회사 한 줄 소개
 *   logo        기업 로고 경로/URL (빈칸이면 public/logos/<id>.png 자동 시도, 없으면 이니셜)
 *   eventBias   이벤트 태그별 가중치 "태그:배수;태그:배수" (빈칸 가능, 기본 1)
 *   ceoName     캐릭터 이름 (빈칸이면 캐릭터 없는 회사)
 *   ceoTitle    직함 (빈칸이면 CEO)
 *   ceoTraits   성격 태그 "천재;은둔형" (세미콜론 구분)
 *   ceoBio      캐릭터 한 줄 설정
 *   ceoEmoji    아바타 이모지 (빈칸이면 👤)
 *   etfHoldings ETF 구성종목 "티커:비중;티커:비중" (설정 시 NAV 추종 모드, 비중은 자동 정규화)
 *   quarterlyDividend  분기 배당: 60거래일마다 지급할 주당 금액(센트, 정수). 빈칸 = 무배당
 *
 * (선택) data/character-quotes.csv — 캐릭터별 뉴스 대사 오버라이드:
 *   ticker      대상 회사 티커 (CEO가 있는 회사여야 함)
 *   tag         이벤트 태그(수주·신제품·실적·스캔들·행보 …) 또는 "*"(캐릭터 기본 대사)
 *   direction   호재 또는 악재
 *   quote1..N   대사 후보 열(quote1 필수, quote2·quote3 … 선택). 여러 개면 랜덤 선택.
 *   그 외 열(캐릭터·참고 등)은 무시한다. 파일이 없으면 공용 태그 풀만 사용.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const csvPath = process.argv[2] ?? join(root, "data", "companies.csv");
const quotesCsvPath = process.argv[3] ?? join(root, "data", "character-quotes.csv");
const outPath = join(root, "src", "data", "generated.ts");

const HEADER = [
  "ticker", "name", "sector", "initialPrice", "volatility", "drift", "beta",
  "description", "logo", "eventBias", "ceoName", "ceoTitle", "ceoTraits", "ceoBio", "ceoEmoji",
  "etfHoldings", "quarterlyDividend", "subsector",
];

/** 코드 관리 코어 종목 (구성종목 참조 검증용). bahina는 티커 변경(BAAKO) 때
 * 기존 보유·호감도의 id를 보존하려고 CSV에서 코드 관리로 옮겼다. */
const CORE_IDS = new Set(["vnasdaq", "vnasfut", "bahina"]);

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
  const subsector = get("subsector");
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
    ...(subsector ? { subsector } : {}),
    initialPrice,
    volatility,
    drift,
    beta,
    description: get("description") || undefined,
    logo: get("logo") || undefined,
    eventBias: parseEventBias(get("eventBias"), line),
  };

  const holdingsRaw = get("etfHoldings");
  if (holdingsRaw) {
    const parsed = [];
    for (const pair of holdingsRaw.split(";")) {
      const [refTicker, w] = pair.split(":").map((s) => s.trim());
      const weight = Number(w);
      if (!refTicker || !Number.isFinite(weight) || weight <= 0) {
        fail(line, `etfHoldings 형식 오류: "${pair}" (예: BAGDI:0.3;BAVTS:0.2)`);
        return;
      }
      parsed.push({ stockId: refTicker.toLowerCase(), weight });
    }
    // 비중 합 1로 정규화
    const total = parsed.reduce((s, h) => s + h.weight, 0);
    company.etfHoldings = parsed.map((h) => ({
      stockId: h.stockId,
      weight: Math.round((h.weight / total) * 10000) / 10000,
    }));
  }

  const dividendRaw = get("quarterlyDividend");
  if (dividendRaw) {
    const dividend = parseNumber(dividendRaw, "quarterlyDividend", line, { integer: true });
    if (dividend === null) return;
    if (dividend < 0) return fail(line, "quarterlyDividend는 0 이상");
    if (dividend > 0) company.quarterlyDividend = dividend;
  }

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

// ETF 구성종목 참조 검증 (오타 방지)
const allIds = new Set([...CORE_IDS, ...companies.map((c) => c.id)]);
for (const c of companies) {
  for (const h of c.etfHoldings ?? []) {
    if (!allIds.has(h.stockId)) {
      console.error(
        `[import:companies] ${c.ticker}: etfHoldings에 없는 티커 "${h.stockId}"`,
      );
      process.exitCode = 1;
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);

/**
 * (선택) data/character-quotes.csv → 캐릭터별 뉴스 대사 오버라이드.
 * 열 이름 기반 파싱이라 순서·부가열(참고 등)에 관대하다. 필수 열:
 *   ticker, tag, direction, quote1 (quote2, quote3 … 는 추가 후보로 선택)
 * direction 은 호재/악재(또는 positive/negative, +/-)를 허용한다.
 * 파일이 없으면 빈 목록으로 두어 공용 태그 풀만 사용한다.
 */
function parseDirection(value) {
  const v = value.trim().toLowerCase();
  if (["호재", "positive", "pos", "+", "up", "good"].includes(v)) return "positive";
  if (["악재", "negative", "neg", "-", "down", "bad"].includes(v)) return "negative";
  return null;
}

const characterIdByTicker = new Map(
  companies.filter((c) => c.ceoId).map((c) => [c.ticker, c.ceoId]),
);
const characterQuotes = [];

if (existsSync(quotesCsvPath)) {
  const qrows = parseCsv(readFileSync(quotesCsvPath, "utf8").replace(/^﻿/, ""));
  const qheader = qrows.shift()?.map((h) => h.trim());
  if (!qheader) {
    console.error(`[import:companies] character-quotes.csv 헤더가 비어 있습니다.`);
    process.exit(1);
  }
  const col = (name) => qheader.indexOf(name);
  const tickerCol = col("ticker");
  const tagCol = col("tag");
  const dirCol = col("direction");
  const quoteCols = qheader
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^quote\d*$/.test(h.trim()))
    .map(({ i }) => i);
  if (tickerCol < 0 || tagCol < 0 || dirCol < 0 || quoteCols.length === 0) {
    console.error(
      `[import:companies] character-quotes.csv 필수 열 누락. 필요: ticker, tag, direction, quote1(…)\n실제: ${qheader.join(",")}`,
    );
    process.exit(1);
  }
  // 같은 (캐릭터·태그·방향)의 여러 행/열 대사를 하나로 합친다.
  const merged = new Map();
  qrows.forEach((cols, idx) => {
    const line = idx + 2;
    const ticker = (cols[tickerCol] ?? "").trim();
    if (!ticker) return; // 빈 줄 무시
    const tag = (cols[tagCol] ?? "").trim();
    const direction = parseDirection(cols[dirCol] ?? "");
    const quotes = quoteCols
      .map((i) => (cols[i] ?? "").trim())
      .filter(Boolean);
    if (quotes.length === 0) return; // 대사 비어 있으면 건너뜀(미작성 행)
    const characterId = characterIdByTicker.get(ticker);
    if (!characterId) {
      return fail(line, `character-quotes: CEO 없는/모르는 ticker "${ticker}"`);
    }
    if (!tag) return fail(line, `character-quotes: tag 비어 있음`);
    if (!direction) {
      return fail(line, `character-quotes: direction 은 호재/악재 여야 함 ("${cols[dirCol]}")`);
    }
    const key = `${characterId}|${tag}|${direction}`;
    const list = merged.get(key) ?? [];
    list.push(...quotes);
    merged.set(key, list);
  });
  if (process.exitCode) process.exit(process.exitCode);
  for (const [key, quotes] of merged) {
    const [characterId, tag, direction] = key.split("|");
    characterQuotes.push({ characterId, tag, direction, quotes });
  }
}

const banner = `// AUTO-GENERATED from data/companies.csv (+ data/character-quotes.csv) — 직접 수정 금지, \`npm run import:companies\` 로 재생성\n`;
const body = `${banner}import type {
  Character,
  CharacterQuoteEntry,
  StockDefinition,
} from "@/lib/types/market";

export const CSV_COMPANIES: StockDefinition[] = ${JSON.stringify(companies, null, 2)};

export const CSV_CHARACTERS: Character[] = ${JSON.stringify(characters, null, 2)};

export const CSV_CHARACTER_QUOTES: CharacterQuoteEntry[] = ${JSON.stringify(characterQuotes, null, 2)};
`;

writeFileSync(outPath, body);
console.log(
  `[import:companies] 회사 ${companies.length}개, 캐릭터 ${characters.length}명, 캐릭터 대사 ${characterQuotes.length}건 → src/data/generated.ts`,
);
