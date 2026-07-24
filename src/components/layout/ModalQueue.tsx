"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 시작 화면에서 여러 팝업(온보딩·운영공지·회신·축하·튜토리얼)이 동시에 겹치지
 * 않도록 한 번에 하나만 노출하는 우선순위 큐. 각 모달은 자신이 뜨고 싶을 때
 * useModalSlot 으로 우선순위를 등록하고, 가장 높은 우선순위(작은 숫자) 하나만
 * 실제로 렌더한다. 앞선 팝업을 닫으면 다음 팝업이 자동으로 이어진다.
 */

/** 우선순위: 숫자가 작을수록 먼저 노출된다. */
export const MODAL_PRIORITY = {
  onboarding: 10,
  serviceNotice: 20,
  bugResponse: 30,
  seasonCeremony: 40,
  firstTrade: 50,
  learningJourney: 60,
  eraTutorial: 70,
} as const;

interface ModalQueueValue {
  claim: (id: string, priority: number) => void;
  release: (id: string) => void;
  activeId: string | null;
}

const ModalQueueContext = createContext<ModalQueueValue | null>(null);

export function ModalQueueProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<Record<string, number>>({});

  const claim = useCallback((id: string, priority: number) => {
    setClaims((prev) => (prev[id] === priority ? prev : { ...prev, [id]: priority }));
  }, []);

  const release = useCallback((id: string) => {
    setClaims((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const activeId = useMemo(() => {
    let best: string | null = null;
    let bestPriority = Number.POSITIVE_INFINITY;
    for (const [id, priority] of Object.entries(claims)) {
      if (priority < bestPriority) {
        bestPriority = priority;
        best = id;
      }
    }
    return best;
  }, [claims]);

  const value = useMemo(
    () => ({ claim, release, activeId }),
    [claim, release, activeId],
  );

  return (
    <ModalQueueContext.Provider value={value}>
      {children}
    </ModalQueueContext.Provider>
  );
}

/**
 * 이 모달이 지금 노출 슬롯을 점유하는지 반환한다. wants=true 인 모달들 중
 * 우선순위가 가장 높은 하나만 true 를 받는다. Provider 가 없으면(예외) 기존처럼
 * wants 를 그대로 돌려준다.
 */
export function useModalSlot(
  id: string,
  priority: number,
  wants: boolean,
): boolean {
  const ctx = useContext(ModalQueueContext);
  const claim = ctx?.claim;
  const release = ctx?.release;

  useEffect(() => {
    if (!claim || !release) return;
    if (wants) claim(id, priority);
    else release(id);
    return () => release(id);
  }, [claim, release, id, priority, wants]);

  return ctx ? ctx.activeId === id : wants;
}
