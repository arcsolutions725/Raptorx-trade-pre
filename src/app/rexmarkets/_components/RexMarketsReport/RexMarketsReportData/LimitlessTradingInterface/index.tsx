"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import TradingHeader from "../PolymarketTradingInterface/components/Header/TradingHeader";

/** Limitless market-details API returns these in addition to base MarketDetails */
type LimitlessMarketDetails = {
  symbol_image_url?: string | null;
  image?: string | null;
  icon?: string | null;
  yesPrice?: number | string;
  noPrice?: number | string;
  prices?: (number | string)[];
  description?: string;
  liquidity?: number;
  markets?: unknown[];
  /** Set by /api/limitless/market-details from API venue + tokens.yes/no */
  venue?: { exchange: string; adapter?: string } | null;
  positionIds?: string[] | null;
  /** Category id for chart interval options (Crypto/Finance: 1H, ALL; Other: 1H, 6H, 1D, 1W, 1M, ALL) */
  categoryId?: string | null;
  [key: string]: unknown;
};

/** Crypto and Finance category IDs (from navigation) – chart only supports 1H, ALL */
const LIMITLESS_CRYPTO_CATEGORY_ID = "5e76699e-8763-4c91-85de-3efeb064efec";
const LIMITLESS_FINANCE_CATEGORY_ID = "4962ba38-2482-4e33-beff-2d3eb49f15bb";

const CHART_INTERVALS_CRYPTO_FINANCE = ["1H", "ALL"];
const CHART_INTERVALS_OTHER = ["1H", "6H", "1D", "1W", "1M", "ALL"];
import LimitlessOrderBook from "./components/OrderBook/OrderBook";
import LimitlessPriceChart from "./components/Chart/PriceChart";
import BuySellWidget from "./components/BuySellWidget/BuySellWidget";
import BuySellModal from "./components/BuySellModal/BuySellModal";
import TopHolders from "./components/TopHolders/TopHolders";
import { useWallet } from "@/contexts/WalletContext";
import { useBaseBalance } from "@/hooks/useBaseBalance";
import { useLimitlessHistoricalPrice } from "@/hooks/useLimitlessHistoricalPrice";
import { useLimitlessOrderBook } from "@/hooks/useLimitlessOrderBook";
import { useLimitlessPortfolioPositions } from "@/hooks/useLimitlessPortfolio";
import { useGenerateMarketReport } from "@/hooks/useGenerateMarketReport";

import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { usePrivy } from "@privy-io/react-auth";
import { PaywallModal } from "@/components/subscription/PaywallModal";

type TabId = "holders";

/** One market option for BuySellWidget / OrderBook (event can have multiple) */
type LimitlessMarketOption = {
  slug: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  venue: { exchange: string; adapter?: string } | null;
  positionIds: string[] | null;
};

type LimitlessTradingInterfaceProps = {
  eventTicker?: string | null;
  marketTitle?: string | null;
  totalVolume?: number;
  eventId?: string | null;
  onBack?: () => void;
  onReportGenerated?: (report: any) => void;
  userId?: string | null;
};

export default function LimitlessTradingInterface({
  eventTicker,
  marketTitle,
  totalVolume,
  eventId,
  onBack,
  onReportGenerated,
  userId,
}: LimitlessTradingInterfaceProps) {
  const { marketDetails, isLoading: isLoadingDetails } = useMarketDetails(
    eventTicker || null,
    eventId || null,
    eventTicker || null // Use ticker as slug for Limitless
  );

  // Generate report functionality
  const { generateFromMarket } = useGenerateMarketReport({
    onReportGenerated: (r) => {
      onReportGenerated?.(r);
    },
    userId: userId || undefined,
  });

  const { eoaAddress } = useWallet();
  const {
    usdcBalance: baseUsdcBalance,
    usdcBalanceFormatted: baseUsdcFormatted,
    ethBalanceFormatted: baseEthFormatted,
  } = useBaseBalance(eoaAddress);

  const { authenticated, ready, login } = usePrivy();
  const { isGenerating, startedAt } = useReportGenStatus(
    eventTicker || undefined,
  );
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // Initialize countdown when generation starts
  useEffect(() => {
    if (isGenerating && countdown === null) {
      if (startedAt) {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = 100 - (elapsed % 100);
        setCountdown(Math.max(1, remaining));
      } else {
        setCountdown(100);
      }
    } else if (!isGenerating && countdown !== null) {
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setHasGenerated(true);
    }
  }, [isGenerating, startedAt, countdown]);

  // Countdown timer interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (countdown !== null && countdown > 0 && isGenerating && eventTicker) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return 100;
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [countdown, isGenerating, eventTicker]);

  // Build market object for generation
  const marketForGeneration = useMemo(() => {
    if (!marketDetails || !eventTicker || !marketTitle) return null;
    const d = marketDetails as LimitlessMarketDetails;
    return {
      ticker: eventTicker,
      title: marketTitle,
      rawEventData: marketDetails,
      image: d.symbol_image_url || d.image,
      icon: d.symbol_image_url || d.icon,
    };
  }, [marketDetails, eventTicker, marketTitle]);

  const handleGenerateClick = useCallback(async () => {
    if (!authenticated) {
      await login();
      return;
    }

    if (!marketForGeneration || !ready) return;

    try {
      await generateFromMarket(marketForGeneration as any);
      setHasGenerated(true);
    } catch (err: any) {
      if (err?.status === 402) {
        setShowPaywall(true);
      }
      setCountdown(null);
      setHasGenerated(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [authenticated, login, marketForGeneration, ready, generateFromMarket]);

  // Yes/No prices in 0-1 form (API may return cents 0-100, 0-1, or "—" for group events)
  const yesPrice = useMemo(() => {
    const d = marketDetails as LimitlessMarketDetails | null;
    const p = d?.yesPrice ?? d?.prices?.[0];
    if (typeof p === "number" && Number.isFinite(p)) return p > 1 ? p / 100 : p;
    if (typeof p === "string" && p !== "" && p !== "—") {
      const n = parseFloat(p);
      if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
    }
    return 0.5;
  }, [marketDetails]);
  const noPrice = useMemo(() => {
    const d = marketDetails as LimitlessMarketDetails | null;
    const p = d?.noPrice ?? d?.prices?.[1];
    if (typeof p === "number" && Number.isFinite(p)) return p > 1 ? p / 100 : p;
    if (typeof p === "string" && p !== "" && p !== "—") {
      const n = parseFloat(p);
      if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
    }
    return 0.5;
  }, [marketDetails]);
  const [selectedOrderBookOutcome, setSelectedOrderBookOutcome] = useState<"Yes" | "No">("Yes");
  const [selectedChartInterval, setSelectedChartInterval] = useState("1W");
  const [selectedMarketIndex, setSelectedMarketIndex] = useState(0);
  const [isBuySellModalOpen, setIsBuySellModalOpen] = useState(false);
  const [modalInitialOutcome, setModalInitialOutcome] = useState<"Yes" | "No">("Yes");

  // Live orderbook-derived prices (follow Limitless: best ask = buy YES price, 1 - best bid ≈ buy NO price)
  const selectedMarketSlug = useMemo(
    () => (marketDetails ? (marketDetails as LimitlessMarketDetails).slug ?? eventTicker : eventTicker) as string | null,
    [marketDetails, eventTicker],
  );
  const { data: orderBookData } = useLimitlessOrderBook(selectedMarketSlug);
  const { yesFromOrderBook, noFromOrderBook } = useMemo(() => {
    if (!orderBookData || !orderBookData.asks?.length || !orderBookData.bids?.length) {
      return { yesFromOrderBook: undefined, noFromOrderBook: undefined };
    }
    const bestAsk = [...orderBookData.asks].sort((a, b) => a.price - b.price)[0]?.price ?? 0;
    const bestBid = [...orderBookData.bids].sort((a, b) => b.price - a.price)[0]?.price ?? 0;
    const yesP = bestAsk && Number.isFinite(bestAsk) ? bestAsk : undefined;
    const noPRaw = 1 - bestBid;
    const noP = bestBid && Number.isFinite(noPRaw) ? Math.max(0, Math.min(1, noPRaw)) : undefined;
    return { yesFromOrderBook: yesP, noFromOrderBook: noP };
  }, [orderBookData]);

  const handleOrderBookBuyClick = useCallback((outcome: "Yes" | "No") => {
    setSelectedOrderBookOutcome(outcome);
    setModalInitialOutcome(outcome);
    setIsBuySellModalOpen(true);
  }, []);

  const { data: historicalData, isLoading: isLoadingChart } = useLimitlessHistoricalPrice({
    slug: eventTicker || null,
    interval: selectedChartInterval,
  });
  const chartHistory = historicalData?.history ?? [];
  const historyByMarket = historicalData?.markets ?? [];

  // Build multi-market chart: top markets by best (top 3) latest price, merge history (Polymarket/Kalshi style)
  const { chartData: limitlessChartData, marketKeys: limitlessMarketKeys } = useMemo(() => {
    const rawData = marketDetails as LimitlessMarketDetails | null;
    const eventMarkets = (rawData?.rawEventData as { markets?: { id?: number; title?: string; slug?: string; prices?: number[] }[] } | undefined)?.markets ?? [];
    if (eventMarkets.length === 0 || historyByMarket.length === 0) {
      return { chartData: [], marketKeys: [] };
    }

    const MARKET_COLORS = ["#8B5CF6", "#00ff88", "#00a8ff", "#ff6b6b", "#ffc000", "#9b59b6", "#1abc9c", "#e74c3c"];

    const byTitle = new Map<string, { title: string; slug?: string; history: { ts: number; price: number }[] }>();
    for (const m of historyByMarket) {
      const t = (m.title ?? "").trim();
      if (t) byTitle.set(t, { title: m.title, slug: m.slug, history: m.history ?? [] });
    }
    const bySlug = new Map<string, typeof historyByMarket[0]>();
    for (const m of historyByMarket) {
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
      const currentYes = Array.isArray(m.prices) && typeof m.prices[0] === "number" ? m.prices[0] : 0.5;
      const latestPrice = history.length > 0
        ? (typeof history[history.length - 1].price === "number" ? history[history.length - 1].price : currentYes)
        : currentYes;
      const pct = latestPrice <= 1 ? latestPrice * 100 : latestPrice;
      return { title, slug, latestPrice: pct, history };
    });

    const topMarkets = [...withLatest]
      .sort((a, b) => b.latestPrice - a.latestPrice)
      .slice(0, 4);

    const allDataPoints = new Map<number, { time: number; timestamp: number; [key: string]: number | undefined }>();
    for (const market of topMarkets) {
      const marketKey = market.title.replace(/[^a-zA-Z0-9]/g, "_");
      for (const { ts, price } of market.history) {
        const timeMs = ts * 1000;
        const pricePct = typeof price === "number" ? (price <= 1 ? price * 100 : price) : 0;
        if (!allDataPoints.has(ts)) {
          allDataPoints.set(ts, { time: timeMs, timestamp: ts });
        }
        allDataPoints.get(ts)![marketKey] = pricePct;
      }
    }
    const chartData = Array.from(allDataPoints.values()).sort((a, b) => a.timestamp - b.timestamp);
    const marketKeys = topMarkets.map((m, idx) => ({
      key: m.title.replace(/[^a-zA-Z0-9]/g, "_"),
      title: m.title,
      color: MARKET_COLORS[idx % MARKET_COLORS.length],
    }));
    return { chartData, marketKeys };
  }, [marketDetails, historyByMarket]);

  // Build list of markets for BuySellWidget / OrderBook (one event can have multiple markets)
  const marketsForTrading = useMemo((): LimitlessMarketOption[] => {
    const d = marketDetails as LimitlessMarketDetails | null;
    if (!d) return [];
    const raw = d.rawEventData as {
      markets?: Array<{
        slug?: string;
        title?: string;
        prices?: number[];
        tokens?: { yes?: string; no?: string };
        venue?: { exchange?: string; adapter?: string };
      }>;
      venue?: { exchange?: string; adapter?: string };
    } | undefined;
    const eventVenue =
      d.venue?.exchange != null
        ? { exchange: d.venue.exchange, adapter: d.venue.adapter }
        : raw?.venue?.exchange != null
          ? { exchange: raw.venue.exchange, adapter: raw.venue.adapter }
          : null;
    const eventPositionIds =
      Array.isArray(d.positionIds) && d.positionIds.length >= 2
        ? d.positionIds
        : null;
    const eventYes = (() => {
      const p = d.yesPrice ?? d.prices?.[0];
      if (typeof p === "number") return p > 1 ? p / 100 : p;
      if (typeof p === "string" && p !== "") return parseFloat(p) / 100;
      return 0.5;
    })();
    const eventNo = (() => {
      const p = d.noPrice ?? d.prices?.[1];
      if (typeof p === "number") return p > 1 ? p / 100 : p;
      if (typeof p === "string" && p !== "") return parseFloat(p) / 100;
      return 0.5;
    })();
    const subMarkets = raw?.markets ?? [];
    if (subMarkets.length > 0) {
      return subMarkets.map((m) => {
        const yes = Array.isArray(m.prices) && typeof m.prices[0] === "number" ? (m.prices[0] > 1 ? m.prices[0] / 100 : m.prices[0]) : 0.5;
        const no = Array.isArray(m.prices) && typeof m.prices[1] === "number" ? (m.prices[1] > 1 ? m.prices[1] / 100 : m.prices[1]) : 0.5;
        const venue =
          m.venue?.exchange != null
            ? { exchange: m.venue.exchange, adapter: m.venue.adapter }
            : eventVenue;
        const positionIds =
          m.tokens?.yes != null && m.tokens?.no != null
            ? [String(m.tokens.yes), String(m.tokens.no)]
            : eventPositionIds;
        return {
          slug: m.slug ?? String(m.title ?? ""),
          title: (m.title ?? "Market").trim(),
          yesPrice: yes,
          noPrice: no,
          venue,
          positionIds,
        };
      });
    }
    return [
      {
        slug: String(eventTicker ?? d.ticker ?? ""),
        title: String((typeof marketTitle === "string" ? marketTitle : d.title) ?? "Market"),
        yesPrice: eventYes,
        noPrice: eventNo,
        venue: eventVenue,
        positionIds: eventPositionIds,
      },
    ];
  }, [marketDetails, eventTicker, marketTitle]);

  const selectedMarket = useMemo((): LimitlessMarketOption | null => {
    if (marketsForTrading.length === 0) return null;
    const idx = Math.max(0, Math.min(selectedMarketIndex, marketsForTrading.length - 1));
    return marketsForTrading[idx] ?? marketsForTrading[0];
  }, [marketsForTrading, selectedMarketIndex]);

  const effectiveYesPrice = yesFromOrderBook ?? selectedMarket?.yesPrice ?? yesPrice;
  const effectiveNoPrice = noFromOrderBook ?? selectedMarket?.noPrice ?? noPrice;

  const { data: portfolioPositions = [] } = useLimitlessPortfolioPositions();
  const marketSlugForPositions = selectedMarket?.slug ?? eventTicker ?? "";
  const { availableYesShares, availableNoShares } = useMemo(() => {
    let yes = 0;
    let no = 0;
    for (const p of portfolioPositions) {
      const slug = p.marketSlug ?? p.market ?? "";
      if (slug !== marketSlugForPositions) continue;
      const size = Number(p.size ?? p.balance ?? 0);
      if (!Number.isFinite(size) || size <= 0) continue;
      if (p.outcome === "Yes") yes += size;
      else if (p.outcome === "No") no += size;
    }
    return { availableYesShares: yes, availableNoShares: no };
  }, [portfolioPositions, marketSlugForPositions]);

  const [bottomTab, setBottomTab] = useState<TabId>("holders");
  const tabs: { id: TabId; label: string }[] = [
    { id: "holders", label: "Top Holders" },
  ];

  // Chart intervals: Crypto & Finance = 1H, ALL; Other = 1H, 6H, 1D, 1W, 1M, ALL
  const chartIntervals = useMemo(() => {
    const d = marketDetails as LimitlessMarketDetails | null;
    const categoryId = d?.categoryId?.trim();
    if (
      categoryId === LIMITLESS_CRYPTO_CATEGORY_ID ||
      categoryId === LIMITLESS_FINANCE_CATEGORY_ID
    ) {
      return CHART_INTERVALS_CRYPTO_FINANCE;
    }
    return CHART_INTERVALS_OTHER;
  }, [marketDetails]);

  // Keep selected interval in sync with available options
  useEffect(() => {
    if (chartIntervals.length > 0 && !chartIntervals.includes(selectedChartInterval)) {
      setSelectedChartInterval(chartIntervals[0]);
    }
  }, [chartIntervals, selectedChartInterval]);

  // Keep selected market index in bounds when markets list changes
  useEffect(() => {
    if (marketsForTrading.length > 0 && selectedMarketIndex >= marketsForTrading.length) {
      setSelectedMarketIndex(0);
    }
  }, [marketsForTrading.length, selectedMarketIndex]);

  // Loading and error states
  if (isLoadingDetails) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">Loading market data...</div>
      </div>
    );
  }

  if (!marketDetails || !eventTicker) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">No market data available</div>
      </div>
    );
  }

  const details = marketDetails as LimitlessMarketDetails;
  // Prefer top-level venue/positionIds from API; fallback to rawEventData (tokens.yes/no)
  const rawEventData = details.rawEventData as
    | { venue?: { exchange?: string; adapter?: string }; positionIds?: string[]; tokens?: { yes?: string; no?: string } }
    | undefined;
  const venue =
    details.venue?.exchange != null
      ? { exchange: details.venue.exchange, adapter: details.venue.adapter }
      : rawEventData?.venue?.exchange != null
        ? { exchange: rawEventData.venue.exchange, adapter: rawEventData.venue.adapter }
        : null;
  const positionIds =
    Array.isArray(details.positionIds) && details.positionIds.length >= 2
      ? details.positionIds
      : Array.isArray(rawEventData?.positionIds) && rawEventData.positionIds.length >= 2
        ? rawEventData.positionIds
        : rawEventData?.tokens?.yes != null && rawEventData?.tokens?.no != null
          ? [String(rawEventData.tokens.yes), String(rawEventData.tokens.no)]
          : null;

  const rawWithVolume = rawEventData as { volume?: number | string; volumeFormatted?: string } | undefined;
  const displayVolume = (() => {
    if (typeof rawWithVolume?.volumeFormatted === "string") {
      const v = parseFloat(rawWithVolume.volumeFormatted);
      if (Number.isFinite(v)) return v;
    }
    if (typeof totalVolume === "number" && Number.isFinite(totalVolume) && totalVolume >= 0) {
      return totalVolume;
    }
    if (typeof rawWithVolume?.volume === "number" && Number.isFinite(rawWithVolume.volume)) {
      return rawWithVolume.volume;
    }
    if (typeof rawWithVolume?.volume === "string") {
      const v = parseFloat(rawWithVolume.volume);
      if (Number.isFinite(v)) return v;
    }
    return 0;
  })();

  return (
    <div className="flex flex-col h-full w-full bg-black text-white overflow-hidden">
      <TradingHeader
        marketTitle={typeof marketTitle === "string" ? marketTitle : null}
        symbolImageUrl={
          typeof details.symbol_image_url === "string"
            ? details.symbol_image_url
            : typeof details.image === "string"
              ? details.image
              : undefined
        }
        currentYesPrice={Number.isFinite(effectiveYesPrice) ? effectiveYesPrice : 0.5}
        totalVolume={displayVolume}
        volumeLabel="USDC"
        onBack={onBack}
        onGenerateClick={handleGenerateClick}
        isGenerating={isGenerating}
        countdown={countdown}
        hasGenerated={hasGenerated}
        ready={ready}
        canGenerate={!!marketForGeneration}
      />

      {/* Main content area - scrollable like Polymarket/Kalshi so user can scroll to see all content below */}
      <div
        className="flex-1 overflow-y-auto custom-sidebar-scrollbar min-h-0"
        style={{ paddingBottom: "80px", WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col min-h-full">
          {/* Top section - Row 1: Chart | BuySellWidget only (same as Polymarket/Kalshi) */}
          <div className="flex flex-col lg:flex-row border-b border-white/10 shrink-0">
            {/* Chart */}
            <div className="flex-1 flex flex-col min-w-0 w-full min-h-100 lg:w-auto lg:min-h-130">
              <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/10">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {chartIntervals.map((interval) => (
                    <button
                      key={interval}
                      onClick={() => setSelectedChartInterval(interval)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors whitespace-nowrap ${
                        selectedChartInterval === interval
                          ? "bg-[#8B5CF6] text-white font-semibold"
                          : "bg-white/10 text-white/60 hover:bg-white/20"
                      }`}
                    >
                      {interval}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-white/60 hidden sm:block truncate max-w-50">
                  {typeof marketTitle === "string" ? marketTitle : ""}
                </div>
              </div>
              <div className="h-87.5 lg:h-auto lg:flex-1 lg:min-h-112.5 relative bg-[#0a0a0a]">
                {isLoadingChart ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white/60">Loading chart...</div>
                  </div>
                ) : limitlessChartData.length > 0 && limitlessMarketKeys.length > 0 ? (
                  <LimitlessPriceChart
                    chartData={limitlessChartData}
                    marketKeys={limitlessMarketKeys}
                  />
                ) : (
                  <LimitlessPriceChart history={chartHistory} lineName="Yes" />
                )}
              </div>
            </div>

            {/* Mobile: Order book only; Buy/Sell opens in modal (like Polymarket/Kalshi) */}
            <div className="lg:hidden w-full shrink-0 border-t border-white/10 flex flex-col">
              <div className="min-h-80 overflow-hidden">
                <LimitlessOrderBook
                  marketSlug={selectedMarket?.slug ?? eventTicker}
                  yesPrice={effectiveYesPrice}
                  noPrice={effectiveNoPrice}
                  onBuyClick={handleOrderBookBuyClick}
                  selectedOutcome={selectedOrderBookOutcome}
                />
              </div>
            </div>

            {/* Desktop: BuySellWidget next to chart only (no Orderbook in row 1) */}
            <div className="hidden lg:block w-87.5 shrink-0 border-l border-white/10">
              <BuySellWidget
                currentYesPrice={effectiveYesPrice}
                currentNoPrice={effectiveNoPrice}
                availableYesShares={availableYesShares}
                availableNoShares={availableNoShares}
                symbolImageUrl={typeof details.symbol_image_url === "string" ? details.symbol_image_url : typeof details.image === "string" ? details.image : undefined}
                marketTitle={selectedMarket?.title ?? (typeof marketTitle === "string" ? marketTitle : undefined)}
                marketSlug={selectedMarket?.slug ?? eventTicker}
                venue={selectedMarket?.venue ?? venue}
                positionIds={selectedMarket?.positionIds ?? positionIds}
                marketsForTrading={marketsForTrading}
                selectedMarketIndex={selectedMarketIndex}
                onMarketIndexChange={setSelectedMarketIndex}
                usdcBalance={baseUsdcBalance}
                usdcBalanceFormatted={baseUsdcFormatted}
                nativeBalanceFormatted={baseEthFormatted}
                nativeLabel="Base"
              />
            </div>
          </div>

          {/* Bottom section - Row 2: Top Holders | Orderbook (Comments/Activity removed for Limitless) */}
          <div className="flex min-h-100 flex-col shrink-0 border-t border-white/10">
            <div className="flex flex-col lg:flex-row items-stretch gap-4 p-4 shrink-0" style={{ maxHeight: "750px" }}>
              {/* Top Holders - left side */}
              <div className="flex-1 flex flex-col min-w-0 w-full lg:w-auto">
                <div className="flex items-center gap-1 border-b border-white/10 pb-2 mb-4">
                  {tabs.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setBottomTab(id)}
                      className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${
                        bottomTab === id ? "text-white border-b-2" : "text-white/60 hover:text-white/80"
                      }`}
                      style={bottomTab === id ? { borderBottomColor: "#8B5CF6" } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-select-scrollbar">
                  <TopHolders marketSlug={selectedMarket?.slug ?? eventTicker} />
                </div>
              </div>

              {/* Desktop: Orderbook on the right (same as Polymarket/Kalshi) */}
              <div className="hidden lg:flex w-100 shrink-0 border-l border-white/10 flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <LimitlessOrderBook
                    marketSlug={selectedMarket?.slug ?? eventTicker}
                    yesPrice={effectiveYesPrice}
                    noPrice={effectiveNoPrice}
                    onBuyClick={setSelectedOrderBookOutcome}
                    selectedOutcome={selectedOrderBookOutcome}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buy/Sell Modal - Mobile only (same pattern as Polymarket/Kalshi) */}
      <BuySellModal
        isOpen={isBuySellModalOpen}
        onClose={() => setIsBuySellModalOpen(false)}
        currentYesPrice={effectiveYesPrice}
        currentNoPrice={effectiveNoPrice}
        availableYesShares={availableYesShares}
        availableNoShares={availableNoShares}
        onBuyClick={() => setIsBuySellModalOpen(false)}
        onSellClick={() => setIsBuySellModalOpen(false)}
        symbolImageUrl={typeof details.symbol_image_url === "string" ? details.symbol_image_url : typeof details.image === "string" ? details.image : undefined}
        marketTitle={selectedMarket?.title ?? (typeof marketTitle === "string" ? marketTitle : undefined)}
        marketSlug={selectedMarket?.slug ?? eventTicker}
        venue={selectedMarket?.venue ?? venue}
        positionIds={selectedMarket?.positionIds ?? positionIds}
        usdcBalance={baseUsdcBalance}
        usdcBalanceFormatted={baseUsdcFormatted}
        nativeBalanceFormatted={baseEthFormatted}
        nativeLabel="Base"
        initialOutcome={modalInitialOutcome}
      />
<PaywallModal
      open={showPaywall}
      onClose={() => setShowPaywall(false)}
      context="rexmarkets"
      paymentMetadata={userId ? { userId } : undefined}
    />
    </div>
  );
}
