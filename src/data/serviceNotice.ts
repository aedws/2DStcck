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
  version: 2,
  emoji: "🔧",
  title: "긴급 점검 & 전체 초기화 안내",
  body: [
    "레버리지·인버스 ETF 옵션의 액면분할 정산 버그를 악용한 비정상 자금 증식이 반복 확인됐습니다. 공정성을 위해 새 시즌을 강제로 열고 모든 계정을 초기화했습니다.",
    "이번 국면(장세)을 처음부터 다시 플레이하게 되며, 시즌·수익률은 지금부터 새로 측정됩니다 — 앞으로 얼마나 버는지가 곧 실력입니다.",
    "초기화 보상으로 지난 시즌 최고 등급 '마스터 왕관 프레임' 👑을 지급했습니다. 불편을 드려 진심으로 죄송합니다.",
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
