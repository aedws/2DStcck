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
  // 파우스트 투자증권(FAUS) — 2026-07-24 19:00 KST 개장 (= 10:00 UTC)
  faust: Date.UTC(2026, 6, 24, 10, 0),
  // 미쿠 엔터테인먼트(MIKU) — 2026-07-24 21:30 KST 개장 (= 12:30 UTC)
  miku: Date.UTC(2026, 6, 24, 12, 30),
  // 캬롯 농장(CROT) — 2026-07-25 12:00 KST 개장 (= 03:00 UTC)
  carrot: Date.UTC(2026, 6, 25, 3, 0),
  // 아스나 유업(ASNA) — 2026-07-25 15:00 KST 개장 (= 06:00 UTC)
  asuna: Date.UTC(2026, 6, 25, 6, 0),
  // 까모투자증권(KAMO) — 2026-07-25 18:00 KST 개장 (= 09:00 UTC)
  wakamo: Date.UTC(2026, 6, 25, 9, 0),
  // 모모톡프렌즈(AHMF) — 2026-07-26 12:00 KST 개장 (= 03:00 UTC)
  hifumi: Date.UTC(2026, 6, 26, 3, 0),
  // 이프리트 화력발전(IFRT) — 2026-07-26 15:00 KST 개장 (= 06:00 UTC)
  ifrit: Date.UTC(2026, 6, 26, 6, 0),
  // 주붕투자증권(JBINV) — 2026-07-26 09:00 KST 개장 (= 00:00 UTC)
  jbinv: Date.UTC(2026, 6, 26, 0, 0),
  // 홍루 은행(HONGL) — 2026-07-26 14:00 KST 개장 (= 05:00 UTC)
  honglu: Date.UTC(2026, 6, 26, 5, 0),
  // 파급효과(PGHG) — 2026-07-26 19:00 KST 개장 (= 10:00 UTC)
  pghg: Date.UTC(2026, 6, 26, 10, 0),
  // 에이메스 네트웍스(AMNW) — 2026-07-26 22:00 KST 개장 (= 13:00 UTC)
  amnw: Date.UTC(2026, 6, 26, 13, 0),
  // 이오리 소프트웨어(IORI) — 2026-07-27 15:30 KST 개장 (= 06:30 UTC)
  iori: Date.UTC(2026, 6, 27, 6, 30),
  // 레이크루시드증권(LCID) — 2026-07-27 18:00 KST 개장 (= 09:00 UTC)
  lcid: Date.UTC(2026, 6, 27, 9, 0),
  // 레비 종합보조서비스(LEVI) — 2026-07-27 21:00 KST 개장 (= 12:00 UTC)
  levi: Date.UTC(2026, 6, 27, 12, 0),
  // NexR(NEXR) — 2026-07-28 12:00 KST 개장 (= 03:00 UTC)
  nexr: Date.UTC(2026, 6, 28, 3, 0),
  // 카르티시아 F&B(TEHTY) — 2026-07-28 15:00 KST 개장 (= 06:00 UTC)
  tehty: Date.UTC(2026, 6, 28, 6, 0),
  // 마카샤 연구소(MKSA) — 2026-07-28 18:00 KST 개장 (= 09:00 UTC)
  mksa: Date.UTC(2026, 6, 28, 9, 0),
  // 몬텔리 캐피탈(MONC) — 2026-07-28 21:00 KST 개장 (= 12:00 UTC)
  monc: Date.UTC(2026, 6, 28, 12, 0),
  // 히스클리프 리츠운용(HTCL) — 2026-07-29 15:00 KST 개장 (= 06:00 UTC)
  htcl: Date.UTC(2026, 6, 29, 6, 0),
  // 누카-콜라(NKCL) — 2026-07-29 18:00 KST 개장 (= 09:00 UTC) · 플레이어 회사 IPO
  nkcl: Date.UTC(2026, 6, 29, 9, 0),
  // 코유키 정보해석(KOYU) — 2026-07-29 21:00 KST 개장 (= 12:00 UTC)
  koyuki: Date.UTC(2026, 6, 29, 12, 0),
  // 에이메스 엔터테인먼트(WWAM) — 2026-07-30 15:00 KST 개장 (= 06:00 UTC)
  ames: Date.UTC(2026, 6, 30, 6, 0),
  // 베르길리우스 다크 투어리즘(VRGL) — 2026-07-31 15:00 KST 개장 (= 06:00 UTC)
  vergilius: Date.UTC(2026, 6, 31, 6, 0),
  // 밀리테크 인터내셔널 아머먼츠(MILITC) — 2026-07-31 18:00 KST 개장 (= 09:00 UTC)
  militc: Date.UTC(2026, 6, 31, 9, 0),
  // 이스마엘 해운(ISML) — 2026-08-01 15:00 KST 개장 (= 06:00 UTC)
  ishmael: Date.UTC(2026, 7, 1, 6, 0),
  // 스피드웨건 오일(SPWO) — 2026-08-02 18:00 KST 개장 (= 09:00 UTC)
  speedwagon: Date.UTC(2026, 7, 2, 9, 0),
  // JB투자은행(JBINVB) — 2026-08-03 12:00 KST 개장 (= 03:00 UTC) · 플레이어 회사 IPO
  jbinvb: Date.UTC(2026, 7, 3, 3, 0),
  // 슈팡특송(SHPG) — 2026-08-03 15:00 KST 개장 (= 06:00 UTC)
  shupang: Date.UTC(2026, 7, 3, 6, 0),
  // NatsumeAnan Capital Management(NACM) — 2026-08-03 18:00 KST 개장 (= 09:00 UTC) · 플레이어 회사 IPO
  nacm: Date.UTC(2026, 7, 3, 9, 0),
  // 게헨나헬스 그룹(GHH) — 2026-08-03 21:00 KST 개장 (= 12:00 UTC)
  ghh: Date.UTC(2026, 7, 3, 12, 0),
  // Kusogaki Capital(KSGK) — 2026-08-04 12:00 KST 개장 (= 03:00 UTC) · 플레이어 회사 IPO
  ksgk: Date.UTC(2026, 7, 4, 3, 0),
};
