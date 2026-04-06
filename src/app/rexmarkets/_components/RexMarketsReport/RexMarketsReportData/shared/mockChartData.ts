/**
 * Deterministic mock chart data so PriceChart and ProbabilityChart
 * (Kalshi/Polymarket) always show the same data when given the same markets and interval.
 */
import type { MarketOutcome } from "@/hooks/useMarketDetails";

/** Simple seeded RNG (mulberry32) for deterministic "random" values */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a number for seeding */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return h >>> 0;
}

export type MockChartPoint = {
  date: string;
  timestamp: number;
  [outcomeKey: string]: number | string | undefined;
};

/**
 * Generate deterministic mock historical data for the same markets + days.
 * Same inputs always produce the same output so left (PriceChart) and right (ProbabilityChart) match.
 * Values per outcome are 0–1 (probability).
 */
export function generateMockHistoricalDataDeterministic(
  markets: MarketOutcome[],
  days: number
): MockChartPoint[] {
  if (!markets?.length) return [];

  const seedStr =
    markets
      .map((m) => m.ticker)
      .sort()
      .join(",") + `:${days}`;
  const seed = hashString(seedStr);
  const random = mulberry32(seed);

  const numPoints =
    days <= 1 ? 24 : days <= 7 ? 7 : days <= 30 ? 15 : 30;
  const step = days / numPoints;
  const now = new Date();
  const data: MockChartPoint[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const dayOffset = days - i * step;
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);

    const point: MockChartPoint = {
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      timestamp: date.getTime(),
    };

    markets.forEach((market) => {
      const currentProb = market.probability;
      const progress = i / numPoints;
      const baseVariation = (1 - progress) * 0.15;
      const variation = (random() - 0.5) * baseVariation;
      const trend = (random() - 0.5) * 0.05 * (1 - progress);
      const adjustedProb = Math.max(
        0,
        Math.min(1, currentProb + variation + trend)
      );
      point[market.subtitle] = adjustedProb;
    });

    data.push(point);
  }

  return data;
}

/** Map interval string (1H, 6H, 1D, 1W, 1M, ALL) to days. Use "ALL" => 90 to match Kalshi. */
export function intervalToDays(interval: string): number {
  if (interval === "1H") return 1 / 24;
  if (interval === "6H") return 6 / 24;
  if (interval === "1D") return 1;
  if (interval === "1W") return 7;
  if (interval === "1M") return 30;
  return 90; // ALL
}

export type KalshiChartDataPoint = {
  time: number;
  timestamp: number;
  date?: string;
  dateTime?: string;
  [key: string]: number | string | undefined;
};

/**
 * Deterministic Kalshi mock chart data: same shape as Kalshi PriceChart
 * (time in ms, sanitized keys, values 0–100%). Same inputs => same chart on left and right.
 */
export function generateKalshiMockHistoricalDataDeterministic(
  markets: MarketOutcome[],
  interval: string
): KalshiChartDataPoint[] {
  if (!markets?.length) return [];
  const days =
    interval === "1H"
      ? 1 / 24
      : interval === "6H"
        ? 6 / 24
        : interval === "1D"
          ? 1
          : interval === "1W"
            ? 7
            : interval === "1M"
              ? 30
              : 90;
  const seedStr =
    markets
      .map((m) => m.ticker)
      .sort()
      .join(",") + `:${days}`;
  const seed = hashString(seedStr);
  const random = mulberry32(seed);

  const numPoints =
    days <= 1 / 24
      ? 24
      : days <= 6 / 24
        ? 12
        : days <= 1
          ? 24
          : days <= 7
            ? 7
            : days <= 30
              ? 15
              : 30;
  const step = days / numPoints;
  const now = new Date();
  const data: KalshiChartDataPoint[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const dayOffset = days - i * step;
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);

    const point: KalshiChartDataPoint = {
      time: date.getTime(),
      timestamp: Math.floor(date.getTime() / 1000),
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dateTime: date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    markets.forEach((market) => {
      const currentProb = market.probability;
      const progress = i / numPoints;
      const baseVariation = (1 - progress) * 0.15;
      const variation = (random() - 0.5) * baseVariation;
      const trend = (random() - 0.5) * 0.05 * (1 - progress);
      const adjustedProb = Math.max(
        0,
        Math.min(1, currentProb + variation + trend)
      );
      const marketKey = market.subtitle.replace(/[^a-zA-Z0-9]/g, "_");
      point[marketKey] = adjustedProb * 100;
    });

    data.push(point);
  }

  return data;
}
