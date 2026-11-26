"use client";

import { useMemo, useState, useCallback, useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MarketOutcome } from "@/hooks/useMarketDetails";
import { ChartLegend } from "../../../shared/marketUi";
import { generateKalshiMockHistoricalDataDeterministic } from "../../../shared/mockChartData";
import {
  computeSeriesStats,
  ChartStatsDot,
  getStatsLabelsForPoint,
  CHART_STATS_DOT_MARGIN,
} from "../../../shared/ChartStatsDot";
import {
  formatChartAxisPercent,
  formatChartPercentValue,
} from "../../../shared/chartPercentFormat";

/** Plot margin: room above / below for the Highest / Lowest labels; the y axis sits on the right. */
const CHART_MARGIN = { ...CHART_STATS_DOT_MARGIN, left: 36, right: 0, bottom: 12 };

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
    <div className="mk-tip">
      <div className="mk-tip__time">{mainTimestamp}</div>
      {marketData.map(({ market, price }) => {
        const hasPrice = typeof price === "number" && !isNaN(price);
        return (
          <div key={market.key} className="mk-tip__row">
            <span className="mk-tip__name">
              <i style={{ backgroundColor: market.color }} />
              <span>{market.title}</span>
            </span>
            {hasPrice ? (
              <span className="mk-tip__val" style={{ color: market.color }}>
                {typeof price === "number"
                  ? `${formatChartPercentValue(price, 2)}%`
                  : "N/A"}
              </span>
            ) : (
              <span className="mk-tip__none">No data</span>
            )}
          </div>
        );
      })}
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

  // Same data as right ProbabilityChart: deterministic mock so left and right charts match.
  const chartDataFormatted = useMemo(
    () => generateKalshiMockHistoricalDataDeterministic(topMarkets, interval),
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

  // Unique ids for the area gradients (several charts can be on one page)
  const fillId = `mkfill-${useId().replace(/:/g, "")}`;

  // Legend toggles: hidden = unchecked (line hidden). Default all visible.
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

  // Y-axis ticks at 5% steps within domain (85, 90, 95, …); wider steps (10, 20, 25%) on tall
  // ranges so the right-hand axis keeps a few clean labels like the prototype. Domain is unchanged.
  const yTicks = useMemo(() => {
    const [low, high] = yDomain;
    const step =
      [5, 10, 20, 25].find((s) => (high - low) / s <= 7) ?? 25;
    const ticks: number[] = [];
    for (let v = Math.ceil(low / step) * step; v <= high; v += step) ticks.push(v);
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

  if (!chartDataFormatted || chartDataFormatted.length === 0) {
    return (
      <div className="mk-chart__plot mk-chart__empty">
        <span>No chart data available</span>
        {activeMarkets.length === 0 && <span>No markets found</span>}
      </div>
    );
  }

  return (
    <>
      <div className="mk-chart__plot">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartDataFormatted} margin={CHART_MARGIN}>
            <defs>
              {marketKeys.map((market, index) => (
                <linearGradient
                  key={market.key}
                  id={`${fillId}-${index}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0" stopColor={market.color} stopOpacity={0.16} />
                  <stop offset="1" stopColor={market.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              minTickGap={24}
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
              orientation="right"
              width={44}
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              domain={yDomain}
              ticks={yTicks}
              allowDataOverflow={false}
              tickFormatter={(value) => {
                const num =
                  typeof value === "number" ? value : parseFloat(value) || 0;
                return formatChartAxisPercent(num);
              }}
            />
            <Tooltip
              filterNull={false}
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ zIndex: 10000 }}
              cursor={{ stroke: "rgba(255,236,205,.22)", strokeWidth: 1 }}
              content={(props) => (
                <CustomTooltip
                  {...props}
                  marketKeys={marketKeys}
                  chartData={chartDataFormatted}
                  visibleMarketKeys={visibleMarketKeys}
                />
              )}
            />
            {marketKeys.map((market, index) => {
              if (hiddenMarketKeys.has(market.key)) return null;
              // Check if this market has data in the chart
              const hasData = chartDataFormatted.some((point) => {
                const value = point[market.key];
                return typeof value === "number" && !isNaN(value);
              });

              if (!hasData) {
                return null;
              }

              const stats = seriesStatsMap.get(market.key);
              return (
                <Area
                  key={market.key}
                  type="monotone"
                  dataKey={market.key}
                  name={market.title}
                  stroke={market.color}
                  strokeWidth={2}
                  fill={`url(#${fillId}-${index})`}
                  fillOpacity={1}
                  activeDot={{
                    r: 4,
                    fill: market.color,
                    stroke: "#0B0806",
                    strokeWidth: 1.5,
                  }}
                  connectNulls={true}
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; payload?: ChartDataPoint }) => {
                    const payload = props.payload;
                    if (!payload || typeof payload.time === "undefined") return null;
                    const labels = getStatsLabelsForPoint(payload.time, stats ?? null);
                    if (labels.length === 0) return null;
                    const placement = topPlacementMap.get(market.key);
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
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Series toggles: coloured checks with each series' latest value */}
      <ChartLegend
        items={marketKeys.map((market) => {
          const lastPrice = lastPrices.get(market.key);
          return {
            key: market.key,
            label: market.title,
            color: market.color,
            value:
              lastPrice !== undefined
                ? `${formatChartPercentValue(lastPrice, 2)}%`
                : undefined,
            on: !hiddenMarketKeys.has(market.key),
          };
        })}
        onToggle={toggleMarketVisibility}
      />
    </>
  );
}
