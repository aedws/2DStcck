/**
 * 운영 공지 & 계정별 조치.
 *
 * GLOBAL_SERVICE_NOTICE: 전체 플레이어에게 1회 뜨는 공지(설정 serviceNoticeSeenVersion
 * 으로 게이트). 버전을 올리면 새 공지가 다시 뜬다.
 *
 * TARGETED_ACCOUNT_ACTIONS: 특정 계정만 리셋·보상하는 조치(auth user id 키). 전체
 * 초기화(WALLET_EPOCH v4)로 대체돼 현재는 비어 있다.
 */

export interface ServiceNotice {
  /** 설정 serviceNoticeSeenVersion 이 이 값 미만이면 공지를 띄운다. */
  version: number;
  emoji: string;
  title: string;
  body: string[];
}

/** 전체 공지(없으면 null). */
export const GLOBAL_SERVICE_NOTICE: ServiceNotice | null = {
  version: 5,
  emoji: "🛡️",
  title: "18시 기준 자산 안전 복구 및 거래 재개 안내",
  body: [
    "비정상 자산 변동이 확인된 계정은 2026년 8월 8일 18:00(KST) 기준의 확인 가능한 순자산으로 안전 복구했습니다. 정확한 종목별 시점 자료가 없는 계정은 확인된 순자산을 현금으로 통합했고, 소각된 우선주는 별도 원장 대조 후 다시 복구했습니다.",
    "일반 주식·파생상품·공매도·미체결 주문·AMC/ETF 포지션 등 금융 포지션은 리셋 대상에 포함됩니다. 상장 법인과 운용사 같은 법인 기록은 개인 자산과 분리해 존속하며, 오염된 법인 의결권은 서버 원장에서 다시 검증합니다.",
    "복구 원장 확정과 저장 잠금 해제가 완료되어 일반 거래와 유저 ETF 거래 후 클라우드 저장이 다시 가능합니다. 거래 직전 저장과 서버 원장 반영은 각각 검증되며, 저장 실패 시 거래를 진행하지 않습니다.",
    "현재 잔액이나 복구된 우선주가 안내와 다르면 새 거래를 진행하기 전에 버그 리포트로 계정명을 남겨 주세요. 불편을 드려 죄송합니다.",
  ],
};

export interface TargetedAccountAction {
  resetVersion: number;
  compensationAmount: number;
  emoji: string;
  title: string;
  body: string[];
}

/** 키 = Supabase auth user id. 전체 초기화로 대체돼 현재 비어 있음. */
export const TARGETED_ACCOUNT_ACTIONS: Record<string, TargetedAccountAction> = {};
