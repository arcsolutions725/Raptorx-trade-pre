"use client";

import { useState, useMemo, useRef, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ProbabilityChart from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/shared/ProbabilityChart";
import LimitlessPriceChart from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/LimitlessTradingInterface/components/Chart/PriceChart";
import {
  useMarketInsights,
  useMarketSummary,
  type MarketDetails,
  type MarketOutcome,
} from "@/hooks/useMarketDetails";
import { useLimitlessHistoricalPrice } from "@/hooks/useLimitlessHistoricalPrice";
import type { LimitlessMarketHistory } from "@/hooks/useLimitlessHistoricalPrice";
import {
  buildMyriadMultiChart,
  MYRIAD_CHART_INTERVALS,
  type ChartTimeframeKey,
} from "@/lib/myriad/parsePriceChart";
import type {
  MyriadMarketDetailApi,
  MyriadOutcomeDetail,
} from "@/lib/myriad/mapMyriadMarketDetails";
import { usePredictFunTimeseries } from "@/hooks/usePredictFunTimeseries";
import { usePredictFunMultiTimeseries } from "@/hooks/usePredictFunMultiTimeseries";
import { usePredictFunPilotSubMarkets } from "@/hooks/usePredictFunPilotSubMarkets";
import {
  buildPredictFunSingleChart,
  PREDICT_FUN_CHART_INTERVALS,
  selectPredictFunTopChartMarkets,
  type PredictFunChartTimeframeKey,
} from "@/lib/predictfun/parsePriceChart";
import {
  buildPredictFunPilotTableOutcomes,
  getPredictFunChildMarketsFromDetails,
} from "@/lib/predictfun/predictFunPilotData";
import {
  buildPredictFunCryptoChartContext,
  isPredictFunCryptoUpDownRaw,
  resolvePredictFunNumericMarketId,
} from "@/lib/predictfun/predictFunCryptoMarket";
import PredictFunCryptoUpDownChart from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/PredictFunTradingInterface/components/PredictFunCryptoUpDownChart";
import {
  predictFunDisplayOutcomeVolume,
  predictFunDisplayVolumeUsd,
} from "@/lib/predictfun/mapPredictFunMarketRow";
import { PREDICT_FUN_LOGO_SRC } from "@/lib/predictfun/assets";

type RexEmbedProvider =
  | "polymarket"
  | "kalshi"
  | "limitless"
  | "myriad"
  | "predictfun";

// RexMarkets embed rendering (used by ```rexmarkets blocks)
function formatPrice(price?: number | string): string {
  const numPrice = typeof price === "string" ? Number(price) : price;
  if (typeof numPrice !== "number" || Number.isNaN(numPrice)) return "—";
  return `$${(numPrice * 100).toFixed(2)}¢`;
}

function formatProbability(probability?: number | string): string {
  const numProb =
    typeof probability === "string" ? Number(probability) : probability;
  if (typeof numProb !== "number" || Number.isNaN(numProb)) return "—";
  return `${(numProb * 100).toFixed(1)}%`;
}

function formatBidAsk(value?: number | string): string {
  const numValue = typeof value === "string" ? Number(value) : value;
  if (typeof numValue !== "number" || Number.isNaN(numValue)) return "—";
  if (numValue === 0) return "0";
  if (numValue < 1 && numValue > 0) return numValue.toFixed(2);
  if (numValue >= 100) return numValue.toFixed(0);
  return numValue.toFixed(1);
}

function formatPredictFunBidAsk(value?: number | string): string {
  const numValue = typeof value === "string" ? Number(value) : value;
  if (typeof numValue !== "number" || !Number.isFinite(numValue) || numValue <= 0) {
    return "—";
  }
  if (numValue > 100) {
    if (numValue >= 1_000_000) return `$${(numValue / 1_000_000).toFixed(2)}M`;
    if (numValue >= 1_000) return `$${(numValue / 1_000).toFixed(1)}K`;
    return `$${Math.round(numValue).toLocaleString()}`;
  }
  return formatBidAsk(numValue);
}

function resolvePredictFunEmbedRouteId(md: MarketDetails | null): string | null {
  if (!md) return null;
  const raw = md.rawEventData as { parentCategory?: { slug?: string } } | undefined;
  const id = String(
    md.slug ??
      raw?.parentCategory?.slug ??
      md.id ??
      md.ticker ??
      md.series_ticker ??
      ""
  ).trim();
  return id || null;
}

function usePredictFunEmbedMarketDetails(
  provider: RexEmbedProvider,
  initialMd: MarketDetails | null
): MarketDetails | null {
  const routeId = useMemo(
    () => (provider === "predictfun" ? resolvePredictFunEmbedRouteId(initialMd) : null),
    [provider, initialMd]
  );

  const shouldRefetch = useMemo(() => {
    if (provider !== "predictfun" || !routeId) return false;
    if (!initialMd || (initialMd as { error?: string }).error) return true;
    const rows = Array.isArray(initialMd.markets) ? initialMd.markets : [];
    return rows.length === 0;
  }, [provider, routeId, initialMd]);

  const { data: liveMd } = useQuery({
    queryKey: ["predictfun-embed-details", routeId],
    enabled: provider === "predictfun" && !!routeId && shouldRefetch,
    queryFn: async (): Promise<MarketDetails | null> => {
      const res = await fetch(
        `/api/predictfun/market-details?id=${encodeURIComponent(routeId!)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as MarketDetails & { error?: string };
      return json?.error ? null : json;
    },
    staleTime: 30_000,
  });

  if (provider !== "predictfun") return initialMd;
  return liveMd ?? initialMd;
}

function buildPredictFunEmbedTableRows(
  md: MarketDetails | null,
  enrichedChildren: ReturnType<typeof usePredictFunPilotSubMarkets>["enrichedChildren"]
): MarketOutcome[] {
  if (!md) return [];
  const pilotRows = buildPredictFunPilotTableOutcomes(md, enrichedChildren);
  if (pilotRows.length > 0) return pilotRows;
  const serverRows = Array.isArray(md.markets) ? md.markets : [];
  return serverRows.filter((o) => !isCompletedMarket(o));
}

/** Effective liquidity: use API liquidity when > 0, else bid+ask depth as proxy. */
function getEffectiveLiquidity(o: {
  liquidity?: number;
  yes_bid?: number;
  yes_ask?: number;
}): number {
  const liq = Number(o.liquidity) || 0;
  if (liq > 0) return liq;
  const bid = Number(o.yes_bid) || 0;
  const ask = Number(o.yes_ask) || 0;
  return bid + ask;
}

/** Completed/closed markets have no liquidity and should be hidden. */
function isCompletedMarket(o: { status?: string }): boolean {
  const s = (o.status || "").toLowerCase();
  return ["closed", "resolved", "archived", "finalized"].includes(s);
}

/** Filter out completed markets and sort by liquidity descending. */
function filterAndSortByLiquidity(markets: any[]): any[] {
  const filtered = markets.filter(
    (o) => !isCompletedMarket(o) && getEffectiveLiquidity(o) > 0
  );
  filtered.sort((a, b) => getEffectiveLiquidity(b) - getEffectiveLiquidity(a));
  return filtered;
}

function getExternalLinkUrl(
  provider: RexEmbedProvider,
  marketDetails: any,
): string | null {
  if (!marketDetails) return null;
  if (provider === "polymarket") {
    const ticker = marketDetails.ticker || marketDetails.series_ticker || null;
    if (!ticker) return null;
    return `https://polymarket.com/event/${ticker}`;
  }
  if (provider === "limitless") {
    const slug = marketDetails.slug || marketDetails.ticker || null;
    if (!slug) return null;
    return `https://limitless.exchange/markets/${slug}`;
  }
  if (provider === "myriad") {
    const slug = marketDetails.slug || marketDetails.ticker || marketDetails.series_ticker || null;
    if (!slug) return null;
    return `https://myriad.markets/markets/${slug}`;
  }
  if (provider === "predictfun") {
    const slug =
      marketDetails.slug ||
      (marketDetails.rawEventData as { categorySlug?: string } | undefined)
        ?.categorySlug ||
      null;
    if (!slug) return null;
    return `https://predict.fun/market/${slug}`;
  }

  const seriesTicker =
    marketDetails.series_ticker || marketDetails.seriesTicker || null;
  const eventTicker =
    marketDetails.event_ticker || marketDetails.eventTicker || null;
  const rangedGroupName =
    marketDetails.ranged_group_name || marketDetails.rangedGroupName || "";
  if (!seriesTicker || !eventTicker || !rangedGroupName) return null;
  const kebab = String(rangedGroupName)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `https://kalshi.com/markets/${seriesTicker}/${kebab}/${eventTicker}`;
}

function getRaptorxTradeUrl(
  provider: RexEmbedProvider,
  marketDetails: any,
  raptorxUrl?: string,
): string | null {
  if (typeof raptorxUrl === "string" && raptorxUrl.trim())
    return raptorxUrl.trim();
  if (!marketDetails) return null;

  // For Polymarket, prefer slug (RexMarkets routes support slug nicely).
  if (provider === "polymarket") {
    const slug = marketDetails.slug || null;
    const ticker = marketDetails.ticker || marketDetails.series_ticker || null;
    const eventId = marketDetails.event_id || marketDetails.eventId || null;
    const id = slug || ticker || eventId;
    if (!id) return null;
    return `/rexmarkets/polymarket/${encodeURIComponent(String(id))}`;
  }

  if (provider === "limitless") {
    const slug = marketDetails.slug || marketDetails.ticker || null;
    if (!slug) return null;
    return `/rexmarkets/limitless/${encodeURIComponent(String(slug))}`;
  }

  if (provider === "myriad") {
    const slug = marketDetails.slug || marketDetails.ticker || marketDetails.series_ticker || null;
    if (!slug) return null;
    return `/rexmarkets/myriad/${encodeURIComponent(String(slug))}`;
  }

  if (provider === "predictfun") {
    const id =
      marketDetails.id ||
      marketDetails.ticker ||
      marketDetails.series_ticker ||
      null;
    if (!id) return null;
    return `/rexmarkets/predict-fun/${encodeURIComponent(String(id))}`;
  }

  // For Kalshi, we can use event_ticker.
  const eventTicker =
    marketDetails.event_ticker || marketDetails.eventTicker || null;
  if (!eventTicker) return null;
  return `/rexmarkets/kalshi/${encodeURIComponent(String(eventTicker))}`;
}

/**
 * Same interaction pattern as TopMarketsCards “Deep Analysis” (button + touch-end),
 * avoiding iOS Safari’s double-tap on styled `<a href>` links.
 */
function TradeOnRaptorXCtaButton({
  tradeUrl,
  className,
  children,
}: {
  tradeUrl: string;
  className: string;
  children: ReactNode;
}) {
  const lastOpenAtRef = useRef(0);

  const openTrade = () => {
    const now = Date.now();
    if (now - lastOpenAtRef.current < 450) return;
    lastOpenAtRef.current = now;
    window.open(tradeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={openTrade}
      onTouchEnd={(e) => {
        e.preventDefault();
        openTrade();
      }}
      className={className}
      style={{ WebkitTapHighlightColor: "transparent" }}
      aria-label="Trade on RaptorX"
      title="Trade on RaptorX"
    >
      {children}
    </button>
  );
}

function buildLimitlessMultiChart(
  marketDetails: any,
  limitlessHistoryByMarket: LimitlessMarketHistory[],
): {
  chartData: Array<{
    time: number;
    timestamp: number;
    [key: string]: number | undefined;
  }>;
  marketKeys: Array<{ key: string; title: string; color: string }>;
} {
  if (
    !marketDetails ||
    !Array.isArray(limitlessHistoryByMarket) ||
    limitlessHistoryByMarket.length === 0
  ) {
    return { chartData: [], marketKeys: [] };
  }
  const rawData = marketDetails as {
    rawEventData?: {
      markets?: {
        id?: number;
        title?: string;
        slug?: string;
        prices?: number[];
      }[];
    };
  } | null;
  const eventMarkets =
    rawData?.rawEventData?.markets?.filter(Boolean) ?? [];
  if (eventMarkets.length === 0) {
    return { chartData: [], marketKeys: [] };
  }
  const MARKET_COLORS = [
    "#8B5CF6",
    "#00ff88",
    "#00a8ff",
    "#ff6b6b",
    "#ffc000",
    "#9b59b6",
    "#1abc9c",
    "#e74c3c",
  ];
  const byTitle = new Map<
    string,
    { title: string; slug?: string; history: { ts: number; price: number }[] }
  >();
  for (const m of limitlessHistoryByMarket) {
    const t = (m.title ?? "").trim();
    if (t) byTitle.set(t, { title: m.title, slug: m.slug, history: m.history ?? [] });
  }
  const bySlug = new Map<string, LimitlessMarketHistory>();
  for (const m of limitlessHistoryByMarket) {
    if (m.slug) bySlug.set(m.slug, m);
  }
  type MarketWithLatest = {
    title: string;
    slug?: string;
    latestPrice: number;
    history: { ts: number; price: number }[];
  };
  const withLatest: MarketWithLatest[] = eventMarkets.map((m) => {
    const title = (m.title ?? "").trim();
    const slug = m.slug;
    const fromApi = byTitle.get(title) ?? (slug ? bySlug.get(slug) : null);
    const history = fromApi?.history ?? [];
    const currentYes =
      Array.isArray(m.prices) && typeof m.prices[0] === "number" ? m.prices[0] : 0.5;
    const latestPrice =
      history.length > 0
        ? typeof history[history.length - 1].price === "number"
          ? history[history.length - 1].price
          : currentYes
        : currentYes;
    const pct = latestPrice <= 1 ? latestPrice * 100 : latestPrice;
    return { title, slug, latestPrice: pct, history };
  });
  const topMarkets = [...withLatest]
    .sort((a, b) => b.latestPrice - a.latestPrice)
    .slice(0, 4);
  const allDataPoints = new Map<
    number,
    { time: number; timestamp: number; [key: string]: number | undefined }
  >();
  for (const market of topMarkets) {
    const marketKey = market.title.replace(/[^a-zA-Z0-9]/g, "_");
    for (const { ts, price } of market.history) {
      const timeMs = ts * 1000;
      const pricePct =
        typeof price === "number" ? (price <= 1 ? price * 100 : price) : 0;
      if (!allDataPoints.has(ts)) {
        allDataPoints.set(ts, { time: timeMs, timestamp: ts });
      }
      allDataPoints.get(ts)![marketKey] = pricePct;
    }
  }
  const chartData = Array.from(allDataPoints.values()).sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  const marketKeys = topMarkets.map((m, idx) => ({
    key: m.title.replace(/[^a-zA-Z0-9]/g, "_"),
    title: m.title,
    color: MARKET_COLORS[idx % MARKET_COLORS.length],
  }));
  return { chartData, marketKeys };
}

function RexMarketsEmbedMarketDataChart({
  provider,
  marketDetails,
  markets,
}: {
  provider: RexEmbedProvider;
  marketDetails: MarketDetails | null;
  markets: MarketOutcome[];
}) {
  const [myriadChartTf, setMyriadChartTf] = useState<ChartTimeframeKey>("7d");
  const [predictFunChartTf, setPredictFunChartTf] =
    useState<PredictFunChartTimeframeKey>("1d");

  const predictFunChildMarkets = useMemo(
    () => getPredictFunChildMarketsFromDetails(marketDetails),
    [marketDetails]
  );
  const predictFunRaw = marketDetails?.rawEventData as
    | (Record<string, unknown> & { parentCategory?: Record<string, unknown> })
    | undefined;
  const predictFunIsCryptoUpDown = useMemo(() => {
    const parent = predictFunRaw?.parentCategory;
    return (
      isPredictFunCryptoUpDownRaw(predictFunRaw) ||
      isPredictFunCryptoUpDownRaw(parent)
    );
  }, [predictFunRaw]);
  const predictFunCryptoChartContext = useMemo(() => {
    if (!predictFunIsCryptoUpDown) return null;
    const parent = predictFunRaw?.parentCategory;
    const activeMarket =
      predictFunChildMarkets[0] ?? (predictFunRaw as Record<string, unknown>);
    return buildPredictFunCryptoChartContext(
      activeMarket as Record<string, unknown>,
      parent ?? predictFunRaw
    );
  }, [predictFunIsCryptoUpDown, predictFunChildMarkets, predictFunRaw]);
  const predictFunTopChartMarkets = useMemo(
    () =>
      predictFunIsCryptoUpDown
        ? []
        : selectPredictFunTopChartMarkets(predictFunChildMarkets),
    [predictFunChildMarkets, predictFunIsCryptoUpDown]
  );
  const predictFunCategoryMultiChart = predictFunTopChartMarkets.length > 0;
  const predictFunSingleChartMarketId = useMemo(() => {
    if (provider !== "predictfun" || predictFunCategoryMultiChart) return "";
    const parent = predictFunRaw?.parentCategory;
    return resolvePredictFunNumericMarketId(
      predictFunChildMarkets[0] as Record<string, unknown>,
      predictFunRaw,
      parent,
      { id: marketDetails?.ticker }
    );
  }, [
    provider,
    predictFunCategoryMultiChart,
    predictFunRaw,
    predictFunChildMarkets,
    marketDetails?.ticker,
  ]);
  const {
    chartData: predictFunMultiChartData,
    marketKeys: predictFunMultiMarketKeys,
    isLoading: predictFunMultiChartLoading,
    isFetching: predictFunMultiChartFetching,
  } = usePredictFunMultiTimeseries(
    predictFunTopChartMarkets,
    predictFunChartTf,
    provider === "predictfun" && predictFunCategoryMultiChart
  );
  const {
    series: predictFunSingleSeries,
    isLoading: predictFunSingleChartLoading,
    isFetching: predictFunSingleChartFetching,
  } = usePredictFunTimeseries(
    predictFunSingleChartMarketId || null,
    predictFunChartTf,
    provider === "predictfun" &&
      !predictFunCategoryMultiChart &&
      !predictFunIsCryptoUpDown &&
      !!predictFunSingleChartMarketId
  );
  const predictFunSingleChartBuilt = useMemo(() => {
    const raw = marketDetails?.rawEventData as {
      outcomes?: { name?: string }[];
    } | undefined;
    const outs = Array.isArray(raw?.outcomes) ? raw!.outcomes! : [];
    const yesIdx = outs.findIndex((o) => /^yes$/i.test(String(o?.name ?? "").trim()));
    const label = String(outs[yesIdx >= 0 ? yesIdx : 0]?.name ?? "Yes").trim() || "Yes";
    return buildPredictFunSingleChart(predictFunSingleSeries, predictFunChartTf, label);
  }, [predictFunSingleSeries, predictFunChartTf, marketDetails?.rawEventData]);
  const predictFunChartLoading = predictFunIsCryptoUpDown
    ? false
    : predictFunCategoryMultiChart
      ? predictFunMultiChartLoading || predictFunMultiChartFetching
      : predictFunSingleChartLoading || predictFunSingleChartFetching;
  const { chartData: predictFunChartData, marketKeys: predictFunMarketKeys } =
    useMemo(() => {
      if (predictFunCategoryMultiChart) {
        return {
          chartData: predictFunMultiChartData,
          marketKeys: predictFunMultiMarketKeys,
        };
      }
      return {
        chartData: predictFunSingleChartBuilt.chartData,
        marketKeys: predictFunSingleChartBuilt.marketKeys,
      };
    }, [
      predictFunCategoryMultiChart,
      predictFunMultiChartData,
      predictFunMultiMarketKeys,
      predictFunSingleChartBuilt,
    ]);
  const predictFunVolumeFormatted = useMemo(() => {
    const vol = predictFunDisplayVolumeUsd(marketDetails?.rawEventData);
    if (!vol) return "$0";
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
    return `$${vol.toLocaleString()}`;
  }, [marketDetails?.rawEventData]);
  const limitlessSlug =
    provider === "limitless"
      ? String(marketDetails?.slug || marketDetails?.ticker || "").trim() || null
      : null;

  const { data: limitlessHistoryData, isLoading: limitlessLoading } =
    useLimitlessHistoricalPrice({
      slug: limitlessSlug,
      interval: "1W",
    });
  const limitlessHistoryByMarket = limitlessHistoryData?.markets ?? [];
  const limitlessChartHistory = limitlessHistoryData?.history ?? [];

  const { chartData: limitlessChartData, marketKeys: limitlessMarketKeys } =
    useMemo(
      () => buildLimitlessMultiChart(marketDetails, limitlessHistoryByMarket),
      [marketDetails, limitlessHistoryByMarket],
    );

  const limitlessVolumeFormatted = useMemo(() => {
    if (provider !== "limitless") return undefined;
    return (marketDetails?.rawEventData as { volumeFormatted?: string } | undefined)
      ?.volumeFormatted;
  }, [provider, marketDetails]);

  const myriadOutcomes = useMemo((): MyriadOutcomeDetail[] => {
    if (provider !== "myriad" || !marketDetails) return [];
    const raw = marketDetails.rawEventData as MyriadMarketDetailApi | undefined;
    const list = raw?.outcomes;
    return Array.isArray(list) ? (list as MyriadOutcomeDetail[]) : [];
  }, [provider, marketDetails]);

  const { chartData: myriadChartData, marketKeys: myriadMarketKeys } = useMemo(
    () => buildMyriadMultiChart(myriadOutcomes, myriadChartTf),
    [myriadOutcomes, myriadChartTf],
  );

  const myriadPilotVolumeFormatted = useMemo(() => {
    const vol = Number(marketDetails?.total_volume) || 0;
    if (!vol) return "$0";
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
    return `$${vol.toLocaleString()}`;
  }, [marketDetails?.total_volume]);

  const totalVol = marketDetails?.total_volume;

  if (markets.length === 0) return null;

  return (
    <div className="mt-4 min-w-0 w-full">
      <div className="text-white/90 text-sm font-semibold mb-2">
        Market Data <span className="text-[#ffc000]">Chart</span>
      </div>

      {provider === "polymarket" && (
        <div className="w-full min-h-[280px] sm:min-h-[400px]">
          <ProbabilityChart markets={markets as any} totalVolume={totalVol} />
        </div>
      )}

      {provider === "kalshi" && (
        <div className="w-full min-h-[280px] sm:min-h-[400px]">
          <ProbabilityChart markets={markets as any} totalVolume={totalVol} />
        </div>
      )}

      {provider === "limitless" && (
        <>
          {limitlessLoading ? (
            <div className="py-8 text-center text-white/60 text-sm">
              Loading chart...
            </div>
          ) : limitlessChartData.length === 0 &&
            limitlessChartHistory.length === 0 ? (
            <div className="py-6 text-center text-white/60 text-sm px-2">
              No price history available yet.
            </div>
          ) : (
            <div className="w-full min-h-[280px] sm:min-h-[400px]">
              <ProbabilityChart
                markets={[]}
                limitlessChartData={
                  limitlessChartData.length > 0 ? limitlessChartData : undefined
                }
                limitlessMarketKeys={
                  limitlessMarketKeys.length > 0 ? limitlessMarketKeys : undefined
                }
                limitlessHistory={
                  limitlessChartData.length > 0 ? undefined : limitlessChartHistory
                }
                limitlessVolumeFormatted={limitlessVolumeFormatted}
              />
            </div>
          )}
        </>
      )}

      {provider === "myriad" && (
        <div className="w-full min-w-0">
          <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-white/80 text-sm shrink-0">
              {myriadPilotVolumeFormatted}
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-white/10 rounded p-1">
              {MYRIAD_CHART_INTERVALS.map(({ label, api }) => (
                <button
                  key={api}
                  type="button"
                  onClick={() => setMyriadChartTf(api)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap touch-manipulation ${
                    myriadChartTf === api
                      ? "bg-[#ffc000] text-black"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="w-full h-[min(400px,55vh)] min-h-[240px] sm:h-[400px] relative overflow-visible pl-0 pr-1 sm:pr-3">
            {myriadChartData.length > 0 && myriadMarketKeys.length > 0 ? (
              <LimitlessPriceChart
                chartData={myriadChartData}
                marketKeys={myriadMarketKeys}
                accentColor="#ffc000"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm px-4 text-center">
                No price history for this range yet.
              </div>
            )}
          </div>
        </div>
      )}

      {provider === "predictfun" && (
        <div className="w-full min-w-0">
          <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-white/80 text-sm shrink-0">
              {predictFunVolumeFormatted}
            </div>
            {!predictFunIsCryptoUpDown && (
              <div className="flex flex-wrap items-center gap-1 bg-white/10 rounded p-1">
                {PREDICT_FUN_CHART_INTERVALS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPredictFunChartTf(key)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap touch-manipulation ${
                      predictFunChartTf === key
                        ? "bg-[#A855F7] text-white"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-full h-[min(400px,55vh)] min-h-[240px] sm:h-[400px] relative overflow-visible pl-0 pr-1 sm:pr-3">
            {predictFunIsCryptoUpDown && predictFunCryptoChartContext ? (
              <PredictFunCryptoUpDownChart context={predictFunCryptoChartContext} />
            ) : predictFunChartLoading ? (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
                Loading chart...
              </div>
            ) : predictFunChartData.length > 0 && predictFunMarketKeys.length > 0 ? (
              <LimitlessPriceChart
                chartData={predictFunChartData}
                marketKeys={predictFunMarketKeys}
                accentColor="#A855F7"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm px-4 text-center">
                No price history for this range yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RexMarketsEmbed({ payload }: { payload: any }) {
  const [stable] = useState(() => ({
    provider: (payload?.provider || "polymarket") as RexEmbedProvider,
    marketDetails: payload?.marketDetails ?? null,
    raptorxUrl: payload?.raptorxUrl as string | undefined,
  }));

  const provider = stable.provider;
  const initialMd = stable.marketDetails as MarketDetails | null;
  const raptorxUrl = stable.raptorxUrl;

  const md = usePredictFunEmbedMarketDetails(provider, initialMd);
  const { enrichedChildren: predictFunEnrichedChildren } =
    usePredictFunPilotSubMarkets(md, provider === "predictfun");

  const title = md?.title || "Market";
  const symbol = md?.symbol_image_url || "";
  const rawMarkets: MarketOutcome[] = Array.isArray(md?.markets) ? md.markets : [];
  const predictFunTableRows =
    provider === "predictfun"
      ? buildPredictFunEmbedTableRows(md, predictFunEnrichedChildren)
      : [];
  // Kalshi: liquidity_dollars is often 0 in the API; do not drop rows via filterAndSortByLiquidity (same idea as Limitless/Myriad).
  const markets =
    provider === "predictfun"
      ? predictFunTableRows
      : provider === "limitless" ||
          provider === "myriad" ||
          provider === "kalshi"
        ? rawMarkets.filter((o) => !isCompletedMarket(o))
        : filterAndSortByLiquidity(rawMarkets);
  // For insights, use all non-completed outcomes (don't require liquidity) so insights generate when volume is $0
  const marketsForInsights =
    rawMarkets.length > 0
      ? rawMarkets.filter((o) => !isCompletedMarket(o))
      : rawMarkets;
  const tradeUrl = getRaptorxTradeUrl(provider, md, raptorxUrl);

  const {
    summary,
    isGenerating: isGeneratingSummary,
    error: summaryError,
  } = useMarketSummary(title, md);
  const {
    insights,
    isGenerating: isGeneratingInsights,
    error: insightsError,
  } = useMarketInsights(title, marketsForInsights.length > 0 ? marketsForInsights : markets, md);

  return (
    <div className="my-3 w-full min-w-0 max-w-full rounded-xl border border-white/10 overflow-x-visible overflow-y-visible">
      <div className="p-3 sm:p-4 bg-transparent">
        <div className="flex items-center gap-3">
          {symbol ? (
            <Image
              src={symbol}
              alt={title}
              width={44}
              height={44}
              className="rounded-lg"
              unoptimized
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[#ffc000] font-bold text-lg break-words">
                {title}
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold text-xs border shadow-sm ${
                  provider === "kalshi"
                    ? "bg-gradient-to-r from-[#09C285] to-[#07A875] text-white border-[#0AE09A]/20"
                    : provider === "limitless"
                      ? "bg-[#c3ff01] text-black border-black/15"
                      : provider === "myriad"
                        ? "bg-gradient-to-r from-[#1a1408] to-[#0d0a04] text-[#ffc000] border-[#ffc000]/25"
                        : provider === "predictfun"
                          ? "bg-gradient-to-r from-[#1a1028] to-[#0d0814] text-[#E9D5FF] border-[#A855F7]/30"
                          : "bg-gradient-to-r from-[#265CFF] to-[#1E4DD9] text-white border-[#4A7AFF]/20"
                }`}
              >
                {provider === "kalshi" ? (
                  <>
                    <span className="text-white font-bold">K</span>
                    <span className="hidden sm:inline">Kalshi</span>
                  </>
                ) : provider === "limitless" ? (
                  <>
                    <Image
                      src="/images/limitless-logo-new.webp"
                      alt="Limitless"
                      width={14}
                      height={14}
                      className="w-[14px] h-[14px] object-contain"
                    />
                    <span className="hidden sm:inline">Limitless</span>
                  </>
                ) : provider === "myriad" ? (
                  <>
                    <Image
                      src="/images/myriad.webp"
                      alt="Myriad"
                      width={14}
                      height={14}
                      className="w-[14px] h-[14px] object-contain rounded"
                    />
                    <span className="hidden sm:inline">Myriad</span>
                  </>
                ) : provider === "predictfun" ? (
                  <>
                    <Image
                      src={PREDICT_FUN_LOGO_SRC}
                      alt="Predict.fun"
                      width={14}
                      height={14}
                      className="w-[14px] h-[14px] object-contain"
                    />
                    <span className="hidden sm:inline">Predict.fun</span>
                  </>
                ) : (
                  <>
                    <Image
                      src="/images/polymarket.png"
                      alt="Polymarket"
                      width={14}
                      height={14}
                      className="w-[14px] h-[14px]"
                    />
                    <span className="hidden sm:inline">Polymarket</span>
                  </>
                )}
              </span>
              {tradeUrl && (
                <TradeOnRaptorXCtaButton
                  tradeUrl={tradeUrl}
                  className="rex-markets-trade-cta inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ffc000] hover:bg-[#ffc000]/90 active:bg-[#ffc000]/90 border border-white/10 transition-colors text-xs max-w-full touch-manipulation"
                >
                  <Image
                    src={"/images/banner.png"}
                    alt=""
                    width={20}
                    height={20}
                    className="pointer-events-none shrink-0"
                  />
                  <span className="pointer-events-none font-semibold">
                    Trade on RaptorX
                  </span>
                  <ArrowRight className="pointer-events-none w-4 h-4 shrink-0" />
                </TradeOnRaptorXCtaButton>
              )}
            </div>
          </div>
        </div>

        {/* Situation Brief */}
        <div className="mt-4">
          <div className="text-white/90 text-sm font-semibold mb-2">
            Situation <span className="text-[#ffc000]">Brief:</span>
          </div>
          {isGeneratingSummary ? (
            <div className="text-white/60 italic text-sm">
              Generating summary...
            </div>
          ) : summary ? (
            <div className="text-white/85 text-sm leading-relaxed">
              {summary}
            </div>
          ) : summaryError ? (
            <div className="text-white/60 italic text-sm">
              Summary unavailable
            </div>
          ) : (
            <div className="text-white/60 italic text-sm">
              No summary available
            </div>
          )}
        </div>

        {/* Market data table — same as desktop: horizontal scroll on narrow viewports */}
        <div className="mt-4 text-white/90 text-sm font-semibold">
          Market Data <span className="text-[#ffc000]">Table</span>
        </div>
        <div className="mt-2 min-w-0 w-full overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[720px] text-sm text-left">
            <thead className="border-b border-[#ffc000]">
              <tr>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Outcome
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Probability
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-[#00b050]">Yes</span> Price
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-red-400">No</span> Price
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Volume
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-[#00b050]">Bid</span> Depth
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-red-400">Ask</span> Depth
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Liquidity
                </th>
              </tr>
            </thead>
            <tbody>
              {markets.length > 0 ? (
                markets.slice(0, 25).map((outcome, idx) => (
                  <tr
                    key={outcome.ticker || `${idx}`}
                    className={`border-b border-white/10 ${
                      idx % 2 === 0 ? "bg-white/5" : "bg-transparent"
                    }`}
                  >
                    <td className="px-3 py-3 text-white font-medium break-words">
                      {outcome.subtitle || outcome.title || "—"}
                    </td>
                    <td className="px-3 py-3 text-[#ffc000] whitespace-nowrap">
                      {formatProbability(outcome.probability)}
                    </td>
                    <td className="px-3 py-3 text-[#00b050] whitespace-nowrap">
                      {formatPrice(outcome.yes_price)}
                    </td>
                    <td className="px-3 py-3 text-red-400 whitespace-nowrap">
                      {formatPrice(outcome.no_price)}
                    </td>
                          <td className="px-3 py-3 text-white whitespace-nowrap">
                            {(provider === "predictfun"
                              ? predictFunDisplayOutcomeVolume(outcome)
                              : (outcome.volume_24h ?? outcome.volume) || 0
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: provider === "predictfun" ? 0 : undefined,
                            })}
                          </td>
                          <td className="px-3 py-3 text-white whitespace-nowrap">
                            {(provider === "predictfun"
                              ? formatPredictFunBidAsk
                              : formatBidAsk)(outcome.yes_bid)}
                          </td>
                          <td className="px-3 py-3 text-white whitespace-nowrap">
                            {(provider === "predictfun"
                              ? formatPredictFunBidAsk
                              : formatBidAsk)(outcome.yes_ask)}
                          </td>
                          <td className="px-3 py-3 text-white whitespace-nowrap">
                            {(outcome.liquidity || 0).toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-white/60"
                  >
                    No market data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {markets.length > 0 && (
          <RexMarketsEmbedMarketDataChart
            provider={provider}
            marketDetails={md}
            markets={markets}
          />
        )}

        {/* AI Insights */}
        <div className="mt-4">
          {isGeneratingInsights ? (
            <div className="text-white/60 italic text-sm">
              Generating insights...
            </div>
          ) : insights && insights.length > 0 ? (
            <ul className="space-y-3">
              {insights.map((insight: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="text-[#ffc000] font-bold flex-shrink-0">
                    {idx + 1}.
                  </span>
                  <span className="text-white/90 leading-relaxed text-sm">
                    {insight}
                  </span>
                </li>
              ))}
            </ul>
          ) : insightsError ? (
            <div className="text-white/60 italic text-sm">
              Insights unavailable
            </div>
          ) : (
            <div className="text-white/60 italic text-sm">
              No insights available
            </div>
          )}
        </div>

        {/* Stats */}
        {(md?.total_volume || md?.total_series_volume) && (
          <div className="mt-4">
            <div className="text-white/90 text-sm font-semibold mb-2">
              Market <span className="text-[#ffc000]">Statistics</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-white/60 text-xs mb-1">Total Volume</div>
                  <div className="text-white text-base font-semibold">
                    ${Number(md.total_volume || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-white/60 text-xs mb-1">
                    Series Volume
                  </div>
                  <div className="text-white text-base font-semibold">
                    ${Number(md.total_series_volume || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trade on RaptorX CTA (Polymarket & Kalshi) */}
        {tradeUrl && (
          <div className="mt-4 flex justify-center">
            <TradeOnRaptorXCtaButton
              tradeUrl={tradeUrl}
              className="rex-markets-trade-cta flex cursor-pointer items-center gap-1.5 px-4 py-2 rounded-md font-semibold text-xs shadow-md bg-[#ffc000] hover:bg-[#ffc000]/90 active:bg-[#ffc000]/90 border border-white/10 touch-manipulation"
            >
              <Image
                src={"/images/banner.png"}
                alt=""
                width={16}
                height={16}
                className="pointer-events-none shrink-0"
              />
              <span className="pointer-events-none font-semibold">
                Trade on RaptorX
              </span>
              <ArrowRight className="pointer-events-none w-4 h-4 shrink-0" />
            </TradeOnRaptorXCtaButton>
          </div>
        )}
      </div>
    </div>
  );
}
