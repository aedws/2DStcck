import type { Character } from "@/lib/types/market";

/** 회사를 운영하는 캐릭터들. StockDefinition.ceoId 로 연결된다. */
export const CHARACTERS: Character[] = [
  {
    id: "ba_rio",
    name: "츠카츠키 리오",
    title: "CEO",
    traits: ["천재", "은둔형", "회피형"],
    bio: "모습을 드러내지 않고 태스크 목록만으로 회사 전체를 지휘하는 은둔형 천재.",
    emoji: "🛰️",
  },
];

export function getCharacterById(id: string | undefined): Character | undefined {
  if (!id) return undefined;
  return CHARACTERS.find((c) => c.id === id);
}
