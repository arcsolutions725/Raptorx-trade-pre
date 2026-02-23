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
import { getPolymarketInterval } from "@/utils/polymarketTrading";
import { Checkbox } from "@/components/ui/checkbox";

type MarketWithClobToken = {
  clobTokenId: string;
  marketTitle: string;
  ticker: string;
};

type PriceChartProps = {
  markets: MarketWithClobToken[];
  interval: string;
};

// Color palette for multiple market lines
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

// Custom Tooltip Component
type MarketKey = {
  key: string;
  title: string;
  color: string;
};

type ChartDataPoint = {
  time: number;
  timestamp: number;
  [key: string]: number | undefined;
};

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
  const dataPoint = payload[0]?.payload;
  const hoveredTimeMs = dataPoint?.time || 0;

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
      .map((point, index) => ({
        point,
        index,
        time: point.time,
        price: point[market.key],
        hasData:
          point[market.key] !== undefined &&
          point[market.key] !== null &&
          !isNaN(point[market.key] as number),
      }))
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
      price: closestPoint.price as number,
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
            price !== null && price !== undefined && !isNaN(price);

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

export default function PriceChart({ markets, interval }: PriceChartProps) {
  const polymarketInterval = useMemo(
    () => getPolymarketInterval(interval),
    [interval]
  );

  // Fetch historical data for ALL markets
  // Each market gets its own API call using its CLOB token ID
  const marketQueries = useQueries({
    queries: markets.map((market) => ({
      queryKey: [
        "polymarket-historical",
        market.clobTokenId,
        interval,
        polymarketInterval,
      ],
      queryFn: async () => {
        // Build query params - use clob_token_id parameter
        const params = new URLSearchParams();
        params.append("clob_token_id", market.clobTokenId);
        
        // Only add interval parameter if it's not "ALL"
        // For "ALL", the API route will handle it differently (no interval param)
        if (interval !== "ALL" && polymarketInterval) {
          params.append("interval", polymarketInterval);
        }

        const url = `/api/polymarket/historical-data?${params.toString()}`;

        const res = await fetch(url);
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(
            `Failed to fetch historical data: ${res.status} ${errorText}`
          );
        }

        const data = await res.json();

        return {
          market,
          data,
        };
      },
      enabled: !!market.clobTokenId,
      refetchInterval: 30000, // Refetch every 30 seconds
    })),
  });

  // Check loading state
  const isLoadingChart = marketQueries.some((query) => query.isLoading);

  // Transform data for Recharts - combine all markets into a single dataset
  // Also identify which markets have valid data and get last price
  // Sort by last price (descending) and show top 4 markets with highest prices
  const { chartDataFormatted, marketsWithValidData } = useMemo(() => {
    // First pass: Get last price for all markets with valid data
    const marketsWithLastPrice: Array<{
      market: MarketWithClobToken;
      data: any;
      lastPrice: number;
    }> = [];

    marketQueries.forEach((query) => {
      if (!query.data) {
        return;
      }

      const { market, data } = query.data;

      // Check if market has valid price history data
      const hasValidData =
        data &&
        data.s === "ok" &&
        data.t &&
        data.c &&
        Array.isArray(data.t) &&
        Array.isArray(data.c) &&
        data.t.length > 0 &&
        data.c.length > 0 &&
        data.t.length === data.c.length;

      if (!hasValidData) {
        return;
      }

      // Get the last price from the price history
      const lastPrice = data.c[data.c.length - 1];

      // Store market with its last price and data
      marketsWithLastPrice.push({
        market,
        data,
        lastPrice: typeof lastPrice === "number" ? lastPrice : parseFloat(lastPrice) || 0,
      });
    });

    // Sort markets by last price (descending) - top markets by highest price
    const sortedMarketsWithData = marketsWithLastPrice.sort(
      (a, b) => b.lastPrice - a.lastPrice
    );

    // Take top 4 markets by last price (highest prices)
    const topMarkets = sortedMarketsWithData.slice(0, 4);

    // Second pass: Process data only for top markets
    const allDataPoints: Map<number, any> = new Map();

    topMarkets.forEach(({ market, data }) => {
      // Generate market key (must match the one in marketKeys)
      const marketKey = market.marketTitle.replace(/[^a-zA-Z0-9]/g, "_");

      // Process each timestamp/price pair
      data.t.forEach((time: number, priceIndex: number) => {
        if (priceIndex >= data.c.length) {
          return;
        }

        // Timestamp is in seconds (Unix timestamp)
        // Convert to milliseconds for JavaScript Date
        const timeMs = time * 1000;
        const price = data.c[priceIndex] || 0;

        // Price is in decimal format (0-1), convert to percentage (0-100)
        // Example: 0.495 -> 49.5%
        const pricePercent =
          typeof price === "number" ? price * 100 : parseFloat(price) * 100;

        // Use timestamp as key to merge data from different markets
        if (!allDataPoints.has(time)) {
          const date = new Date(timeMs);
          allDataPoints.set(time, {
            time: timeMs,
            timestamp: time, // Keep original timestamp in seconds
            // Format date for X-axis display
            date: date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            dateTime: date.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }

        // Add price for this market (use market title as key, sanitized)
        allDataPoints.get(time)![marketKey] = pricePercent;
      });
    });

    // Convert map to array and sort by timestamp
    const sortedData = Array.from(allDataPoints.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Extract just the markets (sorted by last price - highest first)
    const sortedMarkets = topMarkets.map((item) => item.market);

    return {
      chartDataFormatted: sortedData,
      marketsWithValidData: sortedMarkets,
    };
  }, [marketQueries, markets]);

  // Get market keys for rendering lines - only for markets with valid data
  // marketsWithValidData is already sorted by last price (highest prices first)
  const marketKeys = useMemo(() => {
    // marketsWithValidData already contains top 4 markets by last price (highest prices)
    return marketsWithValidData.map((market, index) => {
      const marketKey = market.marketTitle.replace(/[^a-zA-Z0-9]/g, "_");
      return {
        key: marketKey,
        title: market.marketTitle,
        color: MARKET_COLORS[index % MARKET_COLORS.length],
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

  // Get last price value for each market to display in legend
  const lastPrices = useMemo(() => {
    if (!chartDataFormatted || chartDataFormatted.length === 0) {
      return new Map<string, number>();
    }

    const prices = new Map<string, number>();
    
    marketKeys.forEach((market) => {
      // Find the last point that has a value for this specific market
      for (let i = chartDataFormatted.length - 1; i >= 0; i--) {
        const point = chartDataFormatted[i];
        const value = point[market.key];
        
        if (value !== undefined && value !== null && !isNaN(value)) {
          prices.set(market.key, value as number);
          break;
        }
      }
    });
    
    return prices;
  }, [chartDataFormatted, marketKeys]);

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

  // Get last data point time for each market to show markers
  // Each market may have its last data point at different times
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
        
        if (value !== undefined && value !== null && !isNaN(value)) {
          times.set(market.key, point.time);
          break;
        }
      }
    });
    
    return times;
  }, [chartDataFormatted, marketKeys]);

  if (isLoadingChart) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/60">Loading chart data...</div>
      </div>
    );
  }

  if (!chartDataFormatted || chartDataFormatted.length === 0) {
    const queriesWithData = marketQueries.filter((q) => q.data);
    const queriesWithErrors = marketQueries.filter((q) => q.error);

    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <div className="text-white/60">No chart data available</div>
        {markets.length === 0 && (
          <div className="text-white/40 text-xs">
            No markets with CLOB token IDs found
          </div>
        )}
        {markets.length > 0 && (
          <div className="text-white/40 text-xs">
            Markets: {markets.length}, Loaded: {queriesWithData.length}, Errors:{" "}
            {queriesWithErrors.length}
          </div>
        )}
        {queriesWithErrors.length > 0 && (
          <div className="text-xs text-red-400">
            {queriesWithErrors.map((q, i) => (
              <div key={i}>Error: {q.error?.message || "Unknown error"}</div>
            ))}
          </div>
        )}
        {queriesWithData.length > 0 && (
          <div className="text-white/40 text-xs max-w-md text-center">
            <div>Data received but no points to display.</div>
            <div className="mt-2 text-xs">
              {queriesWithData.map((q, i) => {
                const { market, data } = q.data!;
                return (
                  <div key={i} className="mb-1">
                    {market.marketTitle}: {data.t?.length || 0} timestamps,{" "}
                    {data.c?.length || 0} prices
                  </div>
                );
              })}
            </div>
          </div>
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
                // Ensure value is a number and format as percentage
                const numValue =
                  typeof value === "number" ? value : parseFloat(value) || 0;
                return `${numValue.toFixed(1)}%`;
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
                return value !== undefined && value !== null && !isNaN(value);
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
                  dot={(props: any) => {
                    // Check if this is the last data point for this specific market
                    // The payload contains the data point with the time property
                    if (lastTime !== undefined && props.payload && props.payload.time === lastTime) {
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
