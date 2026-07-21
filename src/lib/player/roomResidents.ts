import { getCharacterById } from "@/data/characters";
import { getCharacterProgress } from "@/lib/market/characterProgress";
import type { CharacterProgressMap } from "@/lib/types/market";

/** CEO를 마이룸 상주 인원으로 초대할 수 있는 친밀도 기준. */
export const ROOM_RESIDENT_AFFINITY = 100;
/** 작은 방에서도 서로 겹치지 않도록 상주 인원은 최대 3명으로 제한한다. */
export const ROOM_RESIDENT_LIMIT = 3;

export function normalizeRoomResidentCharacterIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || seen.has(raw) || !getCharacterById(raw)) continue;
    seen.add(raw);
    result.push(raw);
    if (result.length >= ROOM_RESIDENT_LIMIT) break;
  }
  return result;
}

export function canInviteRoomResident(
  characterId: string,
  progress: CharacterProgressMap,
): boolean {
  return (
    Boolean(getCharacterById(characterId)) &&
    getCharacterProgress(progress, characterId).affinity >= ROOM_RESIDENT_AFFINITY
  );
}
