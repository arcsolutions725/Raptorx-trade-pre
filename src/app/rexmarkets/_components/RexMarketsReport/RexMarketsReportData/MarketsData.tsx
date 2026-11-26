"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useId } from "react";
import {
  useMarketDetails,
  useMarketSummary,
  useMarketInsights,
} from "@/hooks/useMarketDetails";
import {
  getMarketChatHistory,
  saveMarketChatMessage,
  type MarketChatMessage,
} from "@/lib/marketChatStorage";
import { useDataSource } from "@/contexts/DataSourceContext";
import { usePathname } from "next/navigation";
import ProbabilityChart from "./shared/ProbabilityChart";
import LimitlessPriceChart from "./LimitlessTradingInterface/components/Chart/PriceChart";
import { useLimitlessHistoricalPrice } from "@/hooks/useLimitlessHistoricalPrice";
import { formatRexPilotChatLines } from "@/lib/formatRexPilotChatLines";
import {
  buildMyriadMultiChart,
  MYRIAD_CHART_INTERVALS,
  type ChartTimeframeKey,
} from "@/lib/myriad/parsePriceChart";
import type {
  MyriadMarketDetailApi,
  MyriadOutcomeDetail,
} from "@/lib/myriad/mapMyriadMarketDetails";
import {
  buildPredictFunSingleChart,
  PREDICT_FUN_CHART_INTERVALS,
  type PredictFunChartTimeframeKey,
} from "@/lib/predictfun/parsePriceChart";
import {
  buildPredictFunPilotTableOutcomes,
  getPredictFunChildMarketsFromDetails,
  selectPredictFunTopChartMarkets,
} from "@/lib/predictfun/predictFunPilotData";
import {
  buildPredictFunCryptoChartContext,
  isPredictFunCryptoUpDownRaw,
  resolvePredictFunNumericMarketId,
} from "@/lib/predictfun/predictFunCryptoMarket";
import PredictFunCryptoUpDownChart from "./PredictFunTradingInterface/components/PredictFunCryptoUpDownChart";
import { usePredictFunMultiTimeseries } from "@/hooks/usePredictFunMultiTimeseries";
import { usePredictFunTimeseries } from "@/hooks/usePredictFunTimeseries";
import { predictFunDisplayVolumeUsd, predictFunDisplayOutcomeVolume } from "@/lib/predictfun/mapPredictFunMarketRow";
import { usePredictFunPilotSubMarkets } from "@/hooks/usePredictFunPilotSubMarkets";
import { AskBar, ClawIco, IconChev, QaThread, SkeletonLines } from "./pilotUi";

// Price in cents, like the prototype table: 0.64 -> "64.00¢"
function formatPrice(price?: number | string): string {
  const numPrice = typeof price === "string" ? Number(price) : price;
  if (typeof numPrice !== "number" || isNaN(numPrice)) return "—";
  return `${(numPrice * 100).toFixed(2)}¢`;
}

// Format probability as percentage
function formatProbability(probability?: number | string): string {
  const numProb =
    typeof probability === "string" ? Number(probability) : probability;
  if (typeof numProb !== "number" || isNaN(numProb)) return "—";
  return `${(numProb * 100).toFixed(1)}%`;
}

// Format bid/ask (in cents 0-100) - show decimals for small values
function formatBidAsk(value?: number | string): string {
  const numValue = typeof value === "string" ? Number(value) : value;
  if (typeof numValue !== "number" || isNaN(numValue)) return "—";
  if (numValue === 0) return "0";
  if (numValue < 1 && numValue > 0) return numValue.toFixed(2);
  if (numValue >= 100) return numValue.toFixed(0);
  return numValue.toFixed(1);
}

/** Predict.fun bid/ask depth: USD notional when > 100, else top-of-book price in cents. */
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

/** Effective liquidity: use API liquidity when > 0, else bid+ask depth as proxy (e.g. Limitless). */
function getEffectiveLiquidity(o: { liquidity?: number; yes_bid?: number; yes_ask?: number }): number {
  const liq = Number(o.liquidity) || 0;
  if (liq > 0) return liq;
  const bid = Number(o.yes_bid) || 0;
  const ask = Number(o.yes_ask) || 0;
  return bid + ask;
}

/** Completed/closed markets have no liquidity and should be hidden. */
function isCompletedMarket(o: { status?: string; liquidity?: number }): boolean {
  const s = (o.status || "").toLowerCase();
  if (["closed", "resolved", "archived", "finalized"].includes(s)) return true;
  return false;
}

type MarketsDataProps = {
  eventTicker?: string | null;
  marketTitle?: string | null;
  totalVolume?: number;
  eventId?: string | null;
  /** Market provider — disambiguates endpoint in "All" mode. */
  marketSource?: string | null;
};

const MAX_H = 200;

export default function MarketsData({
  eventTicker,
  marketTitle,
  totalVolume,
  eventId,
  marketSource,
}: MarketsDataProps) {
  const { dataSource } = useDataSource();
  const pathname = usePathname();
  const isLimitlessRoute = pathname?.startsWith("/rexmarkets/limitless/");
  const isMyriadRoute = pathname?.startsWith("/rexmarkets/myriad/");
  const isPredictFunRoute = pathname?.startsWith("/rexmarkets/predict-fun/");
  const isPredictFun = isPredictFunRoute || dataSource === "predictfun";
  const { marketDetails, isLoading: isLoadingDetails } = useMarketDetails(
    eventTicker || null,
    eventId || null,
    isLimitlessRoute || isMyriadRoute || isPredictFun
      ? eventTicker ?? null
      : undefined,
    marketSource ?? null,
  );

  const discId = useId();
  const [probabilityTableExpanded, setProbabilityTableExpanded] = useState(true);
  const [probabilityChartExpanded, setProbabilityChartExpanded] = useState(true);
  const [myriadChartTf, setMyriadChartTf] = useState<ChartTimeframeKey>("7d");
  const [predictFunChartTf, setPredictFunChartTf] =
    useState<PredictFunChartTimeframeKey>("all");

  // Chat state
  const [messages, setMessages] = useState<MarketChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const hadStreamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMyriadChartTf("7d");
    setPredictFunChartTf("all");
  }, [eventTicker]);

  // Load chat history from localStorage when eventTicker changes
  useEffect(() => {
    if (eventTicker) {
      const chatHistory = getMarketChatHistory(eventTicker);
      if (chatHistory && chatHistory.messages.length > 0) {
        setMessages(chatHistory.messages);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [eventTicker]);

  // Check if user is at the very bottom of the scroll container
  // We want to stop auto-scrolling as soon as the user scrolls up,
  // even slightly, so they can read previous content while the
  // assistant is still streaming a response.
  const checkIfAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return false;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    // Treat the user as being "at bottom" only when they are essentially
    // pinned to the bottom of the container. Any upward scroll will
    // disable auto-scroll during streaming so the view doesn't snap back.
    return Math.abs(distanceFromBottom) < 1;
  }, []);

  // Handle scroll events to track if user manually scrolled
  const handleScroll = useCallback(() => {
    shouldAutoScrollRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  // Do not auto-scroll when the AI answer is generating or just finished — user scrolls manually
  useEffect(() => {
    if (streamingContent) {
      hadStreamingRef.current = true;
      return;
    }
    if (hadStreamingRef.current) {
      hadStreamingRef.current = false;
      return;
    }
    // Only follow the conversation; with no follow-ups yet the pane stays on the title and brief.
    // Scroll the pane itself so the page around the sidebar never moves.
    if (shouldAutoScrollRef.current && messages.length > 0) {
      setTimeout(() => {
        const c = scrollContainerRef.current;
        if (c) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
      }, 0);
    }
  }, [messages.length, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = `${Math.min(
        taRef.current.scrollHeight,
        MAX_H,
      )}px`;
    }
  }, [inputMessage]);

  const predictFunChildMarkets = useMemo(
    () => getPredictFunChildMarketsFromDetails(marketDetails),
    [marketDetails]
  );

  const { enrichedChildren: predictFunEnrichedChildren } =
    usePredictFunPilotSubMarkets(marketDetails, isPredictFun);

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
      predictFunChildMarkets[0] ??
      (predictFunRaw as Record<string, unknown> | undefined);
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
    if (!isPredictFun || predictFunCategoryMultiChart) return "";
    const raw = marketDetails?.rawEventData as Record<string, unknown> | undefined;
    const parent = raw?.parentCategory as Record<string, unknown> | undefined;
    return resolvePredictFunNumericMarketId(
      predictFunChildMarkets[0] as Record<string, unknown>,
      raw,
      parent,
      { id: marketDetails?.ticker }
    );
  }, [
    isPredictFun,
    predictFunCategoryMultiChart,
    marketDetails?.rawEventData,
    marketDetails?.ticker,
    predictFunChildMarkets,
  ]);

  const {
    chartData: predictFunMultiChartData,
    marketKeys: predictFunMultiMarketKeys,
    isLoading: predictFunMultiChartLoading,
    isFetching: predictFunMultiChartFetching,
  } = usePredictFunMultiTimeseries(
    predictFunTopChartMarkets,
    predictFunChartTf,
    isPredictFun && predictFunCategoryMultiChart
  );

  const {
    series: predictFunSingleSeries,
    isLoading: predictFunSingleChartLoading,
    isFetching: predictFunSingleChartFetching,
  } = usePredictFunTimeseries(
    predictFunSingleChartMarketId || null,
    predictFunChartTf,
    isPredictFun && !predictFunCategoryMultiChart && !!predictFunSingleChartMarketId
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

  const predictFunChartLoading = predictFunCategoryMultiChart
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

  const predictFunPilotVolumeFormatted = useMemo(() => {
    const raw = marketDetails?.rawEventData;
    const vol = predictFunDisplayVolumeUsd(raw);
    if (!vol) return "$0";
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
    return `$${vol.toLocaleString()}`;
  }, [marketDetails?.rawEventData]);

  // For Limitless / Predict.fun, build outcomes from rawEventData for table + insights
  const outcomesForInsightsAndTable = useMemo((): import("@/hooks/useMarketDetails").MarketOutcome[] | null => {
    if (!marketDetails) return null;
    let raw: import("@/hooks/useMarketDetails").MarketOutcome[] | null = null;

    if (isPredictFun) {
      return buildPredictFunPilotTableOutcomes(
        marketDetails,
        predictFunEnrichedChildren
      );
    }

    if (pathname?.startsWith("/rexmarkets/limitless/")) {
      const rawEvent = (marketDetails as { rawEventData?: {
        markets?: Array<{
          id?: number; slug?: string; title?: string; prices?: number[];
          volume?: string; volumeFormatted?: string; status?: string;
          tradePrices?: { buy?: { market?: number[] }; sell?: { market?: number[] } };
          expirationDate?: string; expirationTimestamp?: number;
          liquidity?: number; liquidityNum?: number;
        }>;
        title?: string; slug?: string; prices?: number[]; volume?: string; volumeFormatted?: string;
        status?: string; expirationDate?: string; expirationTimestamp?: number;
      } }).rawEventData;
      const markets = rawEvent?.markets;
      const list = Array.isArray(markets) && markets.length > 0 ? markets : null;
      const toOutcome = (m: {
        id?: number; slug?: string; title?: string; prices?: number[];
        volume?: string; volumeFormatted?: string; status?: string;
        tradePrices?: { buy?: { market?: number[] }; sell?: { market?: number[] } };
        expirationDate?: string; expirationTimestamp?: number;
        liquidity?: number; liquidityNum?: number;
      }): import("@/hooks/useMarketDetails").MarketOutcome => {
        const yesPrice = Array.isArray(m.prices) && typeof m.prices[0] === "number" ? m.prices[0] : 0;
        const noPrice = Array.isArray(m.prices) && typeof m.prices[1] === "number" ? m.prices[1] : 0;
        const vol = m.volumeFormatted != null ? parseFloat(String(m.volumeFormatted)) : (typeof m.volume === "string" ? parseFloat(m.volume) : Number(m.volume) || 0);
        const buyMarket = m.tradePrices?.buy?.market;
        const sellMarket = m.tradePrices?.sell?.market;
        const yesBidPct = Array.isArray(sellMarket) && typeof sellMarket[0] === "number" ? sellMarket[0] : yesPrice;
        const yesAskPct = Array.isArray(buyMarket) && typeof buyMarket[0] === "number" ? buyMarket[0] : yesPrice;
        const liquidity = Number(m.liquidityNum ?? m.liquidity ?? 0) || 0;
        return {
          ticker: m.slug ?? String(m.id ?? ""),
          subtitle: m.title ?? "",
          probability: yesPrice,
          yes_price: yesPrice,
          no_price: noPrice,
          volume: Number.isFinite(vol) ? vol : 0,
          volume_24h: undefined,
          yes_bid: yesBidPct <= 1 ? yesBidPct * 100 : yesBidPct,
          yes_ask: yesAskPct <= 1 ? yesAskPct * 100 : yesAskPct,
          liquidity,
          open_interest: 0,
          status: m.status ?? "",
          expected_expiration_time: m.expirationTimestamp ? new Date(m.expirationTimestamp).toISOString() : (m.expirationDate ?? null),
        };
      };
      if (list) raw = list.map(toOutcome);
      else if (rawEvent && (rawEvent.title != null || rawEvent.prices != null)) {
        const yesPrice = Array.isArray(rawEvent.prices) && typeof rawEvent.prices[0] === "number" ? rawEvent.prices[0] : 0;
        const noPrice = Array.isArray(rawEvent.prices) && typeof rawEvent.prices[1] === "number" ? rawEvent.prices[1] : 0;
        const vol = rawEvent.volumeFormatted != null ? parseFloat(String(rawEvent.volumeFormatted)) : (typeof rawEvent.volume === "string" ? parseFloat(rawEvent.volume) : Number(rawEvent.volume) || 0);
        raw = [{
          ticker: rawEvent.slug ?? marketDetails.ticker ?? "",
          subtitle: rawEvent.title ?? marketDetails.title ?? "",
          probability: yesPrice,
          yes_price: yesPrice,
          no_price: noPrice,
          volume: Number.isFinite(vol) ? vol : 0,
          volume_24h: undefined,
          yes_bid: yesPrice <= 1 ? yesPrice * 100 : yesPrice,
          yes_ask: yesPrice <= 1 ? yesPrice * 100 : yesPrice,
          liquidity: 0,
          open_interest: 0,
          status: rawEvent.status ?? "",
          expected_expiration_time: rawEvent.expirationTimestamp ? new Date(rawEvent.expirationTimestamp).toISOString() : (rawEvent.expirationDate ?? null),
        }];
      } else raw = [];
    } else {
      raw = marketDetails.markets ?? null;
    }

    if (!raw || raw.length === 0) return raw;

    // Filter out completed markets and those with zero effective liquidity (for table)
    const filtered = raw.filter(
      (o) => !isCompletedMarket(o) && getEffectiveLiquidity(o) > 0
    );
    // Sort by liquidity descending (highest first)
    filtered.sort((a, b) => getEffectiveLiquidity(b) - getEffectiveLiquidity(a));
    return filtered;
  }, [marketDetails, pathname, isPredictFun, predictFunEnrichedChildren]);

  // Outcomes for insights: do NOT filter by liquidity so insights still generate when volume/liquidity is $0
  const outcomesForInsights = useMemo((): import("@/hooks/useMarketDetails").MarketOutcome[] | null => {
    if (!marketDetails) return null;
    let raw: import("@/hooks/useMarketDetails").MarketOutcome[] | null = null;
    if (isPredictFun || pathname?.startsWith("/rexmarkets/limitless/")) {
      const sameAsTable = outcomesForInsightsAndTable;
      return sameAsTable && sameAsTable.length > 0 ? sameAsTable : null;
    }
    raw = marketDetails.markets ?? null;
    if (!raw || raw.length === 0) return raw;
    const filtered = raw.filter((o) => !isCompletedMarket(o));
    return filtered.length > 0 ? filtered : raw;
  }, [marketDetails, pathname, outcomesForInsightsAndTable, isPredictFun]);

  const { summary, isGenerating: isGeneratingSummary } = useMarketSummary(
    marketTitle || marketDetails?.title || null,
    marketDetails,
  );
  const { insights, isGenerating: isGeneratingInsights } = useMarketInsights(
    marketTitle || marketDetails?.title || null,
    outcomesForInsights,
    marketDetails,
  );

  // Same API and interval as left panel (LimitlessTradingInterface): 1W default
  const { data: limitlessHistoryData, isLoading: isLoadingLimitlessChart } =
    useLimitlessHistoricalPrice({
      slug: isLimitlessRoute && eventTicker ? eventTicker : null,
      interval: "1W",
    });
  const limitlessChartHistory = limitlessHistoryData?.history ?? [];
  const limitlessHistoryByMarket = limitlessHistoryData?.markets ?? [];

  // Same chart data build as left panel: multi-market from rawEventData + history, or single-series fallback
  const { chartData: limitlessChartData, marketKeys: limitlessMarketKeys } =
    useMemo(() => {
      if (!isLimitlessRoute || !marketDetails) {
        return { chartData: [], marketKeys: [] };
      }
      const rawData = marketDetails as {
        rawEventData?: { markets?: { title?: string; slug?: string; prices?: number[] }[] };
      } | null;
      const eventMarkets =
        (rawData?.rawEventData as
          | { markets?: { id?: number; title?: string; slug?: string; prices?: number[] }[] }
          | undefined)?.markets ?? [];
      if (eventMarkets.length === 0 || limitlessHistoryByMarket.length === 0) {
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
      const bySlug = new Map<string, (typeof limitlessHistoryByMarket)[0]>();
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
        (a, b) => a.timestamp - b.timestamp
      );
      const marketKeys = topMarkets.map((m, idx) => ({
        key: m.title.replace(/[^a-zA-Z0-9]/g, "_"),
        title: m.title,
        color: MARKET_COLORS[idx % MARKET_COLORS.length],
      }));
      return { chartData, marketKeys };
    }, [isLimitlessRoute, marketDetails, limitlessHistoryByMarket]);

  // Limitless: use volumeFormatted from market detail (same as left panel)
  const limitlessVolumeFormatted = useMemo(() => {
    if (!isLimitlessRoute || !marketDetails) return undefined;
    const raw = (marketDetails as { rawEventData?: { volumeFormatted?: string } })
      ?.rawEventData;
    return raw?.volumeFormatted;
  }, [isLimitlessRoute, marketDetails]);

  const myriadOutcomes = useMemo((): MyriadOutcomeDetail[] => {
    if (!isMyriadRoute || !marketDetails) return [];
    const raw = marketDetails.rawEventData as MyriadMarketDetailApi | undefined;
    const list = raw?.outcomes;
    return Array.isArray(list) ? (list as MyriadOutcomeDetail[]) : [];
  }, [isMyriadRoute, marketDetails]);

  const { chartData: myriadChartData, marketKeys: myriadMarketKeys } = useMemo(
    () => buildMyriadMultiChart(myriadOutcomes, myriadChartTf),
    [myriadOutcomes, myriadChartTf],
  );

  const myriadPilotVolumeFormatted = useMemo(() => {
    const vol = totalVolume ?? marketDetails?.total_volume ?? 0;
    if (!vol) return "$0";
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
    return `$${vol.toLocaleString()}`;
  }, [totalVolume, marketDetails?.total_volume]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Chat message sending
  const handleSend = useCallback(async () => {
    if (!inputMessage.trim() || isSending || !eventTicker || !marketTitle)
      return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let acc = "";

    try {
      setIsSending(true);
      setStreamingContent("");
      // Reset auto-scroll when sending a new message (user scrolls manually when AI answers)
      shouldAutoScrollRef.current = true;
      hadStreamingRef.current = false;

      // Add user message
      const userMessage: MarketChatMessage = {
        role: "user",
        content: inputMessage.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      saveMarketChatMessage(eventTicker, marketTitle, userMessage);

      // Build history for context
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Clear input
      const messageToSend = inputMessage.trim();
      setInputMessage("");

      // Call API
      const resp = await fetch("/api/market-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageToSend,
          reportData: summary,
          marketTicker: eventTicker,
          marketTitle: marketTitle,
          marketData: marketDetails,
          history,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error("Failed to get response");

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreamingContent(acc);
        }
      }

      // Add assistant message
      const assistantMessage: MarketChatMessage = {
        role: "assistant",
        content: acc,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      saveMarketChatMessage(eventTicker, marketTitle, assistantMessage);
      setStreamingContent("");
    } catch (err: unknown) {
      const isAbort =
        (err as { name?: string })?.name === "AbortError" ||
        (err as { cause?: { name?: string } })?.cause?.name === "AbortError" ||
        (typeof DOMException !== "undefined" &&
          err instanceof DOMException &&
          err.name === "AbortError");

      if (isAbort) {
        if (acc.trim()) {
          const assistantMessage: MarketChatMessage = {
            role: "assistant",
            content: `${acc.trim()}\n\n_Generation stopped._`,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          saveMarketChatMessage(eventTicker, marketTitle, assistantMessage);
        }
        setStreamingContent("");
      } else {
        console.error("Chat error:", err);
      }
    } finally {
      abortControllerRef.current = null;
      setIsSending(false);
      setStreamingContent("");
    }
  }, [
    inputMessage,
    isSending,
    eventTicker,
    marketTitle,
    messages,
    summary,
    marketDetails,
  ]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isSending) handleSend();
      }
    },
    [handleSend, isSending],
  );

  // Detect market source from route or marketDetails structure
  const detectedSource = useMemo(() => {
    if (isLimitlessRoute) return "limitless";
    if (isMyriadRoute) return "myriad";
    if (isPredictFun) return "predictfun";
    if (!marketDetails) return dataSource;

    // Kalshi markets have ranged_group_name (unique to Kalshi)
    // Polymarket markets have ticker at root level but NO ranged_group_name
    if (marketDetails.ranged_group_name) return "kalshi";
    if (marketDetails.ticker) return "polymarket";

    return dataSource;
  }, [marketDetails, dataSource, isLimitlessRoute, isMyriadRoute, isPredictFun]);

  // Show placeholder when no market is selected
  if (!eventTicker || !marketTitle) {
    return (
      <div className="sb-body">
        <div className="empty">
          <span className="empty__mark" aria-hidden="true">
            <ClawIco size={34} />
          </span>
          <b>Rex Markets</b>
          <p>
            Conversational intelligence for event traders. Generate an intelligence report for any
            prediction event.
          </p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoadingDetails) {
    return (
      <div className="sb-body" aria-busy="true">
        <p className="rx-small" style={{ margin: "0 0 14px" }}>
          Loading market data…
        </p>
        <SkeletonLines />
      </div>
    );
  }

  const showChart =
    detectedSource === "limitless" ||
    detectedSource === "myriad" ||
    detectedSource === "predictfun" ||
    (marketDetails?.markets && marketDetails.markets.length > 0);
  const tableId = `${discId}-table`;
  const chartId = `${discId}-chart`;

  // Rex Pilot pane (design/market.html #pane-pilot .report): title, situation brief, data table + chart
  // disclosures, insights, statistics, then follow-up answers and the Ask bar.
  return (
    <>
      <div ref={scrollContainerRef} onScroll={handleScroll} className="sb-body">
        <div className="report">
          <h2 className="report__title">{marketTitle}</h2>

          <h2>Situation brief</h2>
          {isGeneratingSummary ? (
            <p className="report__muted">Generating summary…</p>
          ) : summary ? (
            <div className="report__text">{formatRexPilotChatLines(summary)}</div>
          ) : (
            <p className="report__muted">No summary available</p>
          )}

          <div className="disc-box">
            <button
              type="button"
              className="disc"
              onClick={() => setProbabilityTableExpanded((prev) => !prev)}
              aria-expanded={probabilityTableExpanded}
              aria-controls={probabilityTableExpanded ? tableId : undefined}
            >
              Market data table
              <IconChev />
            </button>
            {probabilityTableExpanded && (
              <div
                id={tableId}
                className="disc-body disc-body--table"
                tabIndex={0}
                role="region"
                aria-label="Market data table, scrolls sideways"
              >
                <table className="sb-table">
                  <thead>
                    <tr>
                      <th>Outcome</th>
                      <th>Probability</th>
                      <th>Yes</th>
                      <th>No</th>
                      <th>Volume</th>
                      <th>Bid depth</th>
                      <th>Ask depth</th>
                      <th>Liquidity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomesForInsightsAndTable &&
                    outcomesForInsightsAndTable.length > 0 ? (
                      outcomesForInsightsAndTable.map((outcome) => (
                        <tr key={outcome.ticker}>
                          <td>{outcome.subtitle}</td>
                          <td className="rx-num">
                            {formatProbability(outcome.probability)}
                          </td>
                          <td className="rx-num is-up">
                            {formatPrice(outcome.yes_price)}
                          </td>
                          <td className="rx-num is-down">
                            {formatPrice(outcome.no_price)}
                          </td>
                          <td className="rx-num">
                            {(
                              isPredictFun
                                ? predictFunDisplayOutcomeVolume(outcome)
                                : (outcome.volume_24h ?? outcome.volume) ?? 0
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: isPredictFun ? 0 : undefined,
                            })}
                          </td>
                          <td className="rx-num">
                            {(isPredictFun
                              ? formatPredictFunBidAsk
                              : formatBidAsk)(outcome.yes_bid)}
                          </td>
                          <td className="rx-num">
                            {(isPredictFun
                              ? formatPredictFunBidAsk
                              : formatBidAsk)(outcome.yes_ask)}
                          </td>
                          <td className="rx-num">
                            {(outcome.liquidity || 0).toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="is-empty">
                          No outcome data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Market data chart - Limitless: PriceChart; Kalshi/Polymarket: ProbabilityChart */}
          {showChart && (
            <div className="disc-box">
              <button
                type="button"
                className="disc"
                onClick={() => setProbabilityChartExpanded((prev) => !prev)}
                aria-expanded={probabilityChartExpanded}
                aria-controls={probabilityChartExpanded ? chartId : undefined}
              >
                Market data chart
                <IconChev />
              </button>
              {probabilityChartExpanded && (
                <div id={chartId} className="disc-body disc-body--chart">
                  {(isLoadingLimitlessChart && detectedSource === "limitless") ||
                  (predictFunChartLoading && detectedSource === "predictfun") ? (
                    <div className="rx-chart-msg">Loading chart…</div>
                  ) : detectedSource === "predictfun" ? (
                    <>
                      {!predictFunIsCryptoUpDown ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rx-num font-semibold">
                            {predictFunPilotVolumeFormatted}
                          </span>
                          <div className="rx-seg rx-seg--mono" role="group" aria-label="Chart range">
                            {PREDICT_FUN_CHART_INTERVALS.map(({ key, label }) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setPredictFunChartTf(key)}
                                aria-pressed={predictFunChartTf === key}
                                className={`rx-seg__item${
                                  predictFunChartTf === key ? " is-active" : ""
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="relative h-[300px] w-full overflow-visible">
                        {predictFunIsCryptoUpDown && predictFunCryptoChartContext ? (
                          <PredictFunCryptoUpDownChart
                            context={predictFunCryptoChartContext}
                            className="h-full rounded-[10px] overflow-hidden border border-rx-line"
                          />
                        ) : predictFunChartData.length > 0 &&
                          predictFunMarketKeys.length > 0 ? (
                          <LimitlessPriceChart
                            key={`pilot-pf-${predictFunTopChartMarkets.map((m) => m.id).join("-")}-${predictFunChartTf}`}
                            chartData={predictFunChartData}
                            marketKeys={predictFunMarketKeys}
                            accentColor="#ffc000"
                          />
                        ) : (
                          <div className="rx-chart-msg absolute inset-0">
                            No price history for this range yet.
                          </div>
                        )}
                      </div>
                    </>
                  ) : detectedSource === "limitless" ? (
                    <ProbabilityChart
                      markets={[]}
                      limitlessChartData={limitlessChartData}
                      limitlessMarketKeys={limitlessMarketKeys}
                      limitlessHistory={limitlessChartHistory}
                      limitlessVolumeFormatted={limitlessVolumeFormatted}
                      heightClassName="h-[300px]"
                    />
                  ) : detectedSource === "myriad" ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rx-num font-semibold">
                          {myriadPilotVolumeFormatted}
                        </span>
                        <div className="rx-seg rx-seg--mono" role="group" aria-label="Chart range">
                          {MYRIAD_CHART_INTERVALS.map(({ label, api }) => (
                            <button
                              key={api}
                              type="button"
                              onClick={() => setMyriadChartTf(api)}
                              aria-pressed={myriadChartTf === api}
                              className={`rx-seg__item${
                                myriadChartTf === api ? " is-active" : ""
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative h-[300px] w-full overflow-visible">
                        {myriadChartData.length > 0 && myriadMarketKeys.length > 0 ? (
                          <LimitlessPriceChart
                            chartData={myriadChartData}
                            marketKeys={myriadMarketKeys}
                            accentColor="#ffc000"
                          />
                        ) : (
                          <div className="rx-chart-msg absolute inset-0">
                            No price history for this range yet.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <ProbabilityChart
                      markets={marketDetails!.markets}
                      totalVolume={totalVolume || marketDetails!.total_volume}
                      heightClassName="h-[300px]"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI insights */}
          <h2>Market insights</h2>
          {isGeneratingInsights ? (
            <p className="report__muted">Generating insights…</p>
          ) : insights && insights.length > 0 ? (
            <ol className="insights">
              {insights.map((insight, idx) => (
                <li key={idx}>
                  <div>{formatRexPilotChatLines(insight)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="report__muted">No insights available</p>
          )}

          {/* Market volume stats */}
          {marketDetails && (
            <>
              <h2>Market statistics</h2>
              <div className={`stats${detectedSource === "limitless" ? " stats--one" : ""}`}>
                <div className="rx-well stat">
                  <span className="stat__label">Total volume</span>
                  <span className="stat__value">
                    {detectedSource === "limitless"
                      ? (limitlessVolumeFormatted != null && limitlessVolumeFormatted !== ""
                        ? (limitlessVolumeFormatted.startsWith("$")
                            ? limitlessVolumeFormatted
                            : `$${limitlessVolumeFormatted}`)
                        : `$${(totalVolume ?? 0).toLocaleString()}`)
                      : `$${(marketDetails.total_volume ?? totalVolume ?? 0).toLocaleString()}`}
                  </span>
                </div>
                {detectedSource !== "limitless" && (
                  <div className="rx-well stat">
                    <span className="stat__label">Series volume</span>
                    <span className="stat__value">
                      ${(marketDetails.total_series_volume ?? totalVolume ?? 0).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Follow-up questions and Rex Pilot answers */}
        <QaThread messages={messages} streaming={streamingContent} />
        <div ref={endRef} />
      </div>

      <AskBar
        value={inputMessage}
        onChange={setInputMessage}
        onSend={handleSend}
        onStop={handleStop}
        onKeyDown={onKeyDown}
        isSending={isSending}
        placeholder="Ask any question about this market"
        label="Ask about this market"
        taRef={taRef}
      />
    </>
  );
}
