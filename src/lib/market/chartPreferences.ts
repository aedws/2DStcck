export const CHART_PREFERENCES_STORAGE_KEY =
  "2dstock-chart-preferences-v1";

export interface ChartPreferences {
  timeframe:
    | "30s"
    | "1m"
    | "3m"
    | "5m"
    | "10m"
    | "30m"
    | "1d"
    | "1w"
    | "1mo"
    | "1y";
  showMa5: boolean;
  showMa20: boolean;
  showEma9: boolean;
  showEma20: boolean;
  showVwap: boolean;
  showBoll: boolean;
  showVolume: boolean;
  showSession: boolean;
  showRsi: boolean;
}

export const DEFAULT_CHART_PREFERENCES: ChartPreferences = {
  timeframe: "30s",
  showMa5: true,
  showMa20: false,
  showEma9: false,
  showEma20: false,
  showVwap: false,
  showBoll: false,
  showVolume: false,
  showSession: false,
  showRsi: false,
};

const TIMEFRAMES = new Set<ChartPreferences["timeframe"]>([
  "30s",
  "1m",
  "3m",
  "5m",
  "10m",
  "30m",
  "1d",
  "1w",
  "1mo",
  "1y",
]);

export function normalizeChartPreferences(
  value: unknown,
): ChartPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CHART_PREFERENCES };
  }
  const candidate = value as Partial<Record<keyof ChartPreferences, unknown>>;
  const booleanOf = (
    key: Exclude<keyof ChartPreferences, "timeframe">,
  ): boolean =>
    typeof candidate[key] === "boolean"
      ? candidate[key]
      : DEFAULT_CHART_PREFERENCES[key];
  return {
    timeframe: TIMEFRAMES.has(
      candidate.timeframe as ChartPreferences["timeframe"],
    )
      ? (candidate.timeframe as ChartPreferences["timeframe"])
      : DEFAULT_CHART_PREFERENCES.timeframe,
    showMa5: booleanOf("showMa5"),
    showMa20: booleanOf("showMa20"),
    showEma9: booleanOf("showEma9"),
    showEma20: booleanOf("showEma20"),
    showVwap: booleanOf("showVwap"),
    showBoll: booleanOf("showBoll"),
    showVolume: booleanOf("showVolume"),
    showSession: booleanOf("showSession"),
    showRsi: booleanOf("showRsi"),
  };
}

export function readChartPreferences(): ChartPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_CHART_PREFERENCES };
  try {
    return normalizeChartPreferences(
      JSON.parse(
        window.localStorage.getItem(CHART_PREFERENCES_STORAGE_KEY) ?? "null",
      ),
    );
  } catch {
    return { ...DEFAULT_CHART_PREFERENCES };
  }
}

export function writeChartPreferences(
  preferences: ChartPreferences,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CHART_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeChartPreferences(preferences)),
    );
  } catch {
    // 비공개 모드·저장공간 제한에서는 현재 화면 설정만 유지한다.
  }
}
