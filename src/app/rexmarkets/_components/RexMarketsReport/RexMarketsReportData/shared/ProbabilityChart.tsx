/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MarketOutcome } from "@/hooks/useMarketDetails";

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
  
  // Get top 4 markets by probability for the chart
  const topMarkets = useMemo(() => {
    return [...markets]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 4);
  }, [markets]);
  
  // Generate chart data based on time range
  const chartData = useMemo(() => {
    const days = timeRange === "1D" ? 1 : timeRange === "1W" ? 7 : timeRange === "1M" ? 30 : 90;
    return generateMockHistoricalData(topMarkets, days);
  }, [topMarkets, timeRange]);
  
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
      {/* Header with legend and volume */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4">
          {topMarkets.map((market, idx) => (
            <div key={market.ticker} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
              />
              <span className="text-white text-sm font-medium">
                {market.subtitle}
              </span>
              <span className="text-[#ffc000] text-sm font-semibold">
                {(market.probability * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
        
        {/* Volume and time range controls */}
        <div className="flex items-center gap-4">
          <div className="text-white/80 text-sm">
            {formattedVolume}
          </div>
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
              domain={[0, 1]}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
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
            {topMarkets.map((market, idx) => (
              <Line
                key={market.ticker}
                type="monotone"
                dataKey={market.subtitle}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: COLORS[idx % COLORS.length] }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

