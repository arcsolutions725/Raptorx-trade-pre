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

const CHART_LINE_COLOR = "#8B5CF6";
const BEAT_LINE_COLOR = "#94a3b8";

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
    <div className="rounded-md border border-white/10 bg-[#0a0a0a] px-3 py-2 text-xs shadow-lg">
      <div className="text-white/60">{formatAxisTime(row.time)}</div>
      <div className="text-white font-semibold">{formatPredictFunUsdPrice(row.price)}</div>
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

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="grid shrink-0 grid-cols-1 gap-3 border-b border-white/10 px-4 py-3 sm:grid-cols-3">
        <div>
          <div className="text-xs text-white/50">Price to Beat</div>
          <div className="text-lg font-semibold text-white">
            {formatPredictFunUsdPrice(context.startPrice)}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/50">Current Price</div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-lg font-semibold ${
                priceDeltaPct == null
                  ? "text-white"
                  : priceDeltaPct >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
              }`}
            >
              {formatPredictFunUsdPrice(currentPrice)}
            </span>
            {deltaLabel ? (
              <span
                className={`text-xs font-medium ${
                  priceDeltaPct! >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {deltaLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/50">Time Left</div>
          <div className="text-lg font-semibold text-white">{formatTimeLeft(timeLeftMs)}</div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[#0a0a0a]">
        {(isLoading || isFetching) && chartData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
            Loading chart…
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={xDomain}
                tickFormatter={formatAxisTime}
                stroke="rgba(255,255,255,0.35)"
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={formatPredictFunCompactUsd}
                stroke="rgba(255,255,255,0.35)"
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip content={<CryptoTooltip />} />
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
                      stroke="#0a0a0a"
                      strokeWidth={1.5}
                    />
                  );
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/50">
            No price history for this range yet.
          </div>
        )}
      </div>
    </div>
  );
}
