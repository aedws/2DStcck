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
  version: 3,
  emoji: "⏪",
  title: "발행량 제한 롤백 & 보상 안내",
  body: [
    "7/20 도입한 보통주 발행량 제한(공유 유통 재고) 기능에서 다수의 버그가 확인되어 해당 기능만 도입 전 상태로 롤백했습니다. 매수 가능 물량 제한과 잔여 물량 표시가 사라지고, 보통주의 지정가 주문·자동 모으기도 이전처럼 동작합니다.",
    "같은 날의 다른 변경(오버플로우 상한 폐지, 시장 고속 로드, IPO 정상화 등)은 그대로 유지됩니다.",
    "불편을 드려 죄송합니다. 롤백 보상으로 전 계정에 $100,000를 지급했습니다. 지급 내역은 거래·지급 내역 화면에서 확인할 수 있습니다.",
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
