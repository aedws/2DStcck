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
];

export const CHARACTERS: Character[] = [...CORE_CHARACTERS, ...CSV_CHARACTERS];

export function getCharacterById(id: string | undefined): Character | undefined {
  if (!id) return undefined;
  return CHARACTERS.find((c) => c.id === id);
}
