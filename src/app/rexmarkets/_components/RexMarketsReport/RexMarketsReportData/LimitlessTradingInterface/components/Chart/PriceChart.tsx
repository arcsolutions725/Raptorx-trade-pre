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
import type { LimitlessPriceHistoryPoint } from "@/hooks/useLimitlessHistoricalPrice";
import { Checkbox } from "@/components/ui/checkbox";
import {
  computeSeriesStats,
  computeSingleSeriesStats,
  ChartStatsDot,
  getStatsLabelsForPoint,
  CHART_STATS_DOT_MARGIN,
} from "../../../shared/ChartStatsDot";

const LIMITLESS_LINE_COLOR = "#8B5CF6";

// Color palette for multiple market lines (Limitless primary first, then Polymarket/Kalshi style)
const MARKET_COLORS = [
  "#8B5CF6", // Limitless purple (primary)
  "#00ff88", // Green
  "#00a8ff", // Blue
  "#ff6b6b", // Red
  "#ffc000", // Yellow
  "#9b59b6", // Purple
  "#1abc9c", // Teal
  "#e74c3c", // Dark Red
];

/** Single-series chart data point */
type SingleChartDataPoint = {
  time: number;
  timestamp: number;
  price: number;
};

/** Multi-market chart data point: time + one key per market */
type MultiChartDataPoint = {
  time: number;
  timestamp: number;
  [key: string]: number | undefined;
};

type MarketKey = {
  key: string;
  title: string;
  color: string;
};

type PriceChartProps =
  | {
      /** Multi-market: pre-merged chart data with one key per market */
      chartData: MultiChartDataPoint[];
      marketKeys: MarketKey[];
      history?: never;
      lineName?: never;
    }
  | {
      /** Single-series fallback */
      history: LimitlessPriceHistoryPoint[];
      lineName?: string;
      chartData?: never;
      marketKeys?: never;
    };

function formatSingleChartData(
  history: LimitlessPriceHistoryPoint[]
): SingleChartDataPoint[] {
  if (!history?.length) return [];

  return history
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map(({ ts, price }) => {
      const p = typeof price === "number" ? price : 0;
      const pricePct = p <= 1 ? p * 100 : p;
      return {
        time: ts * 1000,
        timestamp: ts,
        price: pricePct,
      };
    });
}

type CustomTooltipSingleProps = {
  active?: boolean;
  payload?: readonly { payload: SingleChartDataPoint }[];
};

const CustomTooltipSingle = ({ active, payload }: CustomTooltipSingleProps) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const date = new Date(point.time);
  const label = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        backgroundColor: "#000",
        border: "1px solid rgba(139, 92, 246, 0.4)",
        borderRadius: "6px",
        padding: "8px 12px",
        color: "#fff",
        minWidth: "180px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        zIndex: 30,
      }}
    >
      <div
        style={{
          color: LIMITLESS_LINE_COLOR,
          fontWeight: "bold",
          marginBottom: "6px",
          fontSize: "11px",
          borderBottom: "1px solid rgba(139, 92, 246, 0.2)",
          paddingBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "11px", color: "#fff" }}>Yes</span>
        <span
          style={{
            fontSize: "12px",
            fontWeight: "bold",
            color: LIMITLESS_LINE_COLOR,
          }}
        >
          {typeof point.price === "number" ? point.price.toFixed(2) : "—"}%
        </span>
      </div>
    </div>
  );
};

type CustomTooltipMultiProps = {
  active?: boolean;
  payload?: readonly { payload: MultiChartDataPoint }[];
  marketKeys: MarketKey[];
  chartData: MultiChartDataPoint[];
  visibleMarketKeys: MarketKey[];
};

const CustomTooltipMulti = ({
  active,
  payload,
  marketKeys,
  chartData,
  visibleMarketKeys,
}: CustomTooltipMultiProps) => {
  if (!active || !payload?.length || !chartData?.length) return null;

  const dataPoint = payload[0]?.payload as MultiChartDataPoint | undefined;
  const hoveredTimeMs = typeof dataPoint?.time === "number" ? dataPoint.time : 0;

  const mainDate = new Date(hoveredTimeMs);
  const mainTimestamp = mainDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const marketKeysToShow =
    visibleMarketKeys.length > 0 ? visibleMarketKeys : marketKeys;

  const marketData = marketKeysToShow.map((market) => {
    const pointsWithData = chartData
      .map((point) => ({
        point,
        time: point.time,
        price: point[market.key],
        hasData:
          point[market.key] !== undefined &&
          point[market.key] !== null &&
          !isNaN(point[market.key] as number),
      }))
      .filter((item) => item.hasData);

    if (pointsWithData.length === 0) {
      return { market, price: null as number | null };
    }

    let closest = pointsWithData[0];
    let minDiff = Math.abs(closest.time - hoveredTimeMs);
    for (const item of pointsWithData) {
      const diff = Math.abs(item.time - hoveredTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }
    return {
      market,
      price: typeof closest.price === "number" ? closest.price : null,
    };
  });

  return (
    <div
      style={{
        backgroundColor: "#000",
        border: "1px solid rgba(139, 92, 246, 0.4)",
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
          color: LIMITLESS_LINE_COLOR,
          fontWeight: "bold",
          marginBottom: "6px",
          fontSize: "11px",
          borderBottom: "1px solid rgba(139, 92, 246, 0.2)",
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
          );
        })}
      </div>
    </div>
  );
};

export default function PriceChart(props: PriceChartProps) {
  const isMultiMarket = "chartData" in props && props.chartData && props.marketKeys;

  // Single-series mode
  const singleData = useMemo(() => {
    if (!isMultiMarket && "history" in props && props.history) {
      return formatSingleChartData(props.history);
    }
    return [];
  }, [isMultiMarket, "history" in props ? props.history : null]);

  const singleYDomain = useMemo((): [number, number] => {
    if (!singleData.length) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const p of singleData) {
      if (typeof p.price === "number" && !isNaN(p.price)) {
        min = Math.min(min, p.price);
        max = Math.max(max, p.price);
      }
    }
    if (min === Infinity || max === -Infinity) return [0, 100];
    const step = 5;
    const low = Math.max(0, Math.floor(min / step) * step);
    let high = Math.min(100, Math.ceil(max / step) * step);
    if (low >= high) high = Math.min(100, low + step);
    return [low, high];
  }, [singleData]);

  const singleYTicks = useMemo(() => {
    const [low, high] = singleYDomain;
    const step = 5;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [singleYDomain]);

  // Multi-market mode
  const chartDataFormatted = isMultiMarket ? props.chartData : [];
  const marketKeys = isMultiMarket ? props.marketKeys : [];

  const [hiddenMarketKeys, setHiddenMarketKeys] = useState<Set<string>>(
    new Set()
  );
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

  const multiYDomain = useMemo((): [number, number] => {
    if (!chartDataFormatted?.length || !visibleMarketKeys.length)
      return [0, 100];
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

  const multiYTicks = useMemo(() => {
    const [low, high] = multiYDomain;
    const step = 5;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [multiYDomain]);

  const lastPrices = useMemo(() => {
    const prices = new Map<string, number>();
    if (!chartDataFormatted?.length) return prices;
    marketKeys.forEach((market) => {
      for (let i = chartDataFormatted.length - 1; i >= 0; i--) {
        const value = chartDataFormatted[i][market.key];
        if (value !== undefined && value !== null && !isNaN(value)) {
          prices.set(market.key, value);
          break;
        }
      }
    });
    return prices;
  }, [chartDataFormatted, marketKeys]);

  const lastDataPointTimes = useMemo(() => {
    const times = new Map<string, number>();
    if (!chartDataFormatted?.length) return times;
    marketKeys.forEach((market) => {
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

  const seriesStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSeriesStats>>();
    if (!chartDataFormatted?.length) return map;
    marketKeys.forEach((mk) => {
      const stats = computeSeriesStats(chartDataFormatted, mk.key);
      if (stats) map.set(mk.key, stats);
    });
    return map;
  }, [chartDataFormatted, marketKeys]);

  const topPlacementMap = useMemo(() => {
    const map = new Map<string, { isTopHighest: boolean; isTopLowest: boolean }>();
    const visible = marketKeys.filter((m) => !hiddenMarketKeys.has(m.key));
    const statsList = visible
      .map((mk) => ({ key: mk.key, stats: seriesStatsMap.get(mk.key) }))
      .filter((x): x is { key: string; stats: NonNullable<typeof x.stats> } => Boolean(x.stats));
    const globalMax = Math.max(...statsList.map((x) => x.stats.maxValue), -Infinity);
    const globalMin = Math.min(...statsList.map((x) => x.stats.minValue), Infinity);
    const firstTopHighest = statsList.find((x) => x.stats.maxValue >= globalMax)?.key;
    const firstTopLowest = statsList.find((x) => x.stats.minValue <= globalMin)?.key;
    statsList.forEach(({ key }) => {
      map.set(key, { isTopHighest: key === firstTopHighest, isTopLowest: key === firstTopLowest });
    });
    return map;
  }, [marketKeys, hiddenMarketKeys, seriesStatsMap]);

  if (isMultiMarket) {
    if (!chartDataFormatted.length || !marketKeys.length) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="text-white/60">No chart data available</div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full min-h-[280px] w-full">
        <div className="flex-1 min-h-0 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartDataFormatted}
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
                domain={multiYDomain}
                ticks={multiYTicks}
                allowDataOverflow={false}
                tickFormatter={(value) => {
                  const num =
                    typeof value === "number"
                      ? value
                      : parseFloat(String(value)) || 0;
                  return `${num.toFixed(1)}%`;
                }}
              />
              <Tooltip
                content={(tooltipProps) => (
                  <CustomTooltipMulti
                    {...tooltipProps}
                    marketKeys={marketKeys}
                    chartData={chartDataFormatted}
                    visibleMarketKeys={visibleMarketKeys}
                  />
                )}
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
                      const lastPrice = lastPrices.get(market.key);
                      return (
                        <div
                          key={market.key}
                          className="flex items-center gap-2 select-none"
                        >
                          <Checkbox
                            checked={visible}
                            onChange={() =>
                              toggleMarketVisibility(market.key)
                            }
                            size="sm"
                          />
                          <span
                            className="inline-block w-2 h-2 rounded-sm shrink-0"
                            style={{ backgroundColor: market.color }}
                          />
                          <span className="text-white/90">
                            {market.title}{" "}
                            {lastPrice !== undefined
                              ? `${lastPrice.toFixed(1)}%`
                              : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              />
              {marketKeys.map((market, index) => {
                if (hiddenMarketKeys.has(market.key)) return null;
                const hasData = chartDataFormatted.some((point) => {
                  const value = point[market.key];
                  return (
                    value !== undefined &&
                    value !== null &&
                    !isNaN(value as number)
                  );
                });
                if (!hasData) return null;
                const stats = seriesStatsMap.get(market.key);
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
                    isAnimationActive={false}
                    dot={(dotProps: {
                      cx?: number;
                      cy?: number;
                      payload?: MultiChartDataPoint;
                    }) => {
                      const payload = dotProps.payload;
                      if (!payload || typeof payload.time === "undefined") return null;
                      const labels = getStatsLabelsForPoint(payload.time, stats ?? null);
                      if (labels.length === 0) return null;
                      const placement = topPlacementMap.get(market.key);
                      const isCurrent = stats && payload.time === stats.lastTime;
                      return (
                        <ChartStatsDot
                          cx={dotProps.cx}
                          cy={dotProps.cy}
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

  // Single-series mode
  const lineName = props.lineName ?? "Yes";
  if (!singleData.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <div className="text-white/60">No chart data available</div>
      </div>
    );
  }

  const lastPrice = singleData[singleData.length - 1]?.price;
  const singleSeriesStats = useMemo(
    () => computeSingleSeriesStats(singleData),
    [singleData]
  );

  return (
    <div className="flex flex-col h-full min-h-[280px] w-full">
      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={singleData}
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
              domain={singleYDomain}
              ticks={singleYTicks}
              allowDataOverflow={false}
              tickFormatter={(value) => {
                const num =
                  typeof value === "number"
                    ? value
                    : parseFloat(String(value)) || 0;
                return `${num.toFixed(1)}%`;
              }}
            />
            <Tooltip content={<CustomTooltipSingle />} />
            <Line
              type="monotone"
              dataKey="price"
              name={lineName}
              stroke={LIMITLESS_LINE_COLOR}
              strokeWidth={2}
              activeDot={{ r: 4, fill: LIMITLESS_LINE_COLOR }}
              connectNulls
              isAnimationActive={false}
              dot={(dotProps: {
                cx?: number;
                cy?: number;
                payload?: SingleChartDataPoint;
              }) => {
                const payload = dotProps.payload;
                if (!payload || typeof payload.time === "undefined") return null;
                const labels = getStatsLabelsForPoint(
                  payload.time,
                  singleSeriesStats
                );
                if (labels.length === 0) return null;
                const isCurrent = singleSeriesStats && payload.time === singleSeriesStats.lastTime;
                return (
                  <ChartStatsDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
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
      {typeof lastPrice === "number" && !isNaN(lastPrice) && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 mt-2 text-xs text-white/80">
          <span className="w-2 h-2 rounded-sm shrink-0 bg-[#8B5CF6]" />
          <span>{lineName}</span>
          <span className="font-semibold text-[#8B5CF6]">
            {lastPrice.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
