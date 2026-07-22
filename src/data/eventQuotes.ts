import { getCharacterById } from "@/data/characters";
import { CSV_CHARACTER_QUOTES } from "@/data/generated";
import { STOCK_DEFINITIONS } from "@/data/stocks";
import type {
  Character,
  CharacterQuoteEntry,
  MarketEvent,
} from "@/lib/types/market";

/** 코드로 직접 관리하는 캐릭터 전용 대사(CSV 외 IPO 추가분). */
const CORE_CHARACTER_QUOTES: CharacterQuoteEntry[] = [
  {
    characterId: "chr_udnge",
    tag: "*",
    direction: "positive",
    quotes: [
      "오늘도 마을에서 완판이에요. 약효요? 그건 조제하는 쪽에 물어보셔야…",
      "행상은 발로 뛴 만큼 팔립니다. 저는 파는 건 자신 있어요.",
    ],
  },
  {
    characterId: "chr_udnge",
    tag: "*",
    direction: "negative",
    quotes: [
      "재고가 남았네요… 제가 파는 재주가 부족한 걸까요.",
      "소문이 너무 앞서가면 곤란해요. 저는 그저 파는 사람일 뿐인데요.",
    ],
  },
  {
    characterId: "chr_udnge",
    tag: "신제품",
    direction: "positive",
    quotes: [
      "새 약이 들어왔습니다. 만든 건 제가 아니지만, 파는 건 제가 제일 잘해요.",
    ],
  },
  {
    characterId: "chr_dante",
    tag: "*",
    direction: "positive",
    quotes: [
      "똑… 딱… 정확한 타이밍이 최고의 수익을 만듭니다. 똑딱.",
      "시간은 정직합니다. 이번에도 한 치의 오차 없이. 똑—딱—",
    ],
  },
  {
    characterId: "chr_dante",
    tag: "*",
    direction: "negative",
    quotes: [
      "톱니 하나가 어긋났군요. 똑… 딱… 곧 제자리에 맞춰 넣겠습니다.",
      "시계는 멈춰도 시간은 흐릅니다. 똑딱. 다시 태엽을 감죠.",
    ],
  },
  {
    characterId: "chr_dante",
    tag: "신제품",
    direction: "positive",
    quotes: [
      "새 무브먼트가 완성됐습니다. 심장이… 아니, 초침이 뜁니다. 똑딱!",
    ],
  },
  {
    characterId: "chr_yisang",
    tag: "*",
    direction: "positive",
    quotes: [
      "기술은 완성되었고, 이제 그 권리를 빌려줄 차례인 듯하오.",
      "발명이 날개라면 특허는 그 비행을 증명하는 궤적이겠지.",
    ],
  },
  {
    characterId: "chr_yisang",
    tag: "*",
    direction: "negative",
    quotes: [
      "실험의 실패보다 무서운 것은, 가능성이 서류 속에서 사장되는 일이오.",
      "예정된 궤도에서 벗어났으나, 계산을 고치면 다시 날 수 있을 것이오.",
    ],
  },
  {
    characterId: "chr_yisang",
    tag: "수주",
    direction: "positive",
    quotes: [
      "새 라이선스 계약이 체결되었소. 생각은 머물지 않고 도시에 퍼질 것이오.",
    ],
  },
  {
    characterId: "chr_yisang",
    tag: "신제품",
    direction: "positive",
    quotes: [
      "새 발명에 번호가 부여되었소. 하나의 이상이 비로소 권리가 되었군.",
    ],
  },
  {
    characterId: "chr_nagusa",
    tag: "*",
    direction: "positive",
    quotes: [
      "닭꼬치를 좋아하는 마음만큼은 자신 있어. 이걸로 충분하다면, 계속해 볼게.",
      "모두가 맛있게 먹어 줬어. 나도 조금은 대표다운 일을 한 걸까.",
    ],
  },
  {
    characterId: "chr_nagusa",
    tag: "*",
    direction: "negative",
    quotes: [
      "역시 나로서는 무리였던 걸까… 그래도, 여기서 물러날 수는 없어.",
      "불판도 공급도 흔들리고 있어. 내가 할 수 있는 것부터 다시 바로잡을게.",
    ],
  },
  {
    characterId: "chr_nagusa",
    tag: "AI",
    direction: "positive",
    quotes: [
      "굽는 시점을 알려주는 장치일 뿐인데… 이걸 AI라고 불러도 되는 걸까?",
    ],
  },
  {
    characterId: "chr_nagusa",
    tag: "조류독감",
    direction: "negative",
    quotes: [
      "안전을 확인하지 않은 닭꼬치는 팔 수 없어. 시간이 걸려도 공급망부터 지킬게.",
    ],
  },
  {
    characterId: "chr_yakumo",
    tag: "*",
    direction: "positive",
    quotes: [
      "출판, 증쇄, 유통. 그야말로 출판부의 모토죠. 이번 호는 완판입니다.",
      "이익이 난다면, 그 길이 곧 올바른 길입니다. 다음 노선도 열어 두죠.",
    ],
  },
  {
    characterId: "chr_yakumo",
    tag: "*",
    direction: "negative",
    quotes: [
      "인쇄가 멈춘다고 출판부가 멈추는 건 아닙니다. 다른 루트부터 확보하죠.",
      "한 번 정한 계획은 접지 않습니다. 손실은 다음 특별호로 만회하겠습니다.",
    ],
  },
  {
    characterId: "chr_yakumo",
    tag: "잠입 판매",
    direction: "positive",
    quotes: [
      "타 학원에서도 레드베어가 팔립니다. 이거야말로 출판부의 승리죠.",
    ],
  },
  {
    characterId: "chr_yakumo",
    tag: "금서 검열",
    direction: "negative",
    quotes: [
      "검열에 굴복할 수는 없습니다. 인쇄와 유통 경로를 다시 짜겠습니다.",
    ],
  },
  {
    characterId: "chr_minori",
    tag: "*",
    direction: "positive",
    quotes: [
      "현장은 거짓말하지 않는다! 노동의 대가는 행동으로 증명하겠다!",
      "동지들이여, 계약은 완수됐다! 이제 정당한 몫을 받아낼 차례다!",
    ],
  },
  {
    characterId: "chr_minori",
    tag: "*",
    direction: "negative",
    quotes: [
      "부당한 조건에는 타협하지 않는다! 전원, 현장으로 집결하라!",
      "임금을 종이로 대신하겠다고? 좋다, 그 종이의 무게를 보여주지!",
    ],
  },
  {
    characterId: "chr_minori",
    tag: "자사주 소각",
    direction: "positive",
    quotes: [
      "보수로 받은 주식은 전량 소각한다! 공매도 세력은 각오하라!",
    ],
  },
  {
    characterId: "chr_minori",
    tag: "보수 갈등",
    direction: "negative",
    quotes: [
      "약속한 보수를 외면한 대가는 의뢰주도 함께 치르게 될 것이다!",
    ],
  },
  // 소라사키 히나 — CSV(선도부 방위산업) 시절 대사를 금융지주로 이관.
  {
    characterId: "chr_bahina",
    tag: "*",
    direction: "positive",
    quotes: [
      "좋은 결과군요. 하지만 저는 아직 자리를 뜨지 않습니다.",
      "성과는 확인했습니다. 다음 업무로 넘어가죠.",
      "만족스럽네요. 잠은 다 끝낸 뒤에 자겠습니다.",
    ],
  },
  {
    characterId: "chr_bahina",
    tag: "*",
    direction: "negative",
    quotes: [
      "질서가 흔들렸군요. 제가 바로 세우겠습니다.",
      "이 정도 혼란은 제가 밤새워 정리하면 됩니다.",
      "물러설 이유가 없습니다. 끝까지 책임지죠.",
    ],
  },
  {
    characterId: "chr_baako",
    tag: "*",
    direction: "positive",
    quotes: [
      "보고드립니다. 계획대로, 오차 없이 완료했습니다.",
      "위원장님께 부끄럽지 않은 결과입니다. 다음 안건으로.",
    ],
  },
  {
    characterId: "chr_baako",
    tag: "*",
    direction: "negative",
    quotes: [
      "규율에 어긋난 결과입니다. 원인을 끝까지 추적하겠습니다.",
      "정정하겠습니다. 같은 실수는 두 번 일어나지 않습니다.",
    ],
  },
];

/**
 * 회사 이벤트가 터질 때 해당 회사 캐릭터가 남기는 한마디.
 * 태그별 톤에 맞춰 결정론(seeded rand)으로 하나 뽑아 뉴스에 붙인다.
 */
export const POSITIVE_QUOTES: Record<string, string[]> = {
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

export const NEGATIVE_QUOTES: Record<string, string[]> = {
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

export const POSITIVE_GENERIC = [
  "흥미로운 하루군요.",
  "시장은 늘 예측불가입니다.",
  "다음 수를 준비하고 있습니다.",
];

export const NEGATIVE_GENERIC = [
  "상황을 무겁게 받아들이고 있습니다.",
  "문제를 피하지 않고 수습하겠습니다.",
  "지금은 변명보다 결과로 책임질 때입니다.",
];

/**
 * 캐릭터별 전용 대사 조회 맵: "characterId|tag|direction" → 대사 후보.
 * data/character-quotes.csv 에서 생성된다(비어 있으면 공용 풀만 사용).
 */
const CHARACTER_QUOTE_LOOKUP = new Map<string, string[]>(
  [...CSV_CHARACTER_QUOTES, ...CORE_CHARACTER_QUOTES]
    .filter((entry) => entry.quotes.length > 0)
    .map((entry) => [
      `${entry.characterId}|${entry.tag}|${entry.direction}`,
      entry.quotes,
    ]),
);

/**
 * 태그·이벤트 방향·화자에 맞는 대사를 seeded rand로 선택한다.
 * 우선순위: 캐릭터 전용(tag) → 캐릭터 기본("*") → 공용 태그 풀 → 공용 기본.
 */
export function pickEventQuote(
  tag: string,
  ceo: Character,
  rand: () => number,
  impact = 0,
): { quote: string; quoteBy: string } {
  const direction = impact < 0 ? "negative" : "positive";
  const sharedPool =
    impact < 0
      ? NEGATIVE_QUOTES[tag] ?? NEGATIVE_GENERIC
      : POSITIVE_QUOTES[tag] ?? POSITIVE_GENERIC;
  const pool =
    CHARACTER_QUOTE_LOOKUP.get(`${ceo.id}|${tag}|${direction}`) ??
    CHARACTER_QUOTE_LOOKUP.get(`${ceo.id}|*|${direction}`) ??
    sharedPool;
  const quote = pool[Math.floor(rand() * pool.length)] ?? pool[0];
  return { quote, quoteBy: `${ceo.emoji} ${ceo.name}` };
}

/**
 * 회사 뉴스뿐 아니라 섹터·거시 뉴스에도 실제 등장인물의 반응을 붙인다.
 * 관련 종목의 경영진을 우선하고, 관련 화자가 없는 거시 뉴스는 전체 기업 중
 * 한 명을 고른다. 이미 전용 대사가 있는 연속 사건은 그대로 보존한다.
 */
export function withCharacterQuote(
  event: MarketEvent,
  rand: () => number,
): MarketEvent {
  if (event.quote) return event;

  const affectedIds = new Set(event.affectedStockIds);
  const related = STOCK_DEFINITIONS.filter(
    (stock) => affectedIds.has(stock.id) && stock.ceoId,
  );
  const candidates = related.length > 0
    ? related
    : STOCK_DEFINITIONS.filter((stock) => stock.ceoId);
  if (candidates.length === 0) return event;

  const index = Math.min(
    Math.floor(rand() * candidates.length),
    candidates.length - 1,
  );
  const speaker = getCharacterById(candidates[index]?.ceoId);
  if (!speaker) return event;

  return {
    ...event,
    ...pickEventQuote(event.tag ?? "시장", speaker, rand, event.impact),
  };
}
