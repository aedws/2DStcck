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
  version: 4,
  emoji: "📕",
  title: "내 유저 ETF 목록 복구 안내",
  body: [
    "로그인 직후 클라우드 저장 타이밍 문제로, 이미 만든·상장한 유저 ETF가 「내 유저 ETF」 목록에서 사라질 수 있던 버그를 고쳤습니다.",
    "상장 원장(또는 상장 신청 내역)에 남아 있는 ETF는 재접속 시 자동으로 운용사 목록에 다시 채워집니다. 자산운용사(/amc) 탭의 「내 유저 ETF」에서 확인해 주세요.",
    "마켓 목록에는 본인이 운용하는 ETF가 따로 안 보이도록 되어 있으니, 내 ETF는 반드시 자산운용사 탭에서 보시면 됩니다. 불편을 드려 죄송합니다.",
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
