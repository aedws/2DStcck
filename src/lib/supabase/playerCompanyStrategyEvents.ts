import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";
import type { PlayerCompanyManagementEvent } from "@/lib/player/playerCompanyManagement";

export type PlayerCompanyStrategyEventType =
  | "guidance"
  | "crisis"
  | "credit"
  | "dividend"
  | "supply"
  | "talent";

export function playerCompanyStrategyEventType(
  event: PlayerCompanyManagementEvent,
): PlayerCompanyStrategyEventType | null {
  if (event.title.includes("가이던스")) return "guidance";
  if (event.title.includes("비상 이사회")) return "crisis";
  if (event.title.includes("회사채")) return "credit";
  if (event.title.includes("정기배당")) return "dividend";
  if (event.title.includes("공급계약")) return "supply";
  if (event.title.includes("스톡옵션")) return "talent";
  return null;
}

/**
 * 회사 경영 결과를 공통 주가·뉴스 원장에 멱등 등록한다.
 * 서버는 저장된 회사 경영 기록과 제목·본문·회차가 일치할 때만 수락한다.
 */
export async function recordPlayerCompanyStrategyEvent(input: {
  stockId: string;
  event: PlayerCompanyManagementEvent;
}): Promise<boolean> {
  const auth = await getCurrentAuth();
  const eventType = playerCompanyStrategyEventType(input.event);
  if (!auth || !eventType) return false;
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "record_player_company_strategy_event",
    {
      p_stock_id: input.stockId.trim().toLowerCase(),
      p_event_key: input.event.id,
      p_event_type: eventType,
      p_event_session: Math.floor(input.event.session),
      p_title: input.event.title,
      p_description: input.event.description,
      p_tone: input.event.tone,
    },
  );
  return !error && data === true;
}
