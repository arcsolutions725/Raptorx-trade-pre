"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PredictFunCryptoChartContext } from "@/lib/predictfun/predictFunCryptoMarket";
import {
  formatPredictFunCompactUsd,
  formatPredictFunUsdPrice,
} from "@/lib/predictfun/predictFunCryptoMarket";
import { usePredictFunCryptoPriceChart } from "@/hooks/usePredictFunCryptoPriceChart";
import "@/styles/pages/market-venues-b.css";

/** Price line (gold, like the first series of the odds charts) and the dashed "price to beat" line. */
const CHART_LINE_COLOR = "#ffc000";
const BEAT_LINE_COLOR = "#9E9D9C";

type ChartRow = { time: number; timestamp: number; price: number };

function formatTimeLeft(ms: number | null): string {
  if (ms == null) return "—";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours} hr${hours === 1 ? "" : "s"} ${minutes} min${minutes === 1 ? "" : "s"}`;
  }
  if (minutes > 0) {
    return `${minutes} min${minutes === 1 ? "" : "s"} ${seconds} sec${seconds === 1 ? "" : "s"}`;
  }
  return `${seconds} sec${seconds === 1 ? "" : "s"}`;
}

function formatAxisTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function CryptoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload: ChartRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="mk-tip">
      <div className="mk-tip__time">{formatAxisTime(row.time)}</div>
      <div className="mk-tip__row">
        <span className="mk-tip__name">
          <i style={{ backgroundColor: CHART_LINE_COLOR }} />
          <span>Price</span>
        </span>
        <span className="mk-tip__val">{formatPredictFunUsdPrice(row.price)}</span>
      </div>
    </div>
  );
}

export default function PredictFunCryptoUpDownChart({
  context,
  className = "",
}: {
  context: PredictFunCryptoChartContext;
  className?: string;
}) {
  const {
    chartData,
    currentPrice,
    priceDeltaPct,
    timeLeftMs,
    xDomain,
    isLoading,
    isFetching,
  } = usePredictFunCryptoPriceChart(context);

  const yDomain = useMemo((): [number, number] => {
    const values = chartData.map((row) => row.price);
    if (context.startPrice != null && Number.isFinite(context.startPrice)) {
      values.push(context.startPrice);
    }
    if (currentPrice != null && Number.isFinite(currentPrice)) {
      values.push(currentPrice);
    }
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.08, max * 0.0005, 1);
    return [min - pad, max + pad];
  }, [chartData, context.startPrice, currentPrice]);

  const deltaLabel =
    priceDeltaPct == null
      ? null
      : `${priceDeltaPct >= 0 ? "+" : ""}${priceDeltaPct.toFixed(2)}%`;
  const tone = priceDeltaPct == null ? "" : priceDeltaPct >= 0 ? "is-up" : "is-down";

  return (
    <div className={`mkb-cu${className ? ` ${className}` : ""}`}>
      {/* Price to beat · current price (+ move) · time left */}
      <dl className="mkb-cu__stats">
        <div>
          <dt>Price to beat</dt>
          <dd>{formatPredictFunUsdPrice(context.startPrice)}</dd>
        </div>
        <div>
          <dt>Current price</dt>
          <dd className={tone || undefined}>
            {formatPredictFunUsdPrice(currentPrice)}
            {deltaLabel ? <span className={`mkb-cu__delta ${tone}`}>{deltaLabel}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Time left</dt>
          <dd>{formatTimeLeft(timeLeftMs)}</dd>
        </div>
      </dl>

      {(isLoading || isFetching) && chartData.length === 0 ? (
        <div className="mk-chart__plot mk-chart__empty" role="status">
          Loading chart…
        </div>
      ) : chartData.length > 0 ? (
        <div className="mk-chart__plot">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 16, right: 0, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={xDomain}
                tickFormatter={formatAxisTime}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                orientation="right"
                domain={yDomain}
                tickFormatter={formatPredictFunCompactUsd}
                axisLine={false}
                tickLine={false}
                tickMargin={6}
                width={72}
              />
              <Tooltip
                content={<CryptoTooltip />}
                cursor={{ stroke: "rgba(255,236,205,.22)", strokeWidth: 1 }}
              />
              {context.startPrice != null && Number.isFinite(context.startPrice) ? (
                <ReferenceLine
                  y={context.startPrice}
                  stroke={BEAT_LINE_COLOR}
                  strokeDasharray="4 4"
                  strokeOpacity={0.8}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="price"
                stroke={CHART_LINE_COLOR}
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, index } = props;
                  if (index !== chartData.length - 1 || cx == null || cy == null) return null;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={CHART_LINE_COLOR}
                      stroke="#0B0806"
                      strokeWidth={1.5}
                    />
                  );
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mk-chart__plot mk-chart__empty">No price history for this range yet.</div>
      )}
    </div>
  );
}
