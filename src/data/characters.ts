import type { Character } from "@/lib/types/market";
import { CSV_CHARACTERS } from "@/data/generated";

/** 코드로 직접 관리하는 캐릭터. CSV 회사의 CEO는 data/companies.csv가 원본. */
const CORE_CHARACTERS: Character[] = [];

export const CHARACTERS: Character[] = [...CORE_CHARACTERS, ...CSV_CHARACTERS];

export function getCharacterById(id: string | undefined): Character | undefined {
  if (!id) return undefined;
  return CHARACTERS.find((c) => c.id === id);
}
