"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import { Select, SelectOption } from "@/components/ui/Select";
import TradingHeader from "../PolymarketTradingInterface/components/Header/TradingHeader";
import PriceChart from "./components/Chart/PriceChart";
import KalshiOrderBook from "./components/OrderBook/OrderBook";
import KalshiComments from "./components/Comments/Comments";
import KalshiActivityFeed from "./components/ActivityFeed/ActivityFeed";
import BuySellWidget from "./components/BuySellWidget/BuySellWidget";
import BuySellModal from "./components/BuySellModal/BuySellModal";
import { useGenerateMarketReport } from "@/hooks/useGenerateMarketReport";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { usePrivy } from "@privy-io/react-auth";
import { useKalshiComments } from "@/hooks/useKalshiComments";
import { PaywallModal } from "@/components/subscription/PaywallModal";

const INTERVALS = ["1H", "6H", "1D", "1W", "1M", "ALL"];

type KalshiTradingInterfaceProps = {
  eventTicker?: string | null;
  marketTitle?: string | null;
  totalVolume?: number;
  eventId?: string | null;
  onBack?: () => void;
  onReportGenerated?: (report: any) => void;
  userId?: string | null;
};

export default function KalshiTradingInterface({
  eventTicker,
  marketTitle,
  totalVolume,
  eventId,
  onBack,
  onReportGenerated,
  userId,
}: KalshiTradingInterfaceProps) {
  const { marketDetails, isLoading: isLoadingDetails } = useMarketDetails(
    eventTicker || null,
    eventId || null,
  );

  // Only show active markets (exclude finalized, etc.) for chart, order book, and buy/sell
  const activeMarkets = useMemo(() => {
    if (!marketDetails?.markets?.length) return [];
    return marketDetails.markets.filter(
      (m) => (m.status || "").toLowerCase() === "active"
    );
  }, [marketDetails?.markets]);

  // Get markets for order book (using ticker for DFlow API) — active only
  const marketsForOrderBook = useMemo(() => {
    if (activeMarkets.length === 0) return [];
    return activeMarkets.map((market) => ({
      marketTicker: market.ticker,
      marketTitle: market.subtitle || market.ticker || "Market",
      ticker: market.ticker,
      yesPrice: market.yes_price || 0,
      noPrice: market.no_price || 0,
      volume: market.volume || 0,
    }));
  }, [activeMarkets]);


  // State for selected market (for order book)
  const [selectedMarketIndex, setSelectedMarketIndex] = useState(0);
  // State for selected outcome in order book (Yes or No)
  const [selectedOrderBookOutcome, setSelectedOrderBookOutcome] = useState<
    "Yes" | "No"
  >("Yes");

  // Reset selected market index if it becomes out of bounds
  useEffect(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex >= marketsForOrderBook.length
    ) {
      setSelectedMarketIndex(0);
    }
  }, [marketsForOrderBook.length, selectedMarketIndex]);

  // Get selected market's ticker
  const selectedMarketTicker = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex].marketTicker;
    }
    return null;
  }, [marketsForOrderBook, selectedMarketIndex]);

  // State management
  const [selectedInterval, setSelectedInterval] = useState("ALL");
  const [buySellType, setBuySellType] = useState<"buy" | "sell">("buy");
  const [selectedOutcome, setSelectedOutcome] = useState<"Yes" | "No">("Yes");
  const [activeTab, setActiveTab] = useState<"activity" | "comments">(
    "comments",
  );
  const [isBuySellModalOpen, setIsBuySellModalOpen] = useState(false);
  const [modalInitialOutcome, setModalInitialOutcome] = useState<"Yes" | "No">(
    "Yes",
  );

  // Generate report functionality
  const { generateFromMarket } = useGenerateMarketReport({
    onReportGenerated: (r) => {
      onReportGenerated?.(r);
    },
    userId: userId || undefined,
  });

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

  // Build market object for generation (use first active market)
  const marketForGeneration = useMemo(() => {
    if (!marketDetails || !eventTicker || !marketTitle) return null;

    const firstMarket = activeMarkets[0];
    if (!firstMarket) return null;

    return {
      ticker: eventTicker,
      title: marketTitle,
      rawEventData: marketDetails,
      image: marketDetails.symbol_image_url,
      icon: marketDetails.symbol_image_url,
    };
  }, [marketDetails, activeMarkets, eventTicker, marketTitle]);

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

  // Get available markets for filter and trading — active only
  const availableMarkets = useMemo(() => {
    if (activeMarkets.length === 0) return [];
    return activeMarkets.map((market) => ({
      condition_id: market.ticker,
      ticker: market.ticker,
      groupItemTitle: market.subtitle,
      subtitle: market.subtitle,
      yes_price: market.yes_price,
      no_price: market.no_price,
    }));
  }, [activeMarkets]);

  // Get current market prices from selected market
  const currentYesPrice = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex].yesPrice;
    }
    if (activeMarkets.length > 0) {
      return activeMarkets[0].yes_price || 0;
    }
    return 0;
  }, [marketsForOrderBook, selectedMarketIndex, activeMarkets]);

  const currentNoPrice = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex].noPrice;
    }
    if (activeMarkets.length > 0) {
      return activeMarkets[0].no_price || 0;
    }
    return 0;
  }, [marketsForOrderBook, selectedMarketIndex, activeMarkets]);

  // Handlers
  const handleBuyClick = (outcome: "Yes" | "No") => {
    setSelectedOutcome(outcome);
    setBuySellType("buy");
  };

  const handleSellClick = (outcome: "Yes" | "No") => {
    setSelectedOutcome(outcome);
    setBuySellType("sell");
  };

  // Handle buy click from OrderBook - open modal on mobile, update outcome on desktop
  const handleOrderBookBuyClick = (outcome: "Yes" | "No") => {
    setSelectedOrderBookOutcome(outcome);
    setModalInitialOutcome(outcome);
    setIsBuySellModalOpen(true);
    handleBuyClick(outcome);
  };

  // Get comments count
  const { data: commentsData } = useKalshiComments({
    eventTicker: eventTicker || undefined,
    limit: 100,
    includeComments: true,
    commentsMaxDepth: 3,
  });

  const commentsCount = useMemo(() => {
    if (!commentsData?.posts || !Array.isArray(commentsData.posts)) return 0;
    return commentsData.posts.length;
  }, [commentsData]);

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

  return (
    <div className="flex flex-col h-full w-full bg-black text-white overflow-hidden">
      <TradingHeader
        marketTitle={typeof marketTitle === "string" ? marketTitle : null}
        symbolImageUrl={
          typeof marketDetails.symbol_image_url === "string"
            ? marketDetails.symbol_image_url
            : undefined
        }
        currentYesPrice={currentYesPrice}
        totalVolume={typeof totalVolume === "number" ? totalVolume : undefined}
        onBack={onBack}
        onGenerateClick={handleGenerateClick}
        isGenerating={isGenerating}
        countdown={countdown}
        hasGenerated={hasGenerated}
        ready={ready}
        canGenerate={!!marketForGeneration}
      />

      {/* Main Content Area - Scrollable */}
      <div
        className="flex-1 overflow-y-auto custom-sidebar-scrollbar min-h-0"
        style={{ paddingBottom: "80px", WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col min-h-full">
          {/* Top Section - Chart placeholder and Order Book */}
          <div className="flex flex-col lg:flex-row border-b border-white/10 flex-shrink-0">
            {/* Chart - Full width on mobile with explicit min-height so it doesn't collapse, flex-1 on desktop */}
            <div className="flex-1 flex flex-col min-w-0 w-full min-h-[400px] lg:w-auto lg:min-h-[520px]">
              {/* Chart Controls */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/10">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {INTERVALS.map((interval) => (
                    <button
                      key={interval}
                      onClick={() => setSelectedInterval(interval)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors whitespace-nowrap ${
                        selectedInterval === interval
                          ? "bg-[#ffc000] text-black font-semibold"
                          : "bg-white/10 text-white/60 hover:bg-white/20"
                      }`}
                    >
                      {interval}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-white/60 hidden sm:block">
                  {typeof marketTitle === "string" ? marketTitle : ""}
                </div>
              </div>

              {/* Chart - explicit height on mobile so Recharts ResponsiveContainer can measure; flex on desktop */}
              <div className="h-[350px] lg:h-auto lg:flex-1 lg:min-h-[450px] relative bg-[#0a0a0a]">
                {activeMarkets.length > 0 ? (
                  <PriceChart
                    markets={activeMarkets}
                    interval={selectedInterval}
                    selectedMarketTicker={selectedMarketTicker}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white/60">
                      No price history available
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile: Order Book stacked under chart */}
            <div className="lg:hidden w-full flex-shrink-0 border-t border-white/10 flex flex-col">
              {marketsForOrderBook.length > 2 && (
                <div className="flex-shrink-0 border-b border-white/10 px-4 py-2">
                  <div className="flex items-center gap-1 overflow-x-auto custom-select-scrollbar">
                    {marketsForOrderBook.map((market, index) => (
                      <button
                        key={market.marketTicker}
                        onClick={() => setSelectedMarketIndex(index)}
                        className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                          selectedMarketIndex === index
                            ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                            : "text-white/60 hover:text-white/80"
                        }`}
                      >
                        {market.marketTitle}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="min-h-[350px] overflow-hidden">
                <KalshiOrderBook
                  marketTicker={selectedMarketTicker}
                  yesPrice={currentYesPrice}
                  noPrice={currentNoPrice}
                  onBuyClick={handleOrderBookBuyClick}
                  selectedOutcome={selectedOrderBookOutcome}
                />
              </div>
            </div>

            {/* Desktop: Buy/Sell next to chart - Kalshi BuySellWidget (DFlow order logic) */}
            <div className="hidden lg:flex lg:flex-col lg:min-h-[520px] w-[350px] flex-shrink-0 border-l border-white/10">
              <BuySellWidget
                currentYesPrice={currentYesPrice}
                currentNoPrice={currentNoPrice}
                onBuyClick={handleBuyClick}
                onSellClick={handleSellClick}
                symbolImageUrl={
                  typeof marketDetails.symbol_image_url === "string"
                    ? marketDetails.symbol_image_url
                    : undefined
                }
                marketTitle={
                  typeof marketTitle === "string" ? marketTitle : undefined
                }
                availableMarkets={availableMarkets}
                marketsForOrderBook={marketsForOrderBook.map((m) => ({
                  clobTokenId: null,
                  clobNoTokenId: null,
                  marketTitle: m.marketTitle,
                  ticker: m.ticker,
                  conditionId: m.ticker,
                  yesPrice: m.yesPrice,
                  noPrice: m.noPrice,
                  volume: m.volume,
                }))}
                selectedMarketIndex={selectedMarketIndex}
                onMarketIndexChange={setSelectedMarketIndex}
              />
            </div>
          </div>

          {/* Bottom Section - Comments/Activity */}
          <div className="flex min-h-[400px] flex-col flex-shrink-0 border-t border-white/10">
            <div
              className="flex flex-col lg:flex-row items-stretch gap-4 p-4 flex-shrink-0"
              style={{ maxHeight: "750px" }}
            >
              {/* Comments/Activity - Full width on mobile */}
              <div className="flex-1 flex flex-col min-w-0 w-full lg:w-auto">
                {/* Tabs */}
                <div className="flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-2 mb-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab("comments")}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === "comments"
                          ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                          : "text-white/60 hover:text-white/80"
                      }`}
                    >
                      Comments{" "}
                      {typeof commentsCount === "number" &&
                        commentsCount > 0 &&
                        `(${commentsCount})`}
                    </button>
                    <button
                      onClick={() => setActiveTab("activity")}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === "activity"
                          ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                          : "text-white/60 hover:text-white/80"
                      }`}
                    >
                      Latest Activity
                    </button>
                  </div>
                </div>

                {/* Content Area with Scroll */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-select-scrollbar">
                  {activeTab === "activity" ? (
                    <KalshiActivityFeed
                      seriesTicker={marketDetails.series_ticker}
                    />
                  ) : (
                    <KalshiComments eventTicker={eventTicker || undefined} />
                  )}
                </div>
              </div>

              {/* Desktop: Order Book moved here */}
              <div className="hidden lg:flex w-[400px] flex-shrink-0 border-l border-white/10 flex-col min-h-0">
                {marketsForOrderBook.length > 2 && (
                  <div className="flex-shrink-0 border-b border-white/10 px-4 py-2">
                    <div className="flex items-center gap-1 overflow-x-auto custom-select-scrollbar">
                      {marketsForOrderBook.map((market, index) => (
                        <button
                          key={market.marketTicker}
                          onClick={() => setSelectedMarketIndex(index)}
                          className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                            selectedMarketIndex === index
                              ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                              : "text-white/60 hover:text-white/80"
                          }`}
                        >
                          {market.marketTitle}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <KalshiOrderBook
                    marketTicker={selectedMarketTicker}
                    yesPrice={currentYesPrice}
                    noPrice={currentNoPrice}
                    onBuyClick={handleOrderBookBuyClick}
                    selectedOutcome={selectedOrderBookOutcome}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buy/Sell Modal - Mobile Only (same UI as Polymarket) */}
      <BuySellModal
        isOpen={isBuySellModalOpen}
        onClose={() => setIsBuySellModalOpen(false)}
        currentYesPrice={currentYesPrice}
        currentNoPrice={currentNoPrice}
        onBuyClick={handleBuyClick}
        onSellClick={handleSellClick}
        symbolImageUrl={
          typeof marketDetails.symbol_image_url === "string"
            ? marketDetails.symbol_image_url
            : undefined
        }
        marketTitle={
          typeof marketTitle === "string" ? marketTitle : undefined
        }
        availableMarkets={availableMarkets}
        marketsForOrderBook={marketsForOrderBook.map((m) => ({
          clobTokenId: null,
          clobNoTokenId: null,
          marketTitle: m.marketTitle,
          ticker: m.ticker,
          conditionId: m.ticker,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
          volume: m.volume,
        }))}
        selectedMarketIndex={selectedMarketIndex}
        onMarketIndexChange={setSelectedMarketIndex}
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
