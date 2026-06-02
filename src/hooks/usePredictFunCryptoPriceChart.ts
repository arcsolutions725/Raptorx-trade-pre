"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PredictFunCryptoChartContext } from "@/lib/predictfun/predictFunCryptoMarket";
import { useCryptoLivePriceStream } from "@/hooks/useCryptoLivePriceStream";

export type PredictFunCryptoPricePoint = { x: number; y: number };

type ChartRow = { time: number; timestamp: number; price: number };

function pickInterval(windowMs: number): "1m" | "5m" | "15m" {
  if (windowMs <= 60 * 60 * 1000) return "1m";
  if (windowMs <= 6 * 60 * 60 * 1000) return "5m";
  return "15m";
}

async function fetchCryptoPriceHistory(
  ctx: PredictFunCryptoChartContext
): Promise<PredictFunCryptoPricePoint[]> {
  const nowMs = Date.now();
  const startMs = ctx.startsAtMs ?? nowMs - 60 * 60 * 1000;
  const endMs = Math.min(ctx.endsAtMs ?? nowMs, nowMs);
  const interval = pickInterval(Math.max(60_000, endMs - startMs));

  const params = new URLSearchParams({
    symbol: ctx.symbol,
    interval,
    startTime: String(startMs),
    endTime: String(endMs),
  });

  const res = await fetch(`/api/predictfun/crypto-price?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { series?: PredictFunCryptoPricePoint[] };
  return Array.isArray(json.series) ? json.series : [];
}

function mergeLiveTick(series: ChartRow[], price: number, timeMs: number): ChartRow[] {
  if (!Number.isFinite(price) || price <= 0) return series;

  const timestamp = Math.floor(timeMs / 1000);
  if (series.length === 0) {
    return [{ time: timeMs, timestamp, price }];
  }

  const points = [...series];
  const last = points[points.length - 1];

  if (timestamp === last.timestamp) {
    points[points.length - 1] = { time: timeMs, timestamp, price };
    return points;
  }

  points.push({ time: timeMs, timestamp, price });
  return points;
}

function buildSessionAnchor(ctx: PredictFunCryptoChartContext | null): ChartRow | null {
  if (
    !ctx?.startsAtMs ||
    ctx.startPrice == null ||
    !Number.isFinite(ctx.startPrice) ||
    ctx.startPrice <= 0
  ) {
    return null;
  }
  const timestamp = Math.floor(ctx.startsAtMs / 1000);
  return {
    time: ctx.startsAtMs,
    timestamp,
    price: ctx.startPrice,
  };
}

function mergeChartRows(historyRows: ChartRow[], liveRows: ChartRow[]): ChartRow[] {
  const map = new Map<number, ChartRow>();
  for (const row of historyRows) map.set(row.timestamp, row);
  for (const row of liveRows) map.set(row.timestamp, row);
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** Interpolate sparse points so Recharts draws a continuous line. */
function densifyChartRows(rows: ChartRow[], stepMs = 30_000, maxPoints = 600): ChartRow[] {
  if (rows.length <= 1) return rows;

  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  const out: ChartRow[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const span = curr.time - prev.time;
    let t = prev.time + stepMs;

    while (t < curr.time && out.length < maxPoints) {
      const frac = span > 0 ? (t - prev.time) / span : 1;
      out.push({
        time: t,
        timestamp: Math.floor(t / 1000),
        price: prev.price + (curr.price - prev.price) * frac,
      });
      t += stepMs;
    }

    if (out.length < maxPoints) out.push(curr);
  }

  return out;
}

function extendSeriesToNow(
  rows: ChartRow[],
  currentPrice: number | null,
  nowMs: number,
  endsAtMs: number | null | undefined
): ChartRow[] {
  if (currentPrice == null || !Number.isFinite(currentPrice)) return rows;

  const headTime = Math.min(endsAtMs ?? nowMs, nowMs);
  const head: ChartRow = {
    time: headTime,
    timestamp: Math.floor(headTime / 1000),
    price: currentPrice,
  };

  if (rows.length === 0) return [head];

  const last = rows[rows.length - 1];
  if (headTime <= last.time) {
    const copy = [...rows];
    copy[copy.length - 1] = head;
    return copy;
  }

  return [...rows, head];
}

export function usePredictFunCryptoPriceChart(
  ctx: PredictFunCryptoChartContext | null,
  enabled = true
) {
  const isEnabled = enabled && !!ctx?.symbol;

  const historyQuery = useQuery({
    queryKey: [
      "predictfun-crypto-price-history",
      ctx?.marketId,
      ctx?.symbol,
      ctx?.startsAtMs,
      ctx?.endsAtMs,
    ],
    enabled: isEnabled,
    queryFn: () => fetchCryptoPriceHistory(ctx!),
    staleTime: 120_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const {
    tick: liveTick,
    connected: liveConnected,
    error: liveError,
  } = useCryptoLivePriceStream(ctx?.symbol, isEnabled);

  const [liveSeries, setLiveSeries] = useState<ChartRow[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);

  useEffect(() => {
    setLiveSeries([]);
  }, [ctx?.marketId, ctx?.symbol, ctx?.startsAtMs]);

  useEffect(() => {
    if (!liveTick) return;
    setLiveSeries((prev) => {
      const next = mergeLiveTick(prev, liveTick.price, liveTick.timeMs);
      return next.length > 1200 ? next.slice(-1200) : next;
    });
  }, [liveTick]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ctx?.endsAtMs) {
      setTimeLeftMs(null);
      return;
    }
    const tick = () => {
      setTimeLeftMs(Math.max(0, ctx.endsAtMs! - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [ctx?.endsAtMs]);

  const sessionAnchor = useMemo(() => buildSessionAnchor(ctx), [ctx]);

  const historyRows = useMemo(() => {
    const fromApi = (historyQuery.data ?? []).map((point) => ({
      time: point.x * 1000,
      timestamp: point.x,
      price: point.y,
    }));

    const rows = mergeChartRows(
      sessionAnchor ? [sessionAnchor] : [],
      fromApi
    );

    if (rows.length > 0) return rows;
    return sessionAnchor ? [sessionAnchor] : [];
  }, [historyQuery.data, sessionAnchor]);

  const currentPrice = useMemo(() => {
    if (liveTick && Number.isFinite(liveTick.price)) return liveTick.price;
    const merged = mergeChartRows(historyRows, liveSeries);
    const last = merged.at(-1)?.price;
    return typeof last === "number" && Number.isFinite(last) ? last : null;
  }, [liveTick, historyRows, liveSeries]);

  const chartData = useMemo(() => {
    const merged = mergeChartRows(historyRows, liveSeries);
    const endCapMs = Math.min(ctx?.endsAtMs ?? nowMs, nowMs);

    let base: ChartRow[];
    if (merged.length >= 2) {
      base = merged;
    } else if (
      ctx?.startsAtMs &&
      ctx.startPrice != null &&
      Number.isFinite(ctx.startPrice) &&
      currentPrice != null &&
      Number.isFinite(currentPrice)
    ) {
      base = [
        {
          time: ctx.startsAtMs,
          timestamp: Math.floor(ctx.startsAtMs / 1000),
          price: ctx.startPrice,
        },
        {
          time: endCapMs,
          timestamp: Math.floor(endCapMs / 1000),
          price: currentPrice,
        },
      ];
    } else {
      base = merged;
    }

    const withHead = extendSeriesToNow(base, currentPrice, nowMs, ctx?.endsAtMs);
    return withHead.length >= 2 ? densifyChartRows(withHead, 15_000) : withHead;
  }, [historyRows, liveSeries, ctx, currentPrice, nowMs]);

  const priceDeltaPct = useMemo(() => {
    if (
      ctx?.startPrice == null ||
      currentPrice == null ||
      !Number.isFinite(ctx.startPrice) ||
      ctx.startPrice <= 0
    ) {
      return null;
    }
    return ((currentPrice - ctx.startPrice) / ctx.startPrice) * 100;
  }, [ctx?.startPrice, currentPrice]);

  const xDomain = useMemo((): [number, number] => {
    const startMs = ctx?.startsAtMs ?? chartData[0]?.time ?? nowMs - 60 * 60 * 1000;
    const endCap = ctx?.endsAtMs ?? nowMs;
    return [startMs, Math.min(endCap, nowMs)];
  }, [ctx?.startsAtMs, ctx?.endsAtMs, nowMs, chartData]);

  return {
    chartData,
    currentPrice,
    priceDeltaPct,
    timeLeftMs,
    xDomain,
    liveConnected,
    isLoading: historyQuery.isLoading && chartData.length === 0,
    isFetching: historyQuery.isFetching,
    isError: chartData.length === 0 && !liveTick && !liveConnected && historyQuery.isError,
    error: (historyQuery.error ?? liveError) as Error | null,
  };
}
