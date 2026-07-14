"use client";

import { useState, useMemo } from "react";
import { formatPrice } from "@/lib/market/engine";
import type { StockState } from "@/lib/types/market";
import { useSettingsStore } from "@/store/settingsStore";

export function PriceAlertPanel({ stock }: { stock: StockState }) {
  const allAlerts = useSettingsStore((state) => state.priceAlerts);
  const alerts = useMemo(
    () => allAlerts.filter((alert) => alert.stockId === stock.id),
    [allAlerts, stock.id],
  );
  const addAlert = useSettingsStore((state) => state.addPriceAlert);
  const removeAlert = useSettingsStore((state) => state.removePriceAlert);
  const rearmAlert = useSettingsStore((state) => state.rearmPriceAlert);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState((stock.currentPrice * 1.03 / 100).toFixed(2));
  const [message, setMessage] = useState<string | null>(null);

  function createAlert() {
    const price = Number(target) * 100;
    if (!Number.isFinite(price) || price <= 0) {
      setMessage("올바른 목표 가격을 입력해 주세요.");
      return;
    }
    if (
      (direction === "above" && price <= stock.currentPrice) ||
      (direction === "below" && price >= stock.currentPrice)
    ) {
      setMessage(
        direction === "above"
          ? "상승 알림은 현재가보다 높아야 합니다."
          : "하락 알림은 현재가보다 낮아야 합니다.",
      );
      return;
    }
    addAlert(stock.id, direction, price);
    setMessage("가격 알림을 등록했습니다.");
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">🔔 가격 알림</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">접속 중 목표가 도달 시 알림을 표시합니다.</p>
        </div>
        <span className="text-xs text-[var(--muted)]">현재 {formatPrice(stock.currentPrice)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={direction}
          onChange={(event) => {
            const next = event.target.value as "above" | "below";
            setDirection(next);
            setTarget((stock.currentPrice * (next === "above" ? 1.03 : 0.97) / 100).toFixed(2));
            setMessage(null);
          }}
          className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
        >
          <option value="above">이상 상승</option>
          <option value="below">이하 하락</option>
        </select>
        <div className="flex min-h-11 min-w-36 flex-1 items-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-3">
          <span className="text-sm text-[var(--muted)]">$</span>
          <input
            inputMode="decimal"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="min-w-0 flex-1 bg-transparent px-1 text-right text-sm outline-none"
          />
        </div>
        <button
          type="button"
          onClick={createAlert}
          className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white"
        >
          등록
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-[var(--muted)]">{message}</p>}
      {alerts.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-2 text-xs">
              <span className={alert.triggeredAt ? "text-amber-300" : "text-[var(--foreground)]"}>
                {alert.direction === "above" ? "▲" : "▼"} {formatPrice(alert.targetPrice)}
                {alert.triggeredAt ? " · 도달" : " · 대기"}
              </span>
              <button type="button" onClick={() => rearmAlert(alert.id)} className="ml-auto text-[var(--accent)]">
                재설정
              </button>
              <button type="button" onClick={() => removeAlert(alert.id)} className="text-[var(--muted)]">
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
