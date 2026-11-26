"use client";

import { useCallback, useId, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartLegend } from "../../shared/marketUi";
import {
  computeSeriesStats,
  ChartStatsDot,
  getStatsLabelsForPoint,
  CHART_STATS_DOT_MARGIN,
} from "../../shared/ChartStatsDot";
import {
  formatChartAxisPercent,
  formatChartPercentValue,
} from "../../shared/chartPercentFormat";

/**
 * "Odds over time" chart for the Myriad and Predict.fun detail pages (also used by
 * PredictFunTradingInterface). Same data contract as the Limitless chart these pages used before
 * (pre-merged points with one key per series + series keys/colours) and the same maths (5% y-domain
 * steps, closest-point tooltip, Highest / Lowest / current labels, legend toggles), drawn like the
 * Kalshi chart: flat grid, y axis on the right, soft area fills, .mk-tip tooltip and coloured checks.
 * Styles: styles/pages/market.css (.mk-chart__plot, .mk-tip, .mk-legend). Needs the `.rx-mk` root.
 */

type ChartDataPoint = {
  time: number;
  timestamp: number;
  [key: string]: number | undefined;
};

type MarketKey = { key: string; title: string; color: string };

/** Plot margin: room above / below for the Highest / Lowest labels; the y axis sits on the right. */
const CHART_MARGIN = { ...CHART_STATS_DOT_MARGIN, left: 36, right: 0, bottom: 12 };

const isNum = (v: unknown): v is number => typeof v === "number" && !isNaN(v);

function ChartTooltip({
  active,
  payload,
  chartData,
  marketKeys,
  visibleMarketKeys,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartDataPoint }[];
  chartData: ChartDataPoint[];
  marketKeys: MarketKey[];
  visibleMarketKeys: MarketKey[];
}) {
  if (!active || !payload?.length || !chartData.length) return null;

  const dataPoint = payload[0]?.payload;
  const hoveredTimeMs = typeof dataPoint?.time === "number" ? dataPoint.time : 0;
  const mainTimestamp = new Date(hoveredTimeMs).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const keysToShow = visibleMarketKeys.length > 0 ? visibleMarketKeys : marketKeys;
  const rows = keysToShow.map((market) => {
    let closest: { time: number; price: number } | null = null;
    let minDiff = Infinity;
    for (const point of chartData) {
      const v = point[market.key];
      if (!isNum(v)) continue;
      const diff = Math.abs(point.time - hoveredTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = { time: point.time, price: v };
      }
    }
    return { market, price: closest ? closest.price : null };
  });

  return (
    <div className="mk-tip">
      <div className="mk-tip__time">{mainTimestamp}</div>
      {rows.map(({ market, price }) => (
        <div key={market.key} className="mk-tip__row">
          <span className="mk-tip__name">
            <i style={{ backgroundColor: market.color }} />
            <span>{market.title}</span>
          </span>
          {isNum(price) ? (
            <span className="mk-tip__val" style={{ color: market.color }}>
              {`${formatChartPercentValue(price, 2)}%`}
            </span>
          ) : (
            <span className="mk-tip__none">No data</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MarketLineChart({
  chartData,
  marketKeys,
}: {
  chartData: ChartDataPoint[];
  marketKeys: MarketKey[];
}) {
  const fillId = `mkbfill-${useId().replace(/:/g, "")}`;

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

  // Y-axis domain: data range of the visible series in 5% steps (0, 5, …, 100)
  const yDomain = useMemo((): [number, number] => {
    if (!chartData.length || !visibleMarketKeys.length) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const point of chartData) {
      for (const market of visibleMarketKeys) {
        const v = point[market.key];
        if (isNum(v)) {
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
  }, [chartData, visibleMarketKeys]);

  // A few clean labels on the right-hand axis (5, 10, 20 or 25% steps); the domain is unchanged.
  const yTicks = useMemo(() => {
    const [low, high] = yDomain;
    const step = [5, 10, 20, 25].find((s) => (high - low) / s <= 7) ?? 25;
    const ticks: number[] = [];
    for (let v = Math.ceil(low / step) * step; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [yDomain]);

  const lastPrices = useMemo(() => {
    const prices = new Map<string, number>();
    marketKeys.forEach((market) => {
      for (let i = chartData.length - 1; i >= 0; i--) {
        const v = chartData[i][market.key];
        if (isNum(v)) {
          prices.set(market.key, v);
          break;
        }
      }
    });
    return prices;
  }, [chartData, marketKeys]);

  const seriesStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSeriesStats>>();
    if (!chartData.length) return map;
    marketKeys.forEach((mk) => {
      const stats = computeSeriesStats(chartData, mk.key);
      if (stats) map.set(mk.key, stats);
    });
    return map;
  }, [chartData, marketKeys]);

  const topPlacementMap = useMemo(() => {
    const map = new Map<string, { isTopHighest: boolean; isTopLowest: boolean }>();
    const statsList = visibleMarketKeys
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
  }, [visibleMarketKeys, seriesStatsMap]);

  if (!chartData.length || !marketKeys.length) {
    return <div className="mk-chart__plot mk-chart__empty">No chart data available</div>;
  }

  return (
    <>
      <div className="mk-chart__plot">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={CHART_MARGIN}>
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
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
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
              tickFormatter={(value) =>
                formatChartAxisPercent(
                  typeof value === "number" ? value : parseFloat(String(value)) || 0
                )
              }
            />
            <Tooltip
              filterNull={false}
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ zIndex: 10000 }}
              cursor={{ stroke: "rgba(255,236,205,.22)", strokeWidth: 1 }}
              content={(tooltipProps) => (
                <ChartTooltip
                  active={tooltipProps.active}
                  payload={tooltipProps.payload as readonly { payload?: ChartDataPoint }[]}
                  chartData={chartData}
                  marketKeys={marketKeys}
                  visibleMarketKeys={visibleMarketKeys}
                />
              )}
            />
            {marketKeys.map((market, index) => {
              if (hiddenMarketKeys.has(market.key)) return null;
              if (!chartData.some((point) => isNum(point[market.key]))) return null;
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
                  activeDot={{ r: 4, fill: market.color, stroke: "#0B0806", strokeWidth: 1.5 }}
                  connectNulls
                  isAnimationActive={false}
                  dot={(dotProps: { cx?: number; cy?: number; payload?: ChartDataPoint }) => {
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
              lastPrice !== undefined ? `${formatChartPercentValue(lastPrice, 2)}%` : undefined,
            on: !hiddenMarketKeys.has(market.key),
          };
        })}
        onToggle={toggleMarketVisibility}
      />
    </>
  );
}
