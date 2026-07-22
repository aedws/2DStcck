/**
 * IPO 상장 일정 — 종목 id → 상장 시각(절대 ms, UTC).
 *
 * 새 종목을 상장할 때:
 *   1) data/companies.csv 에 회사·캐릭터를 추가하고 `npm run import:companies` 실행
 *   2) 아래에 `<종목id>: <상장시각ms>` 한 줄 추가 (예: 지금부터 3시간 뒤)
 *   3) constants.ts 의 MARKET_SIM_VERSION 을 올려 전체 리플레이 강제
 *   4) 커밋·배포 → IPO 탭에 카운트다운으로 뜨고 그 시각에 자동 개장
 *
 * 상장 시각은 절대값(UTC ms)이라 모든 접속자가 같은 시각에 개장한다.
 * `Date.UTC(2026, 6, 18, 15, 0)` 처럼 명시하거나, 스케줄링 시점 기준
 * "N시간 뒤"를 계산해 숫자로 박아 넣는다(재빌드에도 값이 바뀌지 않게).
 */
export const IPO_SCHEDULE: Record<string, number> = {
  // 레이센 제약(우동게) — 2026-07-20 15:00 KST 개장 (= 06:00 UTC)
  udnge: Date.UTC(2026, 6, 20, 6, 0),
  // 단테 정밀시계(단테) — 2026-07-21 18:00 KST 개장 (= 09:00 UTC)
  dante: Date.UTC(2026, 6, 21, 9, 0),
  // 소라사키 히나 금융지주(HINA) — 2026-07-22 15:00 KST 개장 (= 06:00 UTC)
  hinafg: Date.UTC(2026, 6, 22, 6, 0),
  // 키보토스 총학생회 금융지주(GSCK) — 2026-07-22 18:00 KST 개장 (= 09:00 UTC)
  gsck: Date.UTC(2026, 6, 22, 9, 0),
  // 이상 연구소(YSAN) — 2026-07-22 21:00 KST 개장 (= 12:00 UTC)
  yisang: Date.UTC(2026, 6, 22, 12, 0),
  // 나구사 야키토리&닭꼬치(NGSA) — 2026-07-23 15:00 KST 개장 (= 06:00 UTC)
  nagusa: Date.UTC(2026, 6, 23, 6, 0),
  // 붉은겨울 출판부(YKMO) — 2026-07-23 18:00 KST 개장 (= 09:00 UTC)
  yakumo: Date.UTC(2026, 6, 23, 9, 0),
  // 미노리 용역(MNRI) — 2026-07-24 15:00 KST 개장 (= 06:00 UTC)
  minori: Date.UTC(2026, 6, 24, 6, 0),
};
