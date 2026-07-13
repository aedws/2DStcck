import { getCharacterById } from "@/data/characters";
import { getCompanyDefinitions } from "@/data/stocks";
import { getEarningsCalendar } from "@/lib/market/earningsCalendar";
import { getCharacterProgress, PRIVATE_CLUE_AFFINITY } from "@/lib/market/characterProgress";
import {
  getPrivateStoryClue,
  getStoryArcForWindow,
  storyWindowStart,
} from "@/lib/market/storyArcs";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import type {
  CharacterProgressMap,
  InvestmentMissionHistory,
} from "@/lib/types/market";

export type CharacterMessageKind = "clue" | "earnings" | "mission" | "relationship";

export interface CharacterMessage {
  id: string;
  characterId: string;
  companyId: string;
  sender: string;
  emoji: string;
  kind: CharacterMessageKind;
  title: string;
  body: string;
  timestamp: number;
  href: string;
}

export function getCharacterMessages({
  progress,
  missionHistory,
  currentSession,
}: {
  progress: CharacterProgressMap;
  missionHistory: InvestmentMissionHistory[];
  currentSession: number;
}): CharacterMessage[] {
  const messages: CharacterMessage[] = [];
  const companies = getCompanyDefinitions();
  const companyByCharacter = new Map(
    companies.filter((company) => company.ceoId).map((company) => [company.ceoId!, company]),
  );

  // 현재·직전 연속 사건의 개인 단서.
  const currentWindow = storyWindowStart(currentSession);
  for (const windowStart of [currentWindow, currentWindow - 5]) {
    const arc = getStoryArcForWindow(windowStart);
    if (!arc.character || currentSession < arc.clueSession) continue;
    const relation = getCharacterProgress(progress, arc.character.id);
    if (relation.affinity < PRIVATE_CLUE_AFFINITY) continue;
    messages.push({
      id: `message-story-${arc.id}`,
      characterId: arc.character.id,
      companyId: arc.company.id,
      sender: arc.character.name,
      emoji: arc.character.emoji,
      kind: "clue",
      title: `${arc.company.name} 사건 · 비공개 단서`,
      body: getPrivateStoryClue(arc, relation.trust),
      timestamp: arc.clueSession * SESSION_DURATION_MS + 1,
      href: "/missions",
    });
  }

  // 3거래일 이내 실적 발표. 신뢰도 60부터 실제 내부 방향을 공유한다.
  for (const earnings of getEarningsCalendar(currentSession + 1, currentSession + 3)) {
    const character = getCharacterById(earnings.company.ceoId);
    if (!character) continue;
    const relation = getCharacterProgress(progress, character.id);
    if (relation.affinity < PRIVATE_CLUE_AFFINITY) continue;
    const informed = relation.trust >= 60;
    messages.push({
      id: `message-${earnings.id}`,
      characterId: character.id,
      companyId: earnings.company.id,
      sender: character.name,
      emoji: character.emoji,
      kind: "earnings",
      title: `${earnings.company.name} 실적 발표 D-${earnings.session - currentSession}`,
      body: informed
        ? earnings.surprisePoint >= 0
          ? `공개 전 수치를 확인했어요. 시장 예상 ${earnings.consensusGrowthPercent.toFixed(1)}%보다 좋은 결과에 가까워요.`
          : `외부에는 말하지 마세요. 시장 예상 ${earnings.consensusGrowthPercent.toFixed(1)}%에 못 미칠 가능성이 높아요.`
        : `곧 실적 발표가 있어요. 예상 변동폭은 ±${earnings.expectedMovePercent.toFixed(1)}%라서 포지션 크기를 확인해 주세요.`,
      timestamp: currentSession * SESSION_DURATION_MS + earnings.session,
      href: "/calendar",
    });
  }

  // 완료한 의뢰의 의뢰인 답장.
  for (const mission of missionHistory.slice(0, 20)) {
    const character = getCharacterById(mission.issuerCharacterId);
    const company = mission.issuerCompanyId
      ? companies.find((item) => item.id === mission.issuerCompanyId)
      : companyByCharacter.get(mission.issuerCharacterId ?? "");
    if (!character || !company) continue;
    const succeeded = mission.status === "completed";
    messages.push({
      id: `message-mission-${mission.id}`,
      characterId: character.id,
      companyId: company.id,
      sender: character.name,
      emoji: character.emoji,
      kind: "mission",
      title: succeeded ? "의뢰 성공을 확인했어요" : "이번 의뢰도 수고했어요",
      body: succeeded
        ? "결과가 인상적이네요. 다음에는 더 중요한 자금을 맡겨도 되겠어요."
        : "결과는 아쉽지만 끝까지 수행한 건 기억할게요. 다음 기회를 준비해 봐요.",
      timestamp: mission.completedAt,
      href: "/missions",
    });
  }

  // 관계 단계 해금 알림.
  for (const [characterId, relation] of Object.entries(progress)) {
    const character = getCharacterById(characterId);
    const company = companyByCharacter.get(characterId);
    if (!character || !company) continue;
    const milestones = [
      { score: 30, title: "이제 비공개로 이야기할게요", body: "중요한 사건과 실적 발표가 가까워지면 개인 단서를 보내드릴게요." },
      { score: 50, title: "전용 의뢰를 맡길 수 있겠네요", body: "당신에게만 맡기는 고난도 투자 의뢰가 열렸어요." },
      { score: 100, title: "가장 믿을 수 있는 특별한 관계", body: "앞으로 제 중요 사건에서는 함께 준비한 최상급 선택을 사용할 수 있어요." },
    ];
    for (const milestone of milestones) {
      if (relation.affinity < milestone.score) continue;
      messages.push({
        id: `message-relation-${characterId}-${milestone.score}`,
        characterId,
        companyId: company.id,
        sender: character.name,
        emoji: character.emoji,
        kind: "relationship",
        title: milestone.title,
        body: milestone.body,
        timestamp:
          milestone.score === 100 && relation.bondedAtSession !== undefined
            ? relation.bondedAtSession * SESSION_DURATION_MS
            : currentSession * SESSION_DURATION_MS - milestone.score,
        href: `/characters/${company.id}`,
      });
    }
  }

  return [...new Map(messages.map((message) => [message.id, message])).values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
}
