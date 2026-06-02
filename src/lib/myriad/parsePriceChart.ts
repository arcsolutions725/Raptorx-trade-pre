import type { MyriadOutcomeCharts, MyriadOutcomeDetail } from "@/lib/myriad/mapMyriadMarketDetails";

export type ChartTimeframeKey = "24h" | "7d" | "30d" | "all";

export const MYRIAD_CHART_INTERVALS: { label: string; api: ChartTimeframeKey }[] = [
  { label: "24H", api: "24h" },
  { label: "7D", api: "7d" },
  { label: "30D", api: "30d" },
  { label: "ALL", api: "all" },
];

export function parseMyriadPricesSeries(prices: unknown): { ts: number; value: number }[] {
  if (prices == null) return [];
  if (typeof prices === "string") {
    const t = prices.trim();
    if (!t) return [];
    try {
      return parseMyriadPricesSeries(JSON.parse(t));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(prices)) return [];
  const out: { ts: number; value: number }[] = [];
  for (const p of prices) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const ts = Number(o.timestamp ?? o.ts ?? 0);
    const value = Number(o.value ?? o.price ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    if (!Number.isFinite(value)) continue;
    out.push({ ts, value });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function getOutcomeSeriesForTimeframe(
  outcome: MyriadOutcomeDetail,
  timeframe: ChartTimeframeKey
): { ts: number; value: number }[] {
  const charts = outcome.price_charts;
  if (!Array.isArray(charts)) return [];
  const match = charts.find((c: MyriadOutcomeCharts) => c.timeframe === timeframe);
  if (!match) return [];
  return parseMyriadPricesSeries(match.prices);
}

export function buildMyriadMultiChart(
  outcomes: MyriadOutcomeDetail[],
  timeframe: ChartTimeframeKey
): {
  chartData: { time: number; timestamp: number; [k: string]: number | undefined }[];
  marketKeys: { key: string; title: string; color: string }[];
} {
  const MARKET_COLORS = [
    "#ffc000",
    "#00ff88",
    "#00a8ff",
    "#ff6b6b",
    "#1abc9c",
    "#e74c3c",
    "#f59e0b",
    "#ffffff",
  ];

  const seriesByKey: {
    key: string;
    title: string;
    color: string;
    points: { ts: number; value: number }[];
  }[] = [];

  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    const title = (o.title ?? `Outcome ${o.id}`).trim();
    const key = title.replace(/[^a-zA-Z0-9]/g, "_") || `outcome_${i}`;
    seriesByKey.push({
      key,
      title,
      color: MARKET_COLORS[i % MARKET_COLORS.length],
      points: getOutcomeSeriesForTimeframe(o, timeframe),
    });
  }

  const tsSet = new Set<number>();
  for (const s of seriesByKey) {
    for (const p of s.points) tsSet.add(p.ts);
  }
  const timestamps = [...tsSet].sort((a, b) => a - b);
  const chartData = timestamps.map((ts) => {
    const row: { time: number; timestamp: number; [k: string]: number | undefined } = {
      time: ts * 1000,
      timestamp: ts,
    };
    for (const s of seriesByKey) {
      const pt = s.points.find((x) => x.ts === ts);
      if (pt) {
        row[s.key] = pt.value <= 1 ? pt.value * 100 : pt.value;
      }
    }
    return row;
  });

  const marketKeys = seriesByKey.map((s) => ({
    key: s.key,
    title: s.title,
    color: s.color,
  }));

  return { chartData, marketKeys };
}
