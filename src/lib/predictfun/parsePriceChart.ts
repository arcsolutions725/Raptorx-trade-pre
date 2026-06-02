export type PredictFunTimeseriesPoint = { x: number; y: number };

/** API `resolution` enum — must match Predict.fun docs exactly. */
export type PredictFunTimeseriesResolution = "1m" | "5m" | "1h" | "1d" | "1w" | "1M";

/** UI timeframe tabs (aligned with predict.fun explorer). */
export type PredictFunChartTimeframeKey = "1h" | "6h" | "1d" | "1w" | "1m" | "all";

const CHART_SERIES_KEY = "yes";

/** Match Polymarket multi-outcome chart palette. */
export const PREDICT_FUN_CHART_COLORS = [
  "#ffc000",
  "#00ff88",
  "#00a8ff",
  "#ff6b6b",
  "#9b59b6",
  "#f39c12",
];

export const PREDICT_FUN_TOP_CHART_MARKETS = 3;

type PredictFunChartMarketRef = { id: string; title: string };

/** Top N sub-markets for category chart — matches predict.fun (chance desc, then list order). */
export function selectPredictFunTopChartMarkets(
  markets: Array<{ id?: string | number; title?: string; question?: string; chancePercentage?: number }>,
  limit = PREDICT_FUN_TOP_CHART_MARKETS
): PredictFunChartMarketRef[] {
  return markets
    .map((m, index) => ({ m, index }))
    .sort((a, b) => {
      const ca = Number(a.m.chancePercentage ?? 0);
      const cb = Number(b.m.chancePercentage ?? 0);
      if (cb !== ca) return cb - ca;
      return a.index - b.index;
    })
    .map(({ m }) => ({
      id: String(m.id ?? "").trim(),
      title: String(m.title ?? m.question ?? "Outcome").trim(),
    }))
    .filter((m) => /^\d+$/.test(m.id))
    .slice(0, limit);
}

export function predictFunChartKeyFromTitle(title: string): string {
  const key = title.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
  return key || "market";
}

const WINDOW_SECONDS: Record<PredictFunChartTimeframeKey, number> = {
  "1h": 3600,
  "6h": 6 * 3600,
  "1d": 86400,
  "1w": 7 * 86400,
  "1m": 30 * 86400,
  all: 365 * 86400,
};

/**
 * Resolution per UI tab — coarser buckets only for longer windows.
 * (Using `1M` on ALL returns a single point and breaks the chart.)
 */
export const PREDICT_FUN_CHART_INTERVALS: {
  key: PredictFunChartTimeframeKey;
  label: string;
  resolution: PredictFunTimeseriesResolution;
}[] = [
  { key: "1h", label: "1H", resolution: "1m" },
  { key: "6h", label: "6H", resolution: "5m" },
  { key: "1d", label: "1D", resolution: "1h" },
  { key: "1w", label: "1W", resolution: "1h" },
  { key: "1m", label: "1M", resolution: "1d" },
  { key: "all", label: "ALL", resolution: "1d" },
];

export function getPredictFunChartInterval(
  tf: PredictFunChartTimeframeKey
): (typeof PREDICT_FUN_CHART_INTERVALS)[number] {
  return (
    PREDICT_FUN_CHART_INTERVALS.find((i) => i.key === tf) ??
    PREDICT_FUN_CHART_INTERVALS.find((i) => i.key === "1d")!
  );
}

export function getPredictFunTimeseriesRange(tf: PredictFunChartTimeframeKey): {
  resolution: PredictFunTimeseriesResolution;
  fromSec: number;
  toSec: number;
  limit: number;
} {
  const { resolution } = getPredictFunChartInterval(tf);
  const toSec = Math.floor(Date.now() / 1000);
  const windowSec = WINDOW_SECONDS[tf] ?? WINDOW_SECONDS["1d"];
  const fromSec = toSec - windowSec;

  const limitByTf: Record<PredictFunChartTimeframeKey, number> = {
    "1h": 120,
    "6h": 72,
    "1d": 48,
    "1w": 168,
    "1m": 35,
    all: 500,
  };

  return {
    resolution,
    fromSec,
    toSec,
    limit: limitByTf[tf] ?? 500,
  };
}

/** Parse GET /markets/{id}/timeseries response. */
export function extractPredictFunTimeseriesSeries(
  body: unknown
): PredictFunTimeseriesPoint[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object") {
    const layer = data as Record<string, unknown>;
    if (Array.isArray(layer.series)) {
      return layer.series as PredictFunTimeseriesPoint[];
    }
    const nested = layer.data;
    if (nested && typeof nested === "object") {
      const inner = nested as Record<string, unknown>;
      if (Array.isArray(inner.series)) {
        return inner.series as PredictFunTimeseriesPoint[];
      }
    }
  }
  if (Array.isArray(root.series)) {
    return root.series as PredictFunTimeseriesPoint[];
  }
  return [];
}

function normalizeUnixSeconds(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x > 1e12) return Math.floor(x / 1000);
  return Math.floor(x);
}

/**
 * Predict.fun chance values use a 0–100 scale (e.g. 56 → 56%, 1 → 1%).
 * Only values strictly between 0 and 1 are treated as decimal probabilities.
 */
export function normalizePredictFunChancePercent(y: number): number {
  if (!Number.isFinite(y)) return 0;
  if (y > 1) return Math.min(100, Math.max(0, y));
  if (y > 0 && y < 1) return y * 100;
  return Math.max(0, Math.min(100, y));
}

function normalizeChancePercent(y: number): number {
  return normalizePredictFunChancePercent(y);
}

function normalizeTimeseriesPoints(
  series: PredictFunTimeseriesPoint[] | undefined,
  fromSec: number
): { x: number; y: number }[] {
  const seen = new Set<number>();
  const points: { x: number; y: number }[] = [];

  for (const p of series ?? []) {
    const x = normalizeUnixSeconds(p.x);
    if (x < fromSec || x <= 0 || seen.has(x)) continue;
    seen.add(x);
    points.push({ x, y: normalizeChancePercent(p.y) });
  }

  return points.sort((a, b) => a.x - b.x);
}

type ChartRow = { time: number; timestamp: number; [key: string]: number };

/** Carry last known value forward so multi-outcome lines render continuously. */
function forwardFillChartRows(chartData: ChartRow[], keys: string[]): ChartRow[] {
  if (chartData.length < 2 || keys.length === 0) return chartData;
  const last: Record<string, number | undefined> = {};

  for (const row of chartData) {
    for (const key of keys) {
      if (typeof row[key] === "number") {
        last[key] = row[key];
      } else if (last[key] !== undefined) {
        row[key] = last[key]!;
      }
    }
  }

  return chartData;
}

export function buildPredictFunSingleChart(
  series: PredictFunTimeseriesPoint[] | undefined,
  tf: PredictFunChartTimeframeKey,
  seriesTitle = "Yes"
): {
  chartData: ChartRow[];
  marketKeys: { key: string; title: string; color: string }[];
} {
  const { fromSec } = getPredictFunTimeseriesRange(tf);
  const points = normalizeTimeseriesPoints(series, fromSec);

  const chartData = points.map((p) => ({
    time: p.x * 1000,
    timestamp: p.x,
    [CHART_SERIES_KEY]: p.y,
  }));

  return {
    chartData,
    marketKeys: [
      {
        key: CHART_SERIES_KEY,
        title: seriesTitle.trim() || "Yes",
        color: PREDICT_FUN_CHART_COLORS[0],
      },
    ],
  };
}

export function buildPredictFunMultiChart(
  entries: { title: string; series: PredictFunTimeseriesPoint[] }[],
  tf: PredictFunChartTimeframeKey
): {
  chartData: ChartRow[];
  marketKeys: { key: string; title: string; color: string }[];
} {
  const { fromSec } = getPredictFunTimeseriesRange(tf);
  const timeMap = new Map<number, ChartRow>();

  const marketKeys = entries.map((entry, index) => ({
    key: predictFunChartKeyFromTitle(entry.title),
    title: entry.title,
    color: PREDICT_FUN_CHART_COLORS[index % PREDICT_FUN_CHART_COLORS.length],
  }));

  for (const entry of entries) {
    const key = predictFunChartKeyFromTitle(entry.title);
    const points = normalizeTimeseriesPoints(entry.series, fromSec);
    for (const p of points) {
      const timeMs = p.x * 1000;
      let row = timeMap.get(timeMs);
      if (!row) {
        row = { time: timeMs, timestamp: p.x };
        timeMap.set(timeMs, row);
      }
      row[key] = p.y;
    }
  }

  const keys = marketKeys.map((m) => m.key);
  const chartData = forwardFillChartRows(
    [...timeMap.values()].sort((a, b) => a.timestamp - b.timestamp),
    keys
  );

  return { chartData, marketKeys };
}
