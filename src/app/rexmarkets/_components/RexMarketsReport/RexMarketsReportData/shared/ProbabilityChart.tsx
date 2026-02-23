/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState, useCallback } from "react";
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

type ProbabilityChartProps = {
  markets: MarketOutcome[];
  totalVolume?: number;
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

// Color palette for different outcomes
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

export default function ProbabilityChart({
  markets,
  totalVolume,
}: ProbabilityChartProps) {
  const [timeRange, setTimeRange] = useState<"1D" | "1W" | "1M" | "ALL">("ALL");
  const [hiddenMarketKeys, setHiddenMarketKeys] = useState<Set<string>>(new Set());

  const toggleMarketVisibility = useCallback((key: string) => {
    setHiddenMarketKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Get top 4 markets by probability for the chart (same as PriceChart)
  const topMarkets = useMemo(() => {
    return [...markets]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 4);
  }, [markets]);

  const marketKeys = useMemo(
    () =>
      topMarkets.map((m, idx) => ({
        key: m.ticker,
        title: m.subtitle,
        color: COLORS[idx % COLORS.length],
      })),
    [topMarkets],
  );

  const visibleMarketKeys = useMemo(
    () => marketKeys.filter((m) => !hiddenMarketKeys.has(m.key)),
    [marketKeys, hiddenMarketKeys],
  );

  // Generate chart data based on time range
  const chartData = useMemo(() => {
    const days = timeRange === "1D" ? 1 : timeRange === "1W" ? 7 : timeRange === "1M" ? 30 : 90;
    return generateMockHistoricalData(topMarkets, days);
  }, [topMarkets, timeRange]);

  // Y-axis: always fit to visible data range (same as PriceChart)
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

  // Format volume for display
  const formattedVolume = useMemo(() => {
    if (!totalVolume) return "$0";
    if (totalVolume >= 1_000_000) {
      return `$${(totalVolume / 1_000_000).toFixed(2)}M`;
    }
    if (totalVolume >= 1_000) {
      return `$${(totalVolume / 1_000).toFixed(2)}K`;
    }
    return `$${totalVolume.toLocaleString()}`;
  }, [totalVolume]);

  if (!markets || markets.length === 0) {
    return null;
  }

  return (
    <div className="w-full ">
      {/* Header: volume and time range (same as PriceChart) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="text-white/80 text-sm">{formattedVolume}</div>
          <div className="flex items-center gap-1 bg-white/10 rounded p-1">
            {(["1D", "1W", "1M", "ALL"] as const).map((range) => (
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

      {/* Chart */}
      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
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
              contentStyle={{
                backgroundColor: "rgba(0, 0, 0, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "8px",
                color: "#fff",
              }}
              formatter={(value: number | undefined, name: string | undefined) => [
                value !== undefined ? `${(value * 100).toFixed(1)}%` : "—",
                name ?? "",
              ]}
              labelStyle={{ color: "#ffc000" }}
            />
            <Legend
              wrapperStyle={{ color: "#fff", fontSize: "12px" }}
              content={() => (
                <div
                  className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2"
                  style={{ color: "#fff", fontSize: "12px" }}
                >
                  {marketKeys.map((market) => {
                    const visible = !hiddenMarketKeys.has(market.key);
                    const prob = topMarkets.find((m) => m.ticker === market.key)?.probability;
                    return (
                      <div
                        key={market.key}
                        className="flex items-center gap-2 select-none"
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
                          {prob !== undefined ? `${(prob * 100).toFixed(1)}%` : ""}
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

