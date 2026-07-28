/**
 * 관리자 즉시 IPO — 코드 배포 없이 런타임에 상장하는 동적 종목 레지스트리.
 *
 * 시장은 종목별로 (틱, 종목id)로 시드된 난수 `seededRand(tick, id)`와 공유 이벤트만
 * 읽어 가격을 만든다. 따라서 '미래 시각에 상장하는 독립 종목'을 추가해도 기존 종목의
 * 가격 경로·번들 체크포인트·클라이언트 간 일치에 아무 영향이 없다. 그래서 동적 IPO는
 * MARKET_SIM_VERSION 을 올리거나 체크포인트를 재생성하지 않고도 안전하다.
 *
 * 결정론을 100% 지키기 위한 두 가지 규칙:
 *   1) 상장 시각은 반드시 미래 — 상장 전에는 공모가로 동결(비참여)되고, 상장 시각부터
 *      모든 클라이언트가 같은 시드로 동일하게 전진한다.
 *   2) 동적 종목은 회사 지정 이벤트 추첨 풀(getCompanyDefinitions)에서 제외한다 — 기존
 *      회사 뉴스 추첨이 바뀌지 않아 desync 여지가 원천 차단된다. 동적 종목도 매크로·섹터
 *      이벤트에는 베타·섹터로 반응한다.
 */
import type { StockDefinition } from "@/lib/types/market";

/** Supabase `ipo_listings.payload` 에 저장되는 관리자 입력(직렬화 가능한 원본). */
export interface StoredIpoListing {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  subsector?: string;
  /** 공모가(센트). */
  initialPrice: number;
  volatility: number;
  drift: number;
  beta: number;
  /** 분기 주당 배당금(센트). */
  quarterlyDividend?: number;
  suspendDividendBelowInitialPrice?: boolean;
  belowInitialPriceBuybackSupportPerSession?: number;
  description?: string;
  logo?: string;
  /** 상장 시각(ms, UTC). */
  listingEpochMs: number;
}

const ID_RE = /^[a-z][a-z0-9]{1,11}$/;
const TICKER_RE = /^[A-Z0-9]{1,6}$/;

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** 관리자 입력을 안전 범위로 정규화한다(폼·서버 저장 전 공통). 유효하지 않으면 null. */
export function normalizeStoredIpoListing(
  input: Partial<StoredIpoListing>,
): StoredIpoListing | null {
  const id = String(input.id ?? "").trim().toLowerCase();
  const ticker = String(input.ticker ?? "").trim().toUpperCase();
  const name = String(input.name ?? "").trim();
  const sector = String(input.sector ?? "").trim();
  if (!ID_RE.test(id) || !TICKER_RE.test(ticker) || !name || !sector) return null;
  const listingEpochMs = Number(input.listingEpochMs);
  if (!Number.isFinite(listingEpochMs)) return null;
  return {
    id,
    ticker,
    name: name.slice(0, 40),
    sector: sector.slice(0, 20),
    subsector: input.subsector?.trim().slice(0, 20) || undefined,
    // 공모가: $1(=100센트) ~ $100,000(=1000만 센트).
    initialPrice: Math.round(clamp(Number(input.initialPrice), 100, 10_000_000, 100_000)),
    volatility: clamp(Number(input.volatility), 0.005, 0.2, 0.04),
    drift: clamp(Number(input.drift), -0.005, 0.005, 0.0006),
    beta: clamp(Number(input.beta), 0, 3, 1),
    quarterlyDividend: Math.max(0, Math.round(Number(input.quarterlyDividend) || 0)) || undefined,
    suspendDividendBelowInitialPrice:
      input.suspendDividendBelowInitialPrice === true || undefined,
    belowInitialPriceBuybackSupportPerSession:
      input.suspendDividendBelowInitialPrice === true
        ? clamp(
            Number(input.belowInitialPriceBuybackSupportPerSession),
            0,
            0.2,
            0.04,
          )
        : undefined,
    description: input.description?.trim().slice(0, 400) || undefined,
    logo: input.logo?.trim().slice(0, 300) || undefined,
    listingEpochMs,
  };
}

/** 저장된 IPO 항목을 결정론 엔진이 소비하는 StockDefinition 으로 변환한다. */
export function ipoListingToDefinition(listing: StoredIpoListing): StockDefinition {
  return {
    id: listing.id,
    ticker: listing.ticker,
    name: listing.name,
    instrumentType: "company",
    sector: listing.sector,
    subsector: listing.subsector,
    initialPrice: listing.initialPrice,
    volatility: listing.volatility,
    drift: listing.drift,
    beta: listing.beta,
    quarterlyDividend: listing.quarterlyDividend,
    suspendDividendBelowInitialPrice:
      listing.suspendDividendBelowInitialPrice,
    belowInitialPriceBuybackSupportPerSession:
      listing.belowInitialPriceBuybackSupportPerSession,
    description: listing.description,
    logo: listing.logo,
    listingEpochMs: listing.listingEpochMs,
  };
}

// ── 모듈 레지스트리 (메인 스레드·워커가 각각 채운다) ──
let dynamicDefs: StockDefinition[] = [];
let dynamicIds = new Set<string>();

/** 현재 등록된 동적 IPO 종목 정의. */
export function getDynamicListingDefs(): StockDefinition[] {
  return dynamicDefs;
}

/** 종목 id 가 동적 IPO(런타임 상장)인지. */
export function isDynamicListingId(id: string): boolean {
  return dynamicIds.has(id);
}

/**
 * 활성 IPO 목록으로 레지스트리를 교체한다. 번들 종목 id 와 충돌하는 항목은 무시한다.
 * @param bundledIds 번들 종목 id 집합(충돌 방지용).
 * @returns 실제로 반영된 정의 수.
 */
export function setDynamicListingDefs(
  listings: StoredIpoListing[],
  bundledIds: ReadonlySet<string>,
): number {
  const seen = new Set<string>();
  const defs: StockDefinition[] = [];
  for (const listing of listings) {
    const normalized = normalizeStoredIpoListing(listing);
    if (!normalized) continue;
    if (bundledIds.has(normalized.id) || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    defs.push(ipoListingToDefinition(normalized));
  }
  dynamicDefs = defs;
  dynamicIds = seen;
  return defs.length;
}
