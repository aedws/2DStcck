// AUTO-GENERATED from src/data/characters.ts — edit the original and run `npm run sync:functions`
import type { Character } from "./types.ts";
import { CSV_CHARACTERS } from "./generated.ts";

/** 코드로 직접 관리하는 캐릭터. CSV 회사의 CEO는 data/companies.csv가 원본. */
const CORE_CHARACTERS: Character[] = [];

export const CHARACTERS: Character[] = [...CORE_CHARACTERS, ...CSV_CHARACTERS];

export function getCharacterById(id: string | undefined): Character | undefined {
  if (!id) return undefined;
  return CHARACTERS.find((c) => c.id === id);
}
