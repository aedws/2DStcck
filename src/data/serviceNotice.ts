/**
 * 운영 공지 & 보상 — 버그 수정 등으로 전체 플레이어에게 안내 + 보상을 지급할 때
 * 쓴다. version을 올리면 새 공지가 한 번 더 뜨고(플레이어별 1회), amount 만큼
 * '보상(compensation)' 현금이 지갑에 지급된다. 보상은 투자 성과가 아니므로
 * 시즌·랭킹 평가에서는 제외된다(외생 소득).
 */
export interface ServiceNotice {
  /** 올릴 때마다 새 공지로 인식. 지갑에 compensation-v{version} 지급 내역이 없으면 지급. */
  version: number;
  emoji: string;
  title: string;
  /** 본문 문단 배열 */
  body: string[];
  /** 보상 금액(센트). 0이면 보상 없이 안내만. */
  compensationAmount: number;
}

export const CURRENT_SERVICE_NOTICE: ServiceNotice = {
  version: 1,
  emoji: "🔧",
  title: "버그 수정 안내 & 보상",
  body: [
    "레버리지·인버스 ETF가 액면분할될 때, 그 종목에 걸린 옵션의 손익이 잘못 계산되는 버그가 있었습니다. 이 때문에 일부 계정이 실제 실력과 무관하게 막대한 자금을 부당 수령했습니다.",
    "해당 버그를 수정했고, 부당 이득을 취한 계정은 정상 상태로 되돌렸습니다. 이제 옵션은 분할·병합에 맞춰 정확히 정산됩니다.",
    "혼란을 드려 죄송합니다. 사과의 뜻으로 모든 플레이어에게 보상을 지급합니다. (보상은 투자 성과가 아니므로 시즌·랭킹에는 반영되지 않습니다.)",
  ],
  compensationAmount: 5_000_000, // $50,000
};
