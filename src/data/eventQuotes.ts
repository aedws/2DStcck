import type { Character } from "@/lib/types/market";

/**
 * 회사 이벤트가 터질 때 해당 회사 캐릭터가 남기는 한마디.
 * 태그별 톤에 맞춰 결정론(seeded rand)으로 하나 뽑아 뉴스에 붙인다.
 */
const POSITIVE_QUOTES: Record<string, string[]> = {
  수주: [
    "대형 계약을 따냈습니다. 다음 분기가 기대되네요.",
    "이 정도 수주는 시작에 불과합니다.",
    "밤새 협상한 보람이 있군요.",
  ],
  신제품: [
    "드디어 공개합니다. 반응이 궁금하네요.",
    "이번 제품엔 자신 있습니다.",
    "시장의 판도를 바꿀 준비가 됐습니다.",
  ],
  실적: [
    "숫자가 말해주고 있습니다.",
    "주주 여러분의 신뢰에 실적으로 보답하겠습니다.",
    "예상치를 넘겼습니다. 여기서 멈추지 않겠습니다.",
  ],
  행보: [
    "저는 제 길을 갈 뿐입니다.",
    "지켜봐 주시죠. 곧 보여드리겠습니다.",
    "소문은 소문일 뿐입니다.",
  ],
};

const NEGATIVE_QUOTES: Record<string, string[]> = {
  스캔들: [
    "…드릴 말씀이 없습니다.",
    "오해가 있었습니다. 곧 해명하겠습니다.",
    "책임을 통감하고 있습니다.",
  ],
  실적: [
    "기대에 미치지 못했습니다. 무겁게 받아들이겠습니다.",
    "숫자가 좋지 않습니다. 원인부터 바로잡겠습니다.",
    "실망을 드렸습니다. 다음 분기에는 달라진 모습을 보여드리겠습니다.",
  ],
  수주: [
    "협상이 뜻대로 풀리지 않았습니다. 대안을 찾겠습니다.",
    "이번 계약은 놓쳤지만 다음 기회를 준비하겠습니다.",
  ],
  신제품: [
    "완성도가 부족했습니다. 출시 일정을 다시 점검하겠습니다.",
    "시장 반응을 겸허히 받아들이고 제품을 보완하겠습니다.",
  ],
};

const POSITIVE_GENERIC = [
  "흥미로운 하루군요.",
  "시장은 늘 예측불가입니다.",
  "다음 수를 준비하고 있습니다.",
];

const NEGATIVE_GENERIC = [
  "상황을 무겁게 받아들이고 있습니다.",
  "문제를 피하지 않고 수습하겠습니다.",
  "지금은 변명보다 결과로 책임질 때입니다.",
];

/** 태그·이벤트 방향·화자에 맞는 대사를 seeded rand로 선택 */
export function pickEventQuote(
  tag: string,
  ceo: Character,
  rand: () => number,
  impact = 0,
): { quote: string; quoteBy: string } {
  const pool = impact < 0
    ? NEGATIVE_QUOTES[tag] ?? NEGATIVE_GENERIC
    : POSITIVE_QUOTES[tag] ?? POSITIVE_GENERIC;
  const quote = pool[Math.floor(rand() * pool.length)] ?? pool[0];
  return { quote, quoteBy: `${ceo.emoji} ${ceo.name}` };
}
