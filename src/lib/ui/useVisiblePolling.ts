import { useEffect, useRef } from "react";

/**
 * 탭이 화면에 보일 때만 주기적으로 콜백을 실행하는 폴링 훅.
 *
 * 배경 탭(다른 탭·최소화)에서는 폴링을 완전히 멈춰 불필요한 서버 요청과
 * 전송량(egress)을 줄인다 — 유저가 게임 탭을 켜둔 채 방치할 때 배경에서
 * 몇 시간씩 계속 조회하던 것이 egress의 큰 비중이었다. 탭이 다시 보이면
 * 즉시 1회 실행한 뒤 주기 폴링을 재개한다.
 *
 * `deps`가 바뀌면(예: 대상 종목 변경) 효과가 재실행되어 즉시 최신 값으로
 * 한 번 갱신한다. 콜백은 ref로 최신본을 유지하므로 매 틱마다 최신 클로저가
 * 호출된다.
 */
export function useVisiblePolling(
  callback: () => void,
  intervalMs: number,
  deps: React.DependencyList = [],
): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    let timer: number | undefined;
    const tick = () => savedCallback.current();
    const start = () => {
      if (timer !== undefined) return;
      tick(); // 재개(또는 최초) 시 즉시 1회
      timer = window.setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
