"use client";

import React from "react";

export type SeriesStats = {
  minValue: number;
  minTime: number;
  maxValue: number;
  maxTime: number;
  lastValue: number;
  lastTime: number;
};

/**
 * Compute per-series Lowest, Highest, and Current (last) for chart data.
 * Used to show pulsating dots and labels on each line.
 * Accepts points that may have string properties (e.g. date, dateTime) or optional time; only numeric values are used.
 */
export function computeSeriesStats(
  chartData: Array<Record<string, number | string | undefined> & { time?: number }>,
  dataKey: string
): SeriesStats | null {
  if (!chartData?.length) return null;
  let minValue = Infinity;
  let minTime = 0;
  let maxValue = -Infinity;
  let maxTime = 0;
  let lastValue: number | null = null;
  let lastTime = 0;

  for (let i = 0; i < chartData.length; i++) {
    const point = chartData[i];
    const v = point[dataKey];
    if (typeof v !== "number" || isNaN(v)) continue;
    const pointTime = typeof point.time === "number" && !isNaN(point.time) ? point.time : i;

    if (v < minValue) {
      minValue = v;
      minTime = pointTime;
    }
    if (v > maxValue) {
      maxValue = v;
      maxTime = pointTime;
    }
    lastValue = v;
    lastTime = pointTime;
  }

  if (lastValue === null || minValue === Infinity || maxValue === -Infinity)
    return null;
  return {
    minValue,
    minTime,
    maxValue,
    maxTime,
    lastValue,
    lastTime,
  };
}

/** Same for single-series chart (dataKey is e.g. "price"). */
export function computeSingleSeriesStats(
  chartData: Array<{ time: number; price: number }>
): SeriesStats | null {
  if (!chartData?.length) return null;
  let minValue = Infinity;
  let minTime = 0;
  let maxValue = -Infinity;
  let maxTime = 0;
  let lastValue: number | null = null;
  let lastTime = 0;

  for (let i = 0; i < chartData.length; i++) {
    const point = chartData[i];
    const v = point.price;
    if (typeof v !== "number" || isNaN(v)) continue;
    if (v < minValue) {
      minValue = v;
      minTime = point.time;
    }
    if (v > maxValue) {
      maxValue = v;
      maxTime = point.time;
    }
    lastValue = v;
    lastTime = point.time;
  }

  if (lastValue === null || minValue === Infinity || maxValue === -Infinity)
    return null;
  return {
    minValue,
    minTime,
    maxValue,
    maxTime,
    lastValue,
    lastTime,
  };
}

type ChartStatsDotProps = {
  cx?: number;
  cy?: number;
  /** One or more lines (e.g. "Lowest: 8%", "Highest: 12%", "Current: 6%"). Stacked when multiple. */
  labels: string[];
  color: string;
  /** Series index (0-based). Fallback when isTopHighest/isTopLowest not provided. */
  seriesIndex?: number;
  /** When true, Highest label goes above dot (preferred for top value). When false, goes below. */
  isTopHighest?: boolean;
  /** When true, Lowest label goes below dot (preferred for bottom value). When false, goes above. */
  isTopLowest?: boolean;
  /** When true (e.g. last point), shift label left to avoid right-edge cutoff. */
  isCurrentPriceLabel?: boolean;
};

/** Chart margin to reserve for dots + labels at edges (used by charts). */
export const CHART_STATS_DOT_MARGIN = { top: 40, right: 30, left: 10, bottom: 40 };

/**
 * Pulsating circle with one or more labels. Use in Recharts Line dot prop for
 * Lowest, Highest, and Current points on each series.
 * - Top Highest (max value): label ABOVE dot. Others: BELOW dot.
 * - Top Lowest (min value): label BELOW dot. Others: ABOVE dot.
 * - Current price label: shifted left to avoid right-edge cutoff.
 * All labels are center-aligned.
 */
export function ChartStatsDot({
  cx = 0,
  cy = 0,
  labels,
  color,
  seriesIndex = 0,
  isTopHighest = true,
  isTopLowest = true,
  isCurrentPriceLabel = false,
}: ChartStatsDotProps) {
  const dotSize = 5;
  const pingSize = 12;
  const labelGap = 12;
  const labelOffset = 14;
  if (!labels.length) return null;

  const textAnchor = "middle" as const;
  // Current price labels at right edge: shift left so they don't get cut off
  const currentLabelLeftOffset = 24;
  const labelX = isCurrentPriceLabel ? cx - currentLabelLeftOffset : cx;

  // Top Highest -> above dot; others -> below. Top Lowest -> below dot; others -> above.
  const lowestLabels = labels.filter((l) => l.startsWith("Lowest:"));
  const highestLabels = labels.filter((l) => l.startsWith("Highest:"));
  const currentLabels = labels.filter(
    (l) => !l.startsWith("Lowest:") && !l.startsWith("Highest:")
  );
  const belowLabels = [
    ...(isTopLowest ? lowestLabels : []),
    ...(!isTopHighest ? highestLabels : []),
  ];
  const aboveLabels = [
    ...(!isTopLowest ? lowestLabels : []),
    ...(isTopHighest ? highestLabels : []),
    ...currentLabels,
  ];

  // Black background for each label (approx width from char count, fontSize 10)
  const labelPad = 6;
  const labelHeight = 14;
  const charWidth = 5.5;
  const renderLabel = (
    key: string,
    label: string,
    x: number,
    y: number,
    anchor: "start" | "middle" | "end"
  ) => {
    const w = Math.max(36, label.length * charWidth + labelPad);
    const rectX = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    const rectY = y - 11;
    return (
      <g key={key}>
        <rect x={rectX} y={rectY} width={w} height={labelHeight} fill="#000" rx={3} ry={3} />
        <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={10} fontWeight={600}>
          {label}
        </text>
      </g>
    );
  };

  return (
    <g>
      {/* Pulsating ring */}
      <circle cx={cx} cy={cy} r={dotSize} fill={color} opacity={0.7}>
        <animate
          attributeName="r"
          from={dotSize}
          to={pingSize}
          dur="1.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.2 1"
          keyTimes="0;1"
        />
        <animate
          attributeName="opacity"
          from={0.7}
          to={0}
          dur="1.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.2 1"
          keyTimes="0;1"
        />
      </circle>
      {/* Solid dot */}
      <circle
        cx={cx}
        cy={cy}
        r={dotSize}
        fill={color}
        stroke="#000"
        strokeWidth={1}
      />
      {/* Labels below dot */}
      {belowLabels.map((label, i) =>
        renderLabel(
          `below-${i}`,
          label,
          labelX,
          cy + labelOffset + i * labelGap,
          textAnchor as "start" | "middle" | "end"
        )
      )}
      {/* Labels above dot (Highest, Current) */}
      {aboveLabels.map((label, i) =>
        renderLabel(
          `above-${i}`,
          label,
          labelX,
          cy - labelOffset - i * labelGap,
          textAnchor as "start" | "middle" | "end"
        )
      )}
    </g>
  );
}

/**
 * Returns which labels to show for this payload and whether to render the dot.
 * One label per role (Lowest / Highest / Current); when the same point is e.g. both lowest and current, both labels are returned.
 * payloadTime may be number or string (e.g. from Recharts payload).
 */
export function getStatsLabelsForPoint(
  payloadTime: number | string | undefined,
  stats: SeriesStats | null
): string[] {
  if (!stats) return [];
  const t =
    typeof payloadTime === "number" && !isNaN(payloadTime)
      ? payloadTime
      : Number(payloadTime);
  if (payloadTime == null || isNaN(t)) return [];

  const labels: string[] = [];
  if (stats.minTime === t)
    labels.push(`Lowest: ${stats.minValue.toFixed(1)}%`);
  if (stats.maxTime === t)
    labels.push(`Highest: ${stats.maxValue.toFixed(1)}%`);
  if (stats.lastTime === t)
    labels.push(`${stats.lastValue.toFixed(1)}%`);
  return labels;
}
