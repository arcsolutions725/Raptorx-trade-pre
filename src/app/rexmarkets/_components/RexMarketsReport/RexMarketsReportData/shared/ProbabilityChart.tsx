/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState, useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MarketOutcome } from "@/hooks/useMarketDetails";
import { Checkbox } from "@/components/ui/checkbox";
import { getPolymarketInterval } from "@/utils/polymarketTrading";
import {
  generateKalshiMockHistoricalDataDeterministic,
} from "./mockChartData";
import {
  computeSeriesStats,
  computeSingleSeriesStats,
  ChartStatsDot,
  getStatsLabelsForPoint,
  CHART_STATS_DOT_MARGIN,
  CHART_LEGEND_WRAPPER_STYLE,
  isChartLegendCheckboxTarget,
} from "./ChartStatsDot";
import {
  formatChartAxisPercent,
  formatChartPercentValue,
} from "./chartPercentFormat";

/** Interval options for Kalshi and Polymarket (match left PriceChart) */
const CHART_INTERVALS = ["1H", "6H", "1D", "1W", "1M", "ALL"] as const;

/** Limitless real chart data (same shape as LimitlessPriceChart) */
export type LimitlessChartDataPoint = {
  time: number;
  timestamp: number;
  [key: string]: number | undefined;
};
export type LimitlessMarketKey = { key: string; title: string; color: string };
export type LimitlessHistoryPoint = { ts: number; price: number };

type ProbabilityChartProps = {
  markets: MarketOutcome[];
  totalVolume?: number;
  /** When provided, use real Limitless data instead of mock (same as LimitlessPriceChart) */
  limitlessChartData?: LimitlessChartDataPoint[];
  limitlessMarketKeys?: LimitlessMarketKey[];
  limitlessHistory?: LimitlessHistoryPoint[];
  /** Volume string for Limitless (e.g. volumeFormatted from market details) */
  limitlessVolumeFormatted?: string;
};

// Generate mock historical data for demonstration
// In production, this would come from an API
function generateMockHistoricalData(
  markets: MarketOutcome[],
  days: number = 30
) {
  const data: Array<Record<string, any>> = [];
  const now = new Date();
  
  // Generate data points for the last N days
  // Use fewer points for shorter time ranges
  const numPoints = days <= 1 ? 24 : days <= 7 ? 7 : days <= 30 ? 15 : 30;
  const step = days / numPoints;
  
  for (let i = 0; i <= numPoints; i++) {
    const dayOffset = days - (i * step);
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    
    const point: Record<string, any> = {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      timestamp: date.getTime(),
    };
    
    // Generate more realistic probability trends
    // Probabilities should trend towards current values over time
    markets.forEach((market) => {
      const currentProb = market.probability;
      // Earlier dates should have more variation, trending to current value
      const progress = i / numPoints; // 0 to 1
      const baseVariation = (1 - progress) * 0.15; // Less variation as we approach current
      const variation = (Math.random() - 0.5) * baseVariation;
      // Add some smooth trend
      const trend = (Math.random() - 0.5) * 0.05 * (1 - progress);
      const adjustedProb = Math.max(0, Math.min(1, currentProb + variation + trend));
      point[market.subtitle] = adjustedProb;
    });
    
    data.push(point);
  }
  
  return data;
}

/** Kalshi: same mock data as left PriceChart so both charts match (0–100%, time in ms, sanitized keys). */
const KALSHI_HIGH_PROBABILITY_THRESHOLD = 0.99;

function filterActiveMarketsKalshi(markets: MarketOutcome[]): MarketOutcome[] {
  return markets.filter((m) => (m.status || "").toLowerCase() === "active");
}

function getKalshiTopMarkets(
  activeMarkets: MarketOutcome[],
  _selectedMarketTicker: string | null
): MarketOutcome[] {
  const belowThreshold = activeMarkets.filter(
    (m) => m.probability < KALSHI_HIGH_PROBABILITY_THRESHOLD
  );
  const atOrAboveThreshold = activeMarkets.filter(
    (m) => m.probability >= KALSHI_HIGH_PROBABILITY_THRESHOLD
  );
  const preferred =
    belowThreshold.length >= 4
      ? [...belowThreshold]
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 4)
      : [...belowThreshold]
          .sort((a, b) => b.probability - a.probability)
          .concat(
            atOrAboveThreshold.sort((a, b) => b.probability - a.probability)
          )
          .slice(0, 4);
  return preferred;
}

// Color palette for different outcomes (Kalshi mock chart – legacy 0–1)
const COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

// Same as Polymarket PriceChart so left and right charts match
const POLYMARKET_CHART_COLORS = [
  "#ffc000", // yellow (primary)
  "#00ff88", // green
  "#00a8ff", // blue
  "#ff6b6b", // red
  "#9b59b6",
  "#f39c12",
  "#1abc9c",
  "#e74c3c",
];

// Build single-series chart data from Limitless history (same as LimitlessPriceChart)
function formatLimitlessSingleData(
  history: LimitlessHistoryPoint[]
): Array<{ time: number; timestamp: number; price: number }> {
  if (!history?.length) return [];
  return history
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map(({ ts, price }) => {
      const p = typeof price === "number" ? price : 0;
      const pricePct = p <= 1 ? p * 100 : p;
      return { time: ts * 1000, timestamp: ts, price: pricePct };
    });
}

const LIMITLESS_LINE_COLOR = "#8B5CF6";

export default function ProbabilityChart({
  markets,
  totalVolume,
  limitlessChartData,
  limitlessMarketKeys,
  limitlessHistory,
  limitlessVolumeFormatted,
}: ProbabilityChartProps) {
  const [timeRange, setTimeRange] = useState<"1H" | "6H" | "1D" | "1W" | "1M" | "ALL">("ALL");
  const [hiddenMarketKeys, setHiddenMarketKeys] = useState<Set<string>>(new Set());

  const isLimitlessMode =
    (limitlessChartData && limitlessChartData.length > 0 && limitlessMarketKeys && limitlessMarketKeys.length > 0) ||
    (limitlessHistory && limitlessHistory.length > 0);

  // Polymarket: markets with CLOB token IDs – use same historical API as left PriceChart
  const polymarketMarkets = useMemo(() => {
    if (isLimitlessMode || !markets?.length) return [];
    return markets
      .filter((m) => !!m.clob_token_id)
      .map((m) => ({
        clobTokenId: m.clob_token_id!,
        marketTitle: m.groupItemTitle || m.subtitle || m.ticker || "Market",
        ticker: m.ticker,
      }));
  }, [markets, isLimitlessMode]);

  const isPolymarketWithClob = polymarketMarkets.length > 0;

  const polymarketIntervalParam = useMemo(
    () => getPolymarketInterval(timeRange),
    [timeRange]
  );

  const polymarketQueries = useQueries({
    queries: polymarketMarkets.map((market) => ({
      queryKey: [
        "polymarket-historical-probability",
        market.clobTokenId,
        timeRange,
        polymarketIntervalParam,
      ],
      queryFn: async () => {
        const params = new URLSearchParams();
        params.append("clob_token_id", market.clobTokenId);
        if (timeRange !== "ALL" && polymarketIntervalParam) {
          params.append("interval", polymarketIntervalParam);
        }
        const url = `/api/polymarket/historical-data?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = await res.json();
        return { market, data };
      },
      enabled: isPolymarketWithClob && !!market.clobTokenId,
      staleTime: 60 * 1000, // Consider fresh for 1 min (reduces refetches)
    })),
  });

  const toggleMarketVisibility = useCallback((key: string) => {
    setHiddenMarketKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Limitless single-series data (same as LimitlessPriceChart)
  const limitlessSingleData = useMemo(
    () => (limitlessHistory ? formatLimitlessSingleData(limitlessHistory) : []),
    [limitlessHistory]
  );

  // Polymarket: build chart data from historical API (same transform as left PriceChart)
  const {
    chartDataPolymarket,
    polymarketMarketKeys,
    polymarketLastPrices,
    polymarketLastDataPointTimes,
  } = useMemo(() => {
    if (!isPolymarketWithClob || polymarketQueries.length === 0) {
      return {
        chartDataPolymarket: [] as Array<Record<string, number | undefined>>,
        polymarketMarketKeys: [] as Array<{ key: string; title: string; color: string }>,
        polymarketLastPrices: new Map<string, number>(),
        polymarketLastDataPointTimes: new Map<string, number>(),
      };
    }
    const marketsWithLastPrice: Array<{
      market: (typeof polymarketMarkets)[number];
      data: any;
      lastPrice: number;
    }> = [];
    polymarketQueries.forEach((query) => {
      if (!query.data) return;
      const { market, data } = query.data;
      const hasValidData =
        data?.s === "ok" &&
        data?.t?.length > 0 &&
        data?.c?.length > 0 &&
        data.t.length === data.c.length;
      if (!hasValidData) return;
      const lastPrice =
        typeof data.c[data.c.length - 1] === "number"
          ? data.c[data.c.length - 1]
          : parseFloat(data.c[data.c.length - 1]) || 0;
      marketsWithLastPrice.push({
        market,
        data,
        lastPrice, // keep 0–1 for sorting (same as PriceChart)
      });
    });
    const sorted = marketsWithLastPrice.sort((a, b) => b.lastPrice - a.lastPrice);
    const topMarketsForChart = sorted.slice(0, 4);
    const allDataPoints: Map<number, Record<string, number | undefined> & { time: number; timestamp: number }> = new Map();
    topMarketsForChart.forEach(({ market, data }) => {
      const marketKey = market.marketTitle.replace(/[^a-zA-Z0-9]/g, "_");
      data.t.forEach((time: number, priceIndex: number) => {
        if (priceIndex >= data.c.length) return;
        const timeMs = time * 1000;
        const price = data.c[priceIndex] ?? 0;
        const pricePercent =
          typeof price === "number" ? price * 100 : parseFloat(price) * 100;
        if (!allDataPoints.has(time)) {
          allDataPoints.set(time, {
            time: timeMs,
            timestamp: time,
          });
        }
        const pt = allDataPoints.get(time)!;
        pt[marketKey] = pricePercent;
      });
    });
    const sortedData = Array.from(allDataPoints.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
    const keys = topMarketsForChart.map((item, index) => ({
      key: item.market.marketTitle.replace(/[^a-zA-Z0-9]/g, "_"),
      title: item.market.marketTitle,
      color: POLYMARKET_CHART_COLORS[index % POLYMARKET_CHART_COLORS.length],
    }));
    const lastPrices = new Map<string, number>();
    const lastTimes = new Map<string, number>();
    keys.forEach((mk) => {
      for (let i = sortedData.length - 1; i >= 0; i--) {
        const v = sortedData[i][mk.key];
        if (typeof v === "number" && !isNaN(v)) {
          lastPrices.set(mk.key, v);
          lastTimes.set(mk.key, sortedData[i].time);
          break;
        }
      }
    });
    return {
      chartDataPolymarket: sortedData,
      polymarketMarketKeys: keys,
      polymarketLastPrices: lastPrices,
      polymarketLastDataPointTimes: lastTimes,
    };
  }, [isPolymarketWithClob, polymarketMarkets, polymarketQueries]);

  const polymarketVisibleKeys = useMemo(
    () =>
      polymarketMarketKeys.filter((m) => !hiddenMarketKeys.has(m.key)),
    [polymarketMarketKeys, hiddenMarketKeys]
  );

  const polymarketYDomain = useMemo((): [number, number] => {
    if (
      !chartDataPolymarket.length ||
      !polymarketVisibleKeys.length
    )
      return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const point of chartDataPolymarket) {
      for (const market of polymarketVisibleKeys) {
        const v = point[market.key];
        if (typeof v === "number" && !isNaN(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    if (min === Infinity || max === -Infinity) return [0, 100];
    const step = 5;
    const low = Math.max(0, Math.floor(min / step) * step);
    let high = Math.min(100, Math.ceil(max / step) * step);
    if (low >= high) high = Math.min(100, low + step);
    return [low, high];
  }, [chartDataPolymarket, polymarketVisibleKeys]);

  const polymarketYTicks = useMemo(() => {
    const [low, high] = polymarketYDomain;
    const step = 5;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [polymarketYDomain]);

  const polymarketSeriesStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSeriesStats>>();
    if (!chartDataPolymarket?.length) return map;
    polymarketMarketKeys.forEach((mk) => {
      const stats = computeSeriesStats(chartDataPolymarket, mk.key);
      if (stats) map.set(mk.key, stats);
    });
    return map;
  }, [chartDataPolymarket, polymarketMarketKeys]);

  const polymarketTopPlacementMap = useMemo(() => {
    const map = new Map<string, { isTopHighest: boolean; isTopLowest: boolean }>();
    const visible = polymarketMarketKeys.filter((m) => !hiddenMarketKeys.has(m.key));
    const statsList = visible
      .map((mk) => ({ key: mk.key, stats: polymarketSeriesStatsMap.get(mk.key) }))
      .filter((x): x is { key: string; stats: NonNullable<typeof x.stats> } => Boolean(x.stats));
    const globalMax = Math.max(...statsList.map((x) => x.stats.maxValue), -Infinity);
    const globalMin = Math.min(...statsList.map((x) => x.stats.minValue), Infinity);
    const firstTopHighest = statsList.find((x) => x.stats.maxValue >= globalMax)?.key;
    const firstTopLowest = statsList.find((x) => x.stats.minValue <= globalMin)?.key;
    statsList.forEach(({ key }) => {
      map.set(key, { isTopHighest: key === firstTopHighest, isTopLowest: key === firstTopLowest });
    });
    return map;
  }, [polymarketMarketKeys, hiddenMarketKeys, polymarketSeriesStatsMap]);

  const isLoadingPolymarketChart =
    isPolymarketWithClob &&
    polymarketQueries.some((q) => q.isLoading);

  // Only use Kalshi mock chart when outcomes look like Kalshi (status "active").
  // Otherwise Myriad/Limitless/etc. without clob_token_id would hit this branch, filter to zero
  // active rows, and show an empty chart.
  const hasKalshiStyleActiveOutcomes =
    (markets?.some((m) => (m.status || "").toLowerCase() === "active") ?? false);
  const isKalshiMode =
    !isLimitlessMode &&
    !isPolymarketWithClob &&
    (markets?.length ?? 0) > 0 &&
    hasKalshiStyleActiveOutcomes;

  const activeMarketsKalshi = useMemo(
    () => (isKalshiMode ? filterActiveMarketsKalshi(markets!) : []),
    [isKalshiMode, markets]
  );

  const kalshiTopMarkets = useMemo(
    () =>
      isKalshiMode ? getKalshiTopMarkets(activeMarketsKalshi, null) : [],
    [isKalshiMode, activeMarketsKalshi]
  );

  const kalshiInterval = useMemo(() => timeRange, [timeRange]);

  const kalshiChartData = useMemo(() => {
    if (!isKalshiMode || kalshiTopMarkets.length === 0) return [];
    return generateKalshiMockHistoricalDataDeterministic(
      kalshiTopMarkets,
      kalshiInterval
    );
  }, [isKalshiMode, kalshiTopMarkets, kalshiInterval]);

  const kalshiMarketKeys = useMemo(
    () =>
      kalshiTopMarkets.map((m, idx) => {
        const marketKey = m.subtitle.replace(/[^a-zA-Z0-9]/g, "_");
        return {
          key: marketKey,
          title: m.subtitle,
          color: POLYMARKET_CHART_COLORS[idx % POLYMARKET_CHART_COLORS.length],
        };
      }),
    [kalshiTopMarkets]
  );

  const kalshiVisibleKeys = useMemo(
    () => kalshiMarketKeys.filter((m) => !hiddenMarketKeys.has(m.key)),
    [kalshiMarketKeys, hiddenMarketKeys]
  );

  const kalshiYDomain = useMemo((): [number, number] => {
    if (!kalshiChartData.length || !kalshiVisibleKeys.length) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const point of kalshiChartData) {
      for (const market of kalshiVisibleKeys) {
        const v = point[market.key];
        if (typeof v === "number" && !isNaN(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    if (min === Infinity || max === -Infinity) return [0, 100];
    const step = 5;
    const low = Math.max(0, Math.floor(min / step) * step);
    let high = Math.min(100, Math.ceil(max / step) * step);
    if (low >= high) high = Math.min(100, low + step);
    return [low, high];
  }, [kalshiChartData, kalshiVisibleKeys]);

  const kalshiYTicks = useMemo(() => {
    const [low, high] = kalshiYDomain;
    const step = 5;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [kalshiYDomain]);

  const kalshiLastPrices = useMemo(() => {
    const prices = new Map<string, number>();
    if (!kalshiChartData.length) return prices;
    kalshiMarketKeys.forEach((market) => {
      for (let i = kalshiChartData.length - 1; i >= 0; i--) {
        const v = kalshiChartData[i][market.key];
        if (typeof v === "number" && !isNaN(v)) {
          prices.set(market.key, v);
          break;
        }
      }
    });
    return prices;
  }, [kalshiChartData, kalshiMarketKeys]);

  const kalshiLastDataPointTimes = useMemo(() => {
    const times = new Map<string, number>();
    if (!kalshiChartData.length) return times;
    kalshiMarketKeys.forEach((market) => {
      for (let i = kalshiChartData.length - 1; i >= 0; i--) {
        const v = kalshiChartData[i][market.key];
        if (typeof v === "number" && !isNaN(v)) {
          times.set(market.key, kalshiChartData[i].time);
          break;
        }
      }
    });
    return times;
  }, [kalshiChartData, kalshiMarketKeys]);

  const kalshiSeriesStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSeriesStats>>();
    if (!kalshiChartData?.length) return map;
    kalshiMarketKeys.forEach((mk) => {
      const stats = computeSeriesStats(kalshiChartData, mk.key);
      if (stats) map.set(mk.key, stats);
    });
    return map;
  }, [kalshiChartData, kalshiMarketKeys]);

  const kalshiTopPlacementMap = useMemo(() => {
    const map = new Map<string, { isTopHighest: boolean; isTopLowest: boolean }>();
    const visible = kalshiMarketKeys.filter((m) => !hiddenMarketKeys.has(m.key));
    const statsList = visible
      .map((mk) => ({ key: mk.key, stats: kalshiSeriesStatsMap.get(mk.key) }))
      .filter((x): x is { key: string; stats: NonNullable<typeof x.stats> } => Boolean(x.stats));
    const globalMax = Math.max(...statsList.map((x) => x.stats.maxValue), -Infinity);
    const globalMin = Math.min(...statsList.map((x) => x.stats.minValue), Infinity);
    const firstTopHighest = statsList.find((x) => x.stats.maxValue >= globalMax)?.key;
    const firstTopLowest = statsList.find((x) => x.stats.minValue <= globalMin)?.key;
    statsList.forEach(({ key }) => {
      map.set(key, { isTopHighest: key === firstTopHighest, isTopLowest: key === firstTopLowest });
    });
    return map;
  }, [kalshiMarketKeys, hiddenMarketKeys, kalshiSeriesStatsMap]);

  // Legacy: topMarkets / marketKeys / chartData for non-Kalshi mock (unused when Kalshi/Polymarket/Limitless)
  const topMarkets = useMemo(() => {
    if (isLimitlessMode || !markets?.length || isPolymarketWithClob || isKalshiMode) return [];
    return [...markets]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 4);
  }, [markets, isLimitlessMode, isPolymarketWithClob, isKalshiMode]);

  const marketKeys = useMemo(
    () =>
      topMarkets.map((m, idx) => ({
        key: m.ticker,
        title: m.subtitle,
        color: COLORS[idx % COLORS.length],
      })),
    [topMarkets],
  );

  const visibleMarketKeys = useMemo(() => {
    if (isLimitlessMode && limitlessMarketKeys) {
      return limitlessMarketKeys.filter((m) => !hiddenMarketKeys.has(m.key));
    }
    return marketKeys.filter((m) => !hiddenMarketKeys.has(m.key));
  }, [isLimitlessMode, limitlessMarketKeys, marketKeys, hiddenMarketKeys]);

  const chartData = useMemo(() => {
    if (isLimitlessMode) return [];
    const days =
      timeRange === "1H"
        ? 1 / 24
        : timeRange === "6H"
          ? 6 / 24
          : timeRange === "1D"
            ? 1
            : timeRange === "1W"
              ? 7
              : timeRange === "1M"
                ? 30
                : 90;
    return generateMockHistoricalData(topMarkets, days);
  }, [topMarkets, timeRange, isLimitlessMode]);

  const yDomain = useMemo((): [number, number] => {
    if (!chartData.length || visibleMarketKeys.length === 0) return [0, 1];
    let min = 1;
    let max = 0;
    for (const point of chartData) {
      for (const market of visibleMarketKeys) {
        const v = point[market.title] as number | undefined;
        if (typeof v === "number" && !isNaN(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    if (min >= max) return [0, 1];
    const step = 0.05;
    const low = Math.max(0, Math.floor(min / step) * step);
    const high = Math.min(1, Math.ceil(max / step) * step);
    return [low, high === low ? Math.min(1, low + step) : high];
  }, [chartData, visibleMarketKeys]);

  const yTicks = useMemo(() => {
    const [low, high] = yDomain;
    const step = 0.05;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [yDomain]);

  // Limitless multi: Y domain 0–100 (same as LimitlessPriceChart)
  const limitlessMultiYDomain = useMemo((): [number, number] => {
    if (!limitlessChartData?.length || !visibleMarketKeys.length) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const point of limitlessChartData) {
      for (const market of visibleMarketKeys) {
        const v = point[market.key];
        if (typeof v === "number" && !isNaN(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    if (min === Infinity || max === -Infinity) return [0, 100];
    const step = 5;
    const low = Math.max(0, Math.floor(min / step) * step);
    const high = Math.min(100, Math.ceil(max / step) * step);
    return [low, low >= high ? Math.min(100, low + step) : high];
  }, [limitlessChartData, visibleMarketKeys]);

  const limitlessSingleYDomain = useMemo((): [number, number] => {
    if (!limitlessSingleData.length) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const p of limitlessSingleData) {
      if (typeof p.price === "number" && !isNaN(p.price)) {
        min = Math.min(min, p.price);
        max = Math.max(max, p.price);
      }
    }
    if (min === Infinity || max === -Infinity) return [0, 100];
    const step = 5;
    const low = Math.max(0, Math.floor(min / step) * step);
    const high = Math.min(100, Math.ceil(max / step) * step);
    return [low, low >= high ? Math.min(100, low + step) : high];
  }, [limitlessSingleData]);

  const limitlessYTicks = (domain: [number, number]) => {
    const [low, high] = domain;
    const step = 5;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  };

  const limitLessMultiSeriesStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSeriesStats>>();
    if (!limitlessChartData?.length || !limitlessMarketKeys?.length) return map;
    limitlessMarketKeys.forEach((mk) => {
      const stats = computeSeriesStats(limitlessChartData, mk.key);
      if (stats) map.set(mk.key, stats);
    });
    return map;
  }, [limitlessChartData, limitlessMarketKeys]);

  const limitlessTopPlacementMap = useMemo(() => {
    const map = new Map<string, { isTopHighest: boolean; isTopLowest: boolean }>();
    const visible = limitlessMarketKeys?.filter((m) => !hiddenMarketKeys.has(m.key)) ?? [];
    const statsList = visible
      .map((mk) => ({ key: mk.key, stats: limitLessMultiSeriesStatsMap.get(mk.key) }))
      .filter((x): x is { key: string; stats: NonNullable<typeof x.stats> } => Boolean(x.stats));
    const globalMax = Math.max(...statsList.map((x) => x.stats.maxValue), -Infinity);
    const globalMin = Math.min(...statsList.map((x) => x.stats.minValue), Infinity);
    const firstTopHighest = statsList.find((x) => x.stats.maxValue >= globalMax)?.key;
    const firstTopLowest = statsList.find((x) => x.stats.minValue <= globalMin)?.key;
    statsList.forEach(({ key }) => {
      map.set(key, { isTopHighest: key === firstTopHighest, isTopLowest: key === firstTopLowest });
    });
    return map;
  }, [limitlessMarketKeys, hiddenMarketKeys, limitLessMultiSeriesStatsMap]);

  const limitLessSingleSeriesStats = useMemo(
    () => computeSingleSeriesStats(limitlessSingleData),
    [limitlessSingleData]
  );

  // Format volume for display (Limitless: use volumeFormatted when provided)
  const formattedVolume = useMemo(() => {
    if (limitlessVolumeFormatted != null && limitlessVolumeFormatted !== "") {
      return limitlessVolumeFormatted.startsWith("$") ? limitlessVolumeFormatted : `$${limitlessVolumeFormatted}`;
    }
    if (!totalVolume) return "$0";
    if (totalVolume >= 1_000_000) {
      return `$${(totalVolume / 1_000_000).toFixed(2)}M`;
    }
    if (totalVolume >= 1_000) {
      return `$${(totalVolume / 1_000).toFixed(2)}K`;
    }
    return `$${totalVolume.toLocaleString()}`;
  }, [totalVolume, limitlessVolumeFormatted]);

  if (isLimitlessMode) {
    // Limitless multi-market chart (same data as LimitlessPriceChart)
    if (limitlessChartData && limitlessChartData.length > 0 && limitlessMarketKeys && limitlessMarketKeys.length > 0) {
      return (
        <div className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="text-white/80 text-sm">{formattedVolume}</div>
          </div>
          <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={limitlessChartData}
                margin={CHART_STATS_DOT_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  stroke="#ffffff60"
                  tick={{ fill: "#ffffff80", fontSize: 12 }}
                  interval="preserveStartEnd"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                />
                <YAxis
                  stroke="#ffffff60"
                  tick={{ fill: "#ffffff80", fontSize: 12 }}
                  domain={limitlessMultiYDomain}
                  ticks={limitlessYTicks(limitlessMultiYDomain)}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 10000 }}
                  contentStyle={{
                    backgroundColor: "rgba(0, 0, 0, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined
                      ? `${formatChartPercentValue(Number(value), 2)}%`
                      : "—"
                  }
                />
                <Legend
                  wrapperStyle={CHART_LEGEND_WRAPPER_STYLE}
                  content={() => (
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 pointer-events-auto touch-manipulation">
                      {limitlessMarketKeys.map((market) => (
                        <div
                          key={market.key}
                          className="flex items-center gap-2 select-none cursor-pointer touch-manipulation"
                          onClick={(e) => {
                            if (isChartLegendCheckboxTarget(e.target)) return;
                            toggleMarketVisibility(market.key);
                          }}
                        >
                          <Checkbox
                            checked={!hiddenMarketKeys.has(market.key)}
                            onChange={() => toggleMarketVisibility(market.key)}
                            size="sm"
                          />
                          <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: market.color }} />
                          <span className="text-white/90">{market.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                />
                {limitlessMarketKeys.map((market, index) => {
                  if (hiddenMarketKeys.has(market.key)) return null;
                  const stats = limitLessMultiSeriesStatsMap.get(market.key);
                  return (
                    <Line
                      key={market.key}
                      type="monotone"
                      dataKey={market.key}
                      name={market.title}
                      stroke={market.color}
                      strokeWidth={2}
                      activeDot={{ r: 4, fill: market.color }}
                      connectNulls
                      dot={(props: any) => {
                        const payload = props.payload;
                        if (!payload || typeof payload.time === "undefined") return null;
                        const labels = getStatsLabelsForPoint(payload.time, stats ?? null);
                        if (labels.length === 0) return null;
                        const placement = limitlessTopPlacementMap.get(market.key);
                        const isCurrent = stats && payload.time === stats.lastTime;
                        return (
                          <ChartStatsDot
                            cx={props.cx}
                            cy={props.cy}
                            labels={labels}
                            color={market.color}
                            seriesIndex={index}
                            isTopHighest={placement?.isTopHighest ?? true}
                            isTopLowest={placement?.isTopLowest ?? true}
                            isCurrentPriceLabel={isCurrent ?? false}
                          />
                        );
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    // Limitless single-series (same data as LimitlessPriceChart)
    if (limitlessSingleData.length > 0) {
      return (
        <div className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="text-white/80 text-sm">{formattedVolume}</div>
          </div>
          <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={limitlessSingleData}
                margin={CHART_STATS_DOT_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  stroke="#ffffff60"
                  tick={{ fill: "#ffffff80", fontSize: 12 }}
                  interval="preserveStartEnd"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                />
                <YAxis
                  stroke="#ffffff60"
                  tick={{ fill: "#ffffff80", fontSize: 12 }}
                  domain={limitlessSingleYDomain}
                  ticks={limitlessYTicks(limitlessSingleYDomain)}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 10000 }}
                  contentStyle={{
                    backgroundColor: "rgba(0, 0, 0, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined
                      ? `${formatChartPercentValue(Number(value), 2)}%`
                      : "—"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  name="Yes"
                  stroke={LIMITLESS_LINE_COLOR}
                  strokeWidth={2}
                  activeDot={{ r: 4, fill: LIMITLESS_LINE_COLOR }}
                  dot={(props: any) => {
                    const payload = props.payload;
                    if (!payload || typeof payload.time === "undefined") return null;
                    const labels = getStatsLabelsForPoint(
                      payload.time,
                      limitLessSingleSeriesStats
                    );
                    if (labels.length === 0) return null;
                    const isCurrent = limitLessSingleSeriesStats && payload.time === limitLessSingleSeriesStats.lastTime;
                    return (
                      <ChartStatsDot
                        cx={props.cx}
                        cy={props.cy}
                        labels={labels}
                        color={LIMITLESS_LINE_COLOR}
                        isCurrentPriceLabel={isCurrent ?? false}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    // Limitless but no data yet (loading or empty)
    return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="text-white/80 text-sm">{formattedVolume}</div>
        </div>
        <div className="w-full h-[400px] flex items-center justify-center">
          <div className="text-white/60">No chart data available</div>
        </div>
      </div>
    );
  }

  // Polymarket: real historical data (same chart as left PriceChart)
  if (isPolymarketWithClob) {
    if (isLoadingPolymarketChart) {
      return (
        <div className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="text-white/80 text-sm">{formattedVolume}</div>
            <div className="flex items-center gap-1 bg-white/10 rounded p-1">
              {CHART_INTERVALS.map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    timeRange === range
                      ? "bg-[#ffc000] text-black"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="w-full h-[400px] flex items-center justify-center">
            <div className="text-white/60">Loading chart data...</div>
          </div>
        </div>
      );
    }
    if (!chartDataPolymarket.length) {
      return (
        <div className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="text-white/80 text-sm">{formattedVolume}</div>
            <div className="flex items-center gap-1 bg-white/10 rounded p-1">
              {CHART_INTERVALS.map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    timeRange === range
                      ? "bg-[#ffc000] text-black"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="w-full h-[400px] flex items-center justify-center">
            <div className="text-white/60">No chart data available</div>
          </div>
        </div>
      );
    }
    return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="text-white/80 text-sm">{formattedVolume}</div>
            <div className="flex items-center gap-1 bg-white/10 rounded p-1">
              {CHART_INTERVALS.map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    timeRange === range
                      ? "bg-[#ffc000] text-black"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="w-full h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartDataPolymarket}
              margin={CHART_STATS_DOT_MARGIN}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                stroke="#ffffff40"
                tick={{ fill: "#ffffff60", fontSize: 11 }}
                interval="preserveStartEnd"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <YAxis
                stroke="#ffffff40"
                tick={{ fill: "#ffffff60", fontSize: 11 }}
                domain={polymarketYDomain}
                ticks={polymarketYTicks}
                allowDataOverflow={false}
                tickFormatter={(value) =>
                  formatChartAxisPercent(
                    typeof value === "number"
                      ? value
                      : parseFloat(String(value)) || 0
                  )
                }
              />
              <Tooltip
                wrapperStyle={{ zIndex: 10000 }}
                contentStyle={{
                  backgroundColor: "#000",
                  border: "1px solid rgba(255, 192, 0, 0.3)",
                  borderRadius: "6px",
                  color: "#fff",
                }}
                formatter={(value: number | undefined) =>
                  value !== undefined && !isNaN(value)
                    ? `${formatChartPercentValue(Number(value), 2)}%`
                    : "—"
                }
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }}
              />
              <Legend
                wrapperStyle={CHART_LEGEND_WRAPPER_STYLE}
                content={() => (
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 pointer-events-auto touch-manipulation">
                    {polymarketMarketKeys.map((market) => {
                      const visible = !hiddenMarketKeys.has(market.key);
                      const lastPrice = polymarketLastPrices.get(market.key);
                      return (
                        <div
                          key={market.key}
                          className="flex items-center gap-2 select-none cursor-pointer touch-manipulation"
                          onClick={(e) => {
                            if (isChartLegendCheckboxTarget(e.target)) return;
                            toggleMarketVisibility(market.key);
                          }}
                        >
                          <Checkbox
                            checked={visible}
                            onChange={() => toggleMarketVisibility(market.key)}
                            size="sm"
                          />
                          <span
                            className="inline-block w-2 h-2 rounded-sm shrink-0"
                            style={{ backgroundColor: market.color }}
                          />
                          <span className="text-white/90">
                            {market.title}{" "}
                            {lastPrice !== undefined
                              ? `${formatChartPercentValue(lastPrice, 2)}%`
                              : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              />
              {polymarketMarketKeys.map((market, index) => {
                if (hiddenMarketKeys.has(market.key)) return null;
                const hasData = chartDataPolymarket.some((point) => {
                  const v = point[market.key];
                  return typeof v === "number" && !isNaN(v);
                });
                if (!hasData) return null;
                const stats = polymarketSeriesStatsMap.get(market.key);
                return (
                  <Line
                    key={market.key}
                    type="monotone"
                    dataKey={market.key}
                    name={market.title}
                    stroke={market.color}
                    strokeWidth={2}
                    activeDot={{ r: 4, fill: market.color }}
                    connectNulls={true}
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const payload = props.payload;
                      if (!payload || typeof payload.time === "undefined") return null;
                      const labels = getStatsLabelsForPoint(payload.time, stats ?? null);
                      if (labels.length === 0) return null;
                      const placement = polymarketTopPlacementMap.get(market.key);
                      const isCurrent = stats && payload.time === stats.lastTime;
                      return (
                        <ChartStatsDot
                          cx={props.cx}
                          cy={props.cy}
                          labels={labels}
                          color={market.color}
                          seriesIndex={index}
                          isTopHighest={placement?.isTopHighest ?? true}
                          isTopLowest={placement?.isTopLowest ?? true}
                          isCurrentPriceLabel={isCurrent ?? false}
                        />
                      );
                    }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Kalshi: same chart as left PriceChart (mock data 0–100%, same top-markets logic and interval)
  if (isKalshiMode) {
    return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="text-white/80 text-sm">{formattedVolume}</div>
            <div className="flex items-center gap-1 bg-white/10 rounded p-1">
              {CHART_INTERVALS.map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    timeRange === range
                      ? "bg-[#ffc000] text-black"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>
        {kalshiTopMarkets.length === 0 ? (
          <div className="w-full h-[400px] flex items-center justify-center">
            <div className="text-white/60">No chart data available</div>
          </div>
        ) : (
          <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={kalshiChartData}
                margin={CHART_STATS_DOT_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  stroke="#ffffff40"
                  tick={{ fill: "#ffffff60", fontSize: 11 }}
                  interval="preserveStartEnd"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis
                  stroke="#ffffff40"
                  tick={{ fill: "#ffffff60", fontSize: 11 }}
                  domain={kalshiYDomain}
                  ticks={kalshiYTicks}
                  allowDataOverflow={false}
                  tickFormatter={(value) =>
                    formatChartAxisPercent(
                      typeof value === "number"
                        ? value
                        : parseFloat(String(value)) || 0
                    )
                  }
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 10000 }}
                  contentStyle={{
                    backgroundColor: "#000",
                    border: "1px solid rgba(255, 192, 0, 0.3)",
                    borderRadius: "6px",
                    color: "#fff",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined && !isNaN(value)
                      ? `${formatChartPercentValue(Number(value), 2)}%`
                      : "—"
                  }
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }}
                />
                <Legend
                  wrapperStyle={CHART_LEGEND_WRAPPER_STYLE}
                  content={() => (
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 pointer-events-auto touch-manipulation">
                      {kalshiMarketKeys.map((market) => {
                        const visible = !hiddenMarketKeys.has(market.key);
                        const lastPrice = kalshiLastPrices.get(market.key);
                        return (
                          <div
                            key={market.key}
                            className="flex items-center gap-2 select-none cursor-pointer touch-manipulation"
                            onClick={(e) => {
                              if (isChartLegendCheckboxTarget(e.target)) return;
                              toggleMarketVisibility(market.key);
                            }}
                          >
                            <Checkbox
                              checked={visible}
                              onChange={() => toggleMarketVisibility(market.key)}
                              size="sm"
                            />
                            <span
                              className="inline-block w-2 h-2 rounded-sm shrink-0"
                              style={{ backgroundColor: market.color }}
                            />
                            <span className="text-white/90">
                              {market.title}{" "}
                              {lastPrice !== undefined
                                ? `${formatChartPercentValue(lastPrice, 2)}%`
                                : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                />
                {kalshiMarketKeys.map((market, index) => {
                  if (hiddenMarketKeys.has(market.key)) return null;
                  const hasData = kalshiChartData.some((point) => {
                    const v = point[market.key];
                    return typeof v === "number" && !isNaN(v);
                  });
                  if (!hasData) return null;
                  const stats = kalshiSeriesStatsMap.get(market.key);
                  return (
                    <Line
                      key={market.key}
                      type="monotone"
                      dataKey={market.key}
                      name={market.title}
                      stroke={market.color}
                      strokeWidth={2}
                      activeDot={{ r: 4, fill: market.color }}
                      connectNulls={true}
                      isAnimationActive={false}
                      dot={(props: any) => {
                        const payload = props.payload;
                        if (!payload || typeof payload.time === "undefined") return null;
                        const labels = getStatsLabelsForPoint(payload.time, stats ?? null);
                        if (labels.length === 0) return null;
                        const placement = kalshiTopPlacementMap.get(market.key);
                        const isCurrent = stats && payload.time === stats.lastTime;
                        return (
                          <ChartStatsDot
                            cx={props.cx}
                            cy={props.cy}
                            labels={labels}
                            color={market.color}
                            seriesIndex={index}
                            isTopHighest={placement?.isTopHighest ?? true}
                            isTopLowest={placement?.isTopLowest ?? true}
                            isCurrentPriceLabel={isCurrent ?? false}
                          />
                        );
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  if (!markets || markets.length === 0) {
    return null;
  }

  return (
    <div className="w-full ">
      {/* Fallback mock chart (0–1) – only if not Kalshi/Polymarket/Limitless */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="text-white/80 text-sm">{formattedVolume}</div>
          <div className="flex items-center gap-1 bg-white/10 rounded p-1">
            {CHART_INTERVALS.map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  timeRange === range
                    ? "bg-[#ffc000] text-black"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={CHART_STATS_DOT_MARGIN}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
            <XAxis
              dataKey="date"
              stroke="#ffffff60"
              tick={{ fill: "#ffffff80", fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#ffffff60"
              tick={{ fill: "#ffffff80", fontSize: 12 }}
              domain={yDomain}
              ticks={yTicks}
              tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
            />
            <Tooltip
              wrapperStyle={{ zIndex: 10000 }}
              contentStyle={{
                backgroundColor: "rgba(0, 0, 0, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "8px",
                color: "#fff",
              }}
              formatter={(value: number | undefined, name: string | undefined) => [
                value !== undefined
                  ? `${formatChartPercentValue(value * 100, 2)}%`
                  : "—",
                name ?? "",
              ]}
              labelStyle={{ color: "#ffc000" }}
            />
            <Legend
              wrapperStyle={CHART_LEGEND_WRAPPER_STYLE}
              content={() => (
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 pointer-events-auto touch-manipulation">
                  {marketKeys.map((market) => {
                    const visible = !hiddenMarketKeys.has(market.key);
                    const prob = topMarkets.find((m) => m.ticker === market.key)?.probability;
                    return (
                      <div
                        key={market.key}
                        className="flex items-center gap-2 select-none cursor-pointer touch-manipulation"
                        onClick={(e) => {
                          if (isChartLegendCheckboxTarget(e.target)) return;
                          toggleMarketVisibility(market.key);
                        }}
                      >
                        <Checkbox
                          checked={visible}
                          onChange={() => toggleMarketVisibility(market.key)}
                          size="sm"
                        />
                        <span
                          className="inline-block w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: market.color }}
                        />
                        <span className="text-white/90">
                          {market.title}{" "}
                          {prob !== undefined
                            ? `${formatChartPercentValue(prob * 100, 2)}%`
                            : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            />
            {topMarkets.map((market, idx) => {
              if (hiddenMarketKeys.has(market.ticker)) return null;
              return (
                <Line
                  key={market.ticker}
                  type="monotone"
                  dataKey={market.subtitle}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: COLORS[idx % COLORS.length] }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

