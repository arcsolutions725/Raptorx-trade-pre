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

/** Probability threshold above which markets are deprioritized in the chart (Kalshi often hides ~99% lines by default). */
const HIGH_PROBABILITY_THRESHOLD = 0.99;

type PriceChartProps = {
  /** Market outcomes from same source as ProbabilityChart (useMarketDetails / RexMarketsReportData). */
  markets: MarketOutcome[];
  interval: string;
  /** Currently selected market ticker (e.g. for trading). Chart will include this market and match Kalshi showcase. */
  selectedMarketTicker?: string | null;
};

// Color palette for multiple market lines (same as Polymarket)
const MARKET_COLORS = [
  "#ffc000", // Yellow (primary)
  "#00ff88", // Green
  "#00a8ff", // Blue
  "#ff6b6b", // Red
  "#9b59b6", // Purple
  "#f39c12", // Orange
  "#1abc9c", // Teal
  "#e74c3c", // Dark Red
];

type MarketKey = {
  key: string;
  title: string;
  color: string;
};

/** Chart data point: time, timestamp, and per-market numeric values. */
type ChartDataPoint = {
  time: number; // ms
  timestamp: number; // seconds
  [key: string]: number | string | undefined;
};

/** Same data generation as ProbabilityChart in RexMarketsReportData: derive chart from current market probabilities (no price-history API). */
function generateMockHistoricalData(
  markets: MarketOutcome[],
  interval: string
): ChartDataPoint[] {
  const days =
    interval === "1W" ? 7 : interval === "1M" ? 30 : 90;
  const numPoints = days <= 1 ? 24 : days <= 7 ? 7 : days <= 30 ? 15 : 30;
  const step = days / numPoints;
  const now = new Date();
  const data: ChartDataPoint[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const dayOffset = days - i * step;
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);

    const point: ChartDataPoint = {
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
      const variation = (Math.random() - 0.5) * baseVariation;
      const trend = (Math.random() - 0.5) * 0.05 * (1 - progress);
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

type CustomTooltipProps = {
  active?: boolean;
  payload?: readonly any[];
  label?: number | string;
  marketKeys: MarketKey[];
  chartData: ChartDataPoint[];
  /** Only show tooltip rows for these (visible) markets; hidden lines are excluded */
  visibleMarketKeys: MarketKey[];
};

const CustomTooltip = ({
  active,
  payload,
  marketKeys,
  chartData,
  visibleMarketKeys,
}: CustomTooltipProps) => {
  if (
    !active ||
    !payload ||
    !payload.length ||
    !chartData ||
    chartData.length === 0
  ) {
    return null;
  }

  // Get the hovered timestamp from payload
  const dataPoint = payload[0]?.payload as ChartDataPoint | undefined;
  const hoveredTimeMs = typeof dataPoint?.time === "number" ? dataPoint.time : 0;

  // Format the main timestamp
  const mainDate = new Date(hoveredTimeMs);
  const mainTimestamp = mainDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Only show data for visible markets (hidden lines are excluded from tooltip)
  const marketKeysToShow = visibleMarketKeys.length > 0 ? visibleMarketKeys : marketKeys;

  // For each visible market, find the closest data point
  const marketData = marketKeysToShow.map((market) => {
    // Find all data points that have data for this market
    const pointsWithData = chartData
      .map((point, index) => {
        const rawPrice = point[market.key];
        const price = typeof rawPrice === "number" && !isNaN(rawPrice) ? rawPrice : null;
        return {
          point,
          index,
          time: point.time,
          price,
          hasData: price !== null,
        };
      })
      .filter((item) => item.hasData);

    if (pointsWithData.length === 0) {
      return {
        market,
        price: null,
        timestamp: null,
        timeMs: null,
      };
    }

    // Find the closest point to the hovered time
    let closestPoint = pointsWithData[0];
    let minDiff = Math.abs(closestPoint.time - hoveredTimeMs);

    for (const item of pointsWithData) {
      const diff = Math.abs(item.time - hoveredTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = item;
      }
    }

    return {
      market,
      price: closestPoint.price,
      timestamp: closestPoint.time,
      timeMs: closestPoint.time,
    };
  });

  return (
    <div
      style={{
        backgroundColor: "#000",
        border: "1px solid rgba(255, 192, 0, 0.3)",
        borderRadius: "6px",
        padding: "8px",
        color: "#fff",
        minWidth: "200px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        zIndex: 30,
      }}
    >
      <div
        style={{
          color: "#ffc000",
          fontWeight: "bold",
          marginBottom: "6px",
          fontSize: "11px",
          borderBottom: "1px solid rgba(255, 192, 0, 0.2)",
          paddingBottom: "4px",
        }}
      >
        {mainTimestamp}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {marketData.map(({ market, price }) => {
          const hasPrice =
            typeof price === "number" && !isNaN(price);

          return (
            <div
              key={market.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "3px 0",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "2px",
                    backgroundColor: market.color,
                  }}
                />
                <span style={{ fontSize: "11px", color: "#fff" }}>
                  {market.title}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {hasPrice ? (
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: market.color,
                    }}
                  >
                    {typeof price === "number" ? price.toFixed(2) : "N/A"}%
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#ffffff40",
                      fontStyle: "italic",
                    }}
                  >
                    No data
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Only include markets with status "active" (exclude finalized, etc.). */
function filterActiveMarkets<T extends { status?: string }>(markets: T[]): T[] {
  return markets.filter((m) => (m.status || "").toLowerCase() === "active");
}

export default function PriceChart({
  markets,
  interval,
  selectedMarketTicker = null,
}: PriceChartProps) {
  const activeMarkets = useMemo(() => filterActiveMarkets(markets), [markets]);

  // Match Kalshi price history showcase: include selected market, prefer markets with prob < 99% (so chart shows moving lines, not flat 99%).
  const topMarkets = useMemo(() => {
    const selected = selectedMarketTicker
      ? activeMarkets.find((m) => m.ticker === selectedMarketTicker)
      : null;
    const rest = activeMarkets.filter(
      (m) => m.ticker !== selected?.ticker
    );
    const belowThreshold = rest.filter(
      (m) => m.probability < HIGH_PROBABILITY_THRESHOLD
    );
    const atOrAboveThreshold = rest.filter(
      (m) => m.probability >= HIGH_PROBABILITY_THRESHOLD
    );
    const preferred = belowThreshold.length >= 4
      ? [...belowThreshold].sort((a, b) => b.probability - a.probability).slice(0, 4)
      : [...belowThreshold]
          .sort((a, b) => b.probability - a.probability)
          .concat(
            atOrAboveThreshold.sort((a, b) => b.probability - a.probability)
          )
          .slice(0, 4);
    const withSelected: MarketOutcome[] = selected
      ? [selected, ...preferred.filter((m) => m.ticker !== selected.ticker)].slice(0, 4)
      : preferred;
    return withSelected;
  }, [activeMarkets, selectedMarketTicker]);

  // Same API as ProbabilityChart in RexMarketsReportData: use market details only, generate chart data locally (no price-history API).
  const chartDataFormatted = useMemo(
    () => generateMockHistoricalData(topMarkets, interval),
    [topMarkets, interval],
  );
  const marketsWithValidData = topMarkets;

  const marketKeys = useMemo(() => {
    // Generate market key (sanitize like Polymarket) but use subtitle for display
    return marketsWithValidData.map((m, idx) => {
      const marketKey = m.subtitle.replace(/[^a-zA-Z0-9]/g, "_");
      return {
        key: marketKey,
        title: m.subtitle,
        color: MARKET_COLORS[idx % MARKET_COLORS.length],
      };
    });
  }, [marketsWithValidData]);

  // Legend checkboxes: hidden = unchecked (line hidden). Default all visible.
  const [hiddenMarketKeys, setHiddenMarketKeys] = useState<Set<string>>(new Set());
  const visibleMarketKeys = useMemo(
    () => marketKeys.filter((m) => !hiddenMarketKeys.has(m.key)),
    [marketKeys, hiddenMarketKeys]
  );
  const toggleMarketVisibility = useCallback((key: string) => {
    setHiddenMarketKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Y-axis domain: expand to data range using 5% steps (0, 5, 10, …, 95, 100)
  const yDomain = useMemo((): [number, number] => {
    if (!chartDataFormatted?.length || !visibleMarketKeys.length) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const point of chartDataFormatted) {
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
    let high = Math.min(100, Math.ceil(max / step) * step);
    if (low >= high) high = Math.min(100, low + step);
    return [low, high];
  }, [chartDataFormatted, visibleMarketKeys]);

  // Y-axis ticks at 5% steps within domain (85, 90, 95, …)
  const yTicks = useMemo(() => {
    const [low, high] = yDomain;
    const step = 5;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [yDomain]);

  const lastPrices = useMemo(() => {
    const prices = new Map<string, number>();
    if (!chartDataFormatted || chartDataFormatted.length === 0) return prices;

    marketKeys.forEach((market) => {
      for (let i = chartDataFormatted.length - 1; i >= 0; i--) {
        const v = chartDataFormatted[i][market.key];
        if (typeof v === "number" && !isNaN(v)) {
          prices.set(market.key, v);
          break;
        }
      }
    });
    return prices;
  }, [chartDataFormatted, marketKeys]);

  // Get last data point time for each market to show markers (like Polymarket)
  const lastDataPointTimes = useMemo(() => {
    if (!chartDataFormatted || chartDataFormatted.length === 0) {
      return new Map<string, number>();
    }

    // Find the last data point time for each individual market
    const times = new Map<string, number>();
    
    marketKeys.forEach((market) => {
      // Find the last point that has a value for this specific market
      for (let i = chartDataFormatted.length - 1; i >= 0; i--) {
        const point = chartDataFormatted[i];
        const value = point[market.key];
        if (typeof value === "number" && !isNaN(value)) {
          times.set(market.key, point.time);
          break;
        }
      }
    });
    
    return times;
  }, [chartDataFormatted, marketKeys]);

  if (!chartDataFormatted || chartDataFormatted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <div className="text-white/60">No chart data available</div>
        {activeMarkets.length === 0 && (
          <div className="text-white/40 text-xs">No markets found</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[280px] w-full">
      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartDataFormatted}
            margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
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
                // value is time in milliseconds
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
              domain={yDomain}
              ticks={yTicks}
              allowDataOverflow={false}
              tickFormatter={(value) => {
                const num =
                  typeof value === "number" ? value : parseFloat(value) || 0;
                return `${num.toFixed(1)}%`;
              }}
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  {...props}
                  marketKeys={marketKeys}
                  chartData={chartDataFormatted}
                  visibleMarketKeys={visibleMarketKeys}
                />
              )}
            />
            <Legend
              wrapperStyle={{ color: "#fff", fontSize: "12px" }}
              content={() => (
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2" style={{ color: "#fff", fontSize: "12px" }}>
                  {marketKeys.map((market) => {
                    const visible = !hiddenMarketKeys.has(market.key);
                    const lastPrice = lastPrices.get(market.key);
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
                          {market.title} {lastPrice !== undefined ? `${lastPrice.toFixed(1)}%` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            />
            {marketKeys.map((market) => {
              if (hiddenMarketKeys.has(market.key)) return null;
              // Check if this market has data in the chart
              const hasData = chartDataFormatted.some((point) => {
                const value = point[market.key];
                return typeof value === "number" && !isNaN(value);
              });

              if (!hasData) {
                return null;
              }

              // Get the last data point time for this market
              const lastTime = lastDataPointTimes.get(market.key);
              
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
                  // Show dot only at the last data point for this market with ping animation
                  dot={(props: { cx?: number; cy?: number; payload?: ChartDataPoint }) => {
                    // Check if this is the last data point for this specific market
                    const payload = props.payload;
                    if (lastTime !== undefined && payload && typeof payload.time === "number" && payload.time === lastTime) {
                      const dotSize = 4;
                      const pingSize = 10;
                      
                      // Convert hex color to RGB for opacity
                      const hexToRgb = (hex: string) => {
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result
                          ? {
                              r: parseInt(result[1], 16),
                              g: parseInt(result[2], 16),
                              b: parseInt(result[3], 16),
                            }
                          : null;
                      };
                      
                      const rgb = hexToRgb(market.color) || { r: 0, g: 0, b: 0 };
                      const colorRgb = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
                      
                      return (
                        <g>
                          {/* Ping animation circle - expanding and fading with smooth easing */}
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={dotSize}
                            fill={colorRgb}
                            opacity={0.75}
                          >
                            <animate
                              attributeName="r"
                              from={dotSize}
                              to={pingSize}
                              dur="1.5s"
                              repeatCount="indefinite"
                              calcMode="spline"
                              keySplines="0.4 0 0.2 1"
                              keyTimes="0;1"
                            />
                            <animate
                              attributeName="opacity"
                              from={0.75}
                              to={0}
                              dur="1.5s"
                              repeatCount="indefinite"
                              calcMode="spline"
                              keySplines="0.4 0 0.2 1"
                              keyTimes="0;1"
                            />
                          </circle>
                          {/* Main dot */}
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={dotSize}
                            fill={market.color}
                            stroke="#000"
                            strokeWidth={1}
                          />
                        </g>
                      );
                    }
                    return null;
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
