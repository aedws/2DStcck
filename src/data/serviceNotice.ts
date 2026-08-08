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
  version: 6,
  emoji: "📢",
  title: "주식 초기화·순자산 보존 상세 안내",
  body: [
    "이번 안전 복구에서 초기화된 것은 보유 종목과 포지션이며, 확인 가능한 순자산 총액은 유지했습니다. 따라서 복구 대상 계정은 기존 주식 수량이 그대로 돌아오는 방식이 아니라, 2026년 8월 8일 18:00(KST)을 기준으로 검증한 자산가치를 현금으로 통합한 상태입니다.",
    "초기화 범위에는 일반 주식, 레버리지·인버스 등 파생 종목, 공매도, 옵션, 미체결 주문, 정기매수, AMC/유저 ETF 포지션이 포함됩니다. 정확한 종목별 수량을 추측해 되살리면 없는 주식이 생기거나 같은 자산이 중복 지급될 수 있어, 검증되지 않은 포지션은 복원하지 않았습니다.",
    "원인은 초고액 ETF의 자동 분할·병합과 청산 과정에서 일부 숫자가 클라이언트 및 정수 계산 범위를 넘었고, 그 결과 비정상 수량·현금이 클라우드 저장과 서버 원장 사이에서 다시 증폭되거나 사라질 수 있었기 때문입니다. 열린 화면의 오래된 저장본이 서버 복구값을 다시 덮을 가능성도 함께 확인했습니다.",
    "모든 계정에 18시 당시의 완전한 종목별 시점 자료가 남아 있지는 않았습니다. 그래서 최신 정상 스냅샷, 18시 직후 최초 정상 스냅샷, 주간 기준 자산, 정상 리더보드 값 순서로 교차 확인해 가장 안전한 순자산 기준액을 정했습니다. 새 계정이거나 정상 기준값을 확인할 수 없는 경우에는 기본 자산 $10M을 적용했습니다.",
    "우선주는 일반 주식과 다르게 별도 소유 원장·과거 백업·버그 리포트를 대조해 종목 자체로 복구했으며, 복구 금액만큼 현금에서 전환해 총자산이 중복 증가하지 않게 했습니다. 상장 법인과 자산운용사 기록도 개인 매매 포지션과 분리해 존속·복구합니다.",
    "현재는 복구 대상 27개 계정의 총액과 ETF 원장을 재검증하고 저장 잠금을 해제했습니다. 거래 전 클라우드 저장, 서버 원장 기반 ETF 체결, 복구 이후 금융 체크포인트, 우선주 삭제 방지 및 법인 의결권 검증도 적용돼 있습니다. 저장에 실패하면 거래를 진행하지 않습니다.",
    "즉, 주식 구성은 초기화됐지만 기준 시점의 확인 가능한 자산가치는 사라진 것이 아닙니다. 현재 총액이 기준액과 다르거나 복구돼야 할 우선주가 보이지 않으면, 새 거래 전에 버그 리포트에 계정명·예상 기준액·누락 자산·확인 가능한 스크린샷을 남겨 주세요. 불편을 드려 죄송합니다.",
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
