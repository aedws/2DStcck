/**
 * 종목별 자본 구조 수동 설정. 키는 stock id(티커 소문자)다.
 * 비어 있는 회사는 공통 기본값(발행 5조 주, 유통 90%)을 쓴다.
 * 예: udnge: { issuedShares: 6_000_000_000_000, floatRatio: 0.92 }
 */
export const SHARE_STRUCTURE_OVERRIDES: Record<
  string,
  { issuedShares: number; floatRatio: number }
> = {};
