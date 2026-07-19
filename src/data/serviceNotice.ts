/**
 * 계정별 운영 조치 — 특정 계정(버그 익스플로잇 등)만 콕 집어 지갑을 초기화하고
 * 안내·보상 팝업을 1회 띄운다. 키는 Supabase auth user id라 게임 핸들이 번들에
 * 노출되지 않는다. 리셋은 로그인 시 클라이언트가 스스로 수행하므로, 로컬 지갑이
 * 클라우드보다 최신이어도(로컬-우선 규칙) 확실히 적용된다.
 *
 * resetVersion 을 올리면 해당 계정에 리셋·보상이 다시 1회 적용된다(멱등: 지갑에
 * account-reset-v{n} 지급 내역이 없을 때만).
 */
export interface TargetedAccountAction {
  /** 올릴 때마다 리셋·보상·안내를 1회 더 적용한다. */
  resetVersion: number;
  /** 리셋 후 지급할 보상(센트). 0이면 보상 없이 초기화만. */
  compensationAmount: number;
  emoji: string;
  title: string;
  /** 안내 본문 문단 */
  body: string[];
}

/** 키 = Supabase auth user id (게임 핸들 비노출) */
export const TARGETED_ACCOUNT_ACTIONS: Record<string, TargetedAccountAction> = {
  // lakelucid — 레버리지 ETF 옵션 분할 버그로 $10만 → $9.97조 부당 수령.
  "a073dad3-5731-4a61-a72a-66f25b58242e": {
    resetVersion: 1,
    compensationAmount: 5_000_000, // $50,000
    emoji: "🔧",
    title: "계정 정상화 안내 & 보상",
    body: [
      "레버리지·인버스 ETF 옵션의 액면분할 정산 버그로, 회원님 계정이 실제 매매 실력과 무관하게 막대한 자금을 부당 수령했습니다.",
      "해당 버그를 수정했고, 회원님 계정을 초기 상태($100,000)로 정상화했습니다. 이제 옵션은 분할·병합에 맞춰 정확히 정산됩니다.",
      "불편을 드려 죄송합니다. 다시 시작하시는 데 보태시라고 보상 $50,000을 지급했습니다. (보상은 투자 성과가 아니므로 시즌·랭킹에는 반영되지 않습니다.)",
    ],
  },
};
