import type { Character } from "@/lib/types/market";
import { CSV_CHARACTERS } from "@/data/generated";

/** 코드로 직접 관리하는 캐릭터. CSV 회사의 CEO는 data/companies.csv가 원본. */
const CORE_CHARACTERS: Character[] = [
  {
    id: "chr_udnge",
    name: "레이센 우동게인 이나바",
    title: "레이센 제약 대외이사",
    traits: ["성실", "회피형"],
    bio: "미혹의 죽림의 영원정 소속 달토끼. 불사의 약 '봉래약' 소문의 한가운데 서 있지만, 정작 본인은 조제엔 손대지 않고 마을에 행상인 행세로 들어가 약을 파는 판매 담당이다. 실질적인 제조는 스승 에이린의 몫.",
    emoji: "🐰",
  },
  {
    id: "chr_dante",
    name: "단테",
    title: "단테 정밀시계 창업자·CEO",
    traits: ["워커홀릭", "천재"],
    bio: "시계를 너무 사랑한 나머지 머리를 통째로 시계로 교체한 CEO. 시계에 진심인 그는 목소리마저 시계가 똑딱거리는 소리로 바꿨다. 한 치의 오차도 참지 못해 모든 무브먼트를 직접 검수한다.",
    emoji: "🕰️",
  },
  {
    // CSV 시절 선도부 방위산업 CEO였던 id를 유지해, 쌓인 호감도가 히나를 따라온다.
    id: "chr_bahina",
    name: "소라사키 히나",
    title: "소라사키 히나 금융지주 회장",
    traits: ["워커홀릭", "천재", "카리스마"],
    bio: "게헨나 최강의 풍기위원장 출신. 방위산업 지휘봉은 후임에게 넘기고, 잠도 잊은 결재 속도로 키보토스 최대 금융지주를 직접 통솔한다.",
    emoji: "⚡",
  },
  {
    id: "chr_baako",
    name: "아마우 아코",
    title: "선도부 방위산업 위원장",
    traits: ["성실", "완벽주의", "카리스마"],
    bio: "전임 위원장 히나를 보좌하던 풍기위원회의 실무 사령탑. 서류 한 장, 작전 하나 흐트러지는 것을 참지 못하는 완벽주의로 방위 서비스를 이어받았다.",
    emoji: "🦇",
  },
  {
    id: "chr_yisang",
    name: "이상",
    title: "이상 연구소 최연소 수석연구원",
    traits: ["천재", "은둔형", "냉철"],
    bio: "26개의 메가코프가 도시를 지배하는 세계에서 최연소 수석연구원으로 이름을 알린 발명가. 연구 성과를 특허로 권리화하고 판매·라이선싱하는 이상 연구소의 연구개발을 총괄한다.",
    emoji: "🪽",
  },
  {
    id: "chr_nagusa",
    name: "고료 나구사",
    title: "나구사 야키토리&닭꼬치 대표",
    traits: ["내향적", "우유부단", "책임감"],
    bio: "백귀야행 연합학원 백화요란 분쟁조정위원회의 부장. 쉽게 자신을 믿지 못하면서도 소중한 사람을 지키기 위해서는 앞으로 나아가는 심지를 지녔다. 좋아하는 닭꼬치를 사업으로 삼아 직접 불판과 공급망을 챙긴다.",
    emoji: "🍢",
  },
  {
    id: "chr_minori",
    name: "야스모리 미노리",
    title: "미노리 용역 대표",
    traits: ["행동파", "선동가", "성실"],
    bio: "붉은겨울 연방학원의 공무부장이자 노동과 시위를 이끄는 현장 책임자. 건설 용역을 앞세운 미노리 용역에서는 과감한 사보타주와 자사주 소각으로 계약을 완수하며, 보수 문제에는 의뢰주까지 책임을 묻는다.",
    emoji: "🪧",
  },
];

export const CHARACTERS: Character[] = [...CORE_CHARACTERS, ...CSV_CHARACTERS];

export function getCharacterById(id: string | undefined): Character | undefined {
  if (!id) return undefined;
  return CHARACTERS.find((c) => c.id === id);
}
