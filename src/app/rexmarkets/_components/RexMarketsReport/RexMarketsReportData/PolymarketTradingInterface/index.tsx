"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import { Select, SelectOption } from "@/components/ui/Select";
import TradingHeader from "./components/Header/TradingHeader";
import PriceChart from "./components/Chart/PriceChart";
import OrderBook from "./components/OrderBook/OrderBook";
import TopHolders from "./components/TopHolders/TopHolders";
import ActivityFeed from "./components/ActivityFeed/ActivityFeed";
import Comments from "./components/Comments/Comments";
import BuySellWidget from "./components/BuySellWidget/BuySellWidget";
import BuySellModal from "./components/BuySellModal/BuySellModal";
import type { PolymarketTradingInterfaceProps } from "@/types/polymarketTrading";
import { useGenerateMarketReport } from "@/hooks/useGenerateMarketReport";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { usePrivy } from "@privy-io/react-auth";
import { usePolymarketComments } from "@/hooks/usePolymarketComments";

const INTERVALS = ["1H", "6H", "1D", "1W", "1M", "ALL"];

export default function PolymarketTradingInterface({
  eventTicker,
  marketTitle,
  totalVolume,
  eventId,
  onBack,
  onReportGenerated,
  userId,
}: PolymarketTradingInterfaceProps) {
  const { marketDetails, isLoading: isLoadingDetails } = useMarketDetails(
    eventTicker || null,
    eventId || null
  );

  // Get markets with clob_token_id for order book
  const marketsForOrderBook = useMemo(() => {
    if (!marketDetails?.markets || marketDetails.markets.length === 0) {
      return [];
    }

    return marketDetails.markets
      .filter((market) => !!market.clob_token_id)
      .map((market) => ({
        clobTokenId: market.clob_token_id!,
        clobNoTokenId: market.clob_no_token_id || null,
        marketTitle:
          market.groupItemTitle || market.subtitle || market.ticker || "Market",
        ticker: market.ticker,
        conditionId: market.condition_id || market.ticker,
        yesPrice: market.yes_price || 0,
        noPrice: market.no_price || 0,
        volume: market.volume || 0,
      }));
  }, [marketDetails]);

  // State for selected market (for order book)
  const [selectedMarketIndex, setSelectedMarketIndex] = useState(0);
  // State for selected outcome in order book (Yes or No)
  const [selectedOrderBookOutcome, setSelectedOrderBookOutcome] = useState<"Yes" | "No">("Yes");

  // Reset selected market index if it becomes out of bounds
  useEffect(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex >= marketsForOrderBook.length
    ) {
      setSelectedMarketIndex(0);
    }
  }, [marketsForOrderBook.length, selectedMarketIndex]);

  // Get selected market's clob token ID based on selected outcome
  const selectedMarketClobTokenId = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      const market = marketsForOrderBook[selectedMarketIndex];
      // Return YES token ID for "Yes" outcome, NO token ID for "No" outcome
      return selectedOrderBookOutcome === "Yes" 
        ? market.clobTokenId 
        : (market.clobNoTokenId || null);
    }
    return null;
  }, [marketsForOrderBook, selectedMarketIndex, selectedOrderBookOutcome]);

  // Get condition ID from selected market (for other components that still need it)
  const conditionId = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex].conditionId;
    }
    if (marketDetails?.markets && marketDetails.markets.length > 0) {
      const firstMarket = marketDetails.markets[0];
      return firstMarket.condition_id || firstMarket.ticker || null;
    }
    return eventTicker || null;
  }, [marketsForOrderBook, selectedMarketIndex, marketDetails, eventTicker]);

  // Get all markets with their CLOB token IDs for prices-history API
  // Each market will have its own price history fetched
  // Pass all markets to PriceChart - it will filter to show only markets with valid data
  // This allows fallback to next markets if first ones have empty price history
  const marketsWithClobTokenIds = useMemo(() => {
    if (!marketDetails?.markets || marketDetails.markets.length === 0) {
      return [];
    }

    const markets = marketDetails.markets
      .filter((market) => {
        const hasClobToken = !!market.clob_token_id;
        if (!hasClobToken) {
          console.warn(
            `Market "${
              market.groupItemTitle || market.ticker
            }" has no CLOB token ID`
          );
        }
        return hasClobToken;
      })
      .map((market) => ({
        clobTokenId: market.clob_token_id!,
        marketTitle:
          market.groupItemTitle || market.subtitle || market.ticker || "Market",
        ticker: market.ticker,
      }));

    // Pass all markets - PriceChart will filter to show only those with valid data
    return markets;
  }, [marketDetails]);

  // State management
  const [selectedInterval, setSelectedInterval] = useState("ALL");
  const [buySellType, setBuySellType] = useState<"buy" | "sell">("buy");
  const [selectedOutcome, setSelectedOutcome] = useState<"Yes" | "No">("Yes");
  const [activeTab, setActiveTab] = useState<
    "holders" | "activity" | "comments"
  >("comments");
  const [priceFilter, setPriceFilter] = useState<string>("100000");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [isBuySellModalOpen, setIsBuySellModalOpen] = useState(false);
  const [modalInitialOutcome, setModalInitialOutcome] = useState<"Yes" | "No">(
    "Yes"
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
    eventTicker || undefined
  );
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // Use the first market or construct from marketDetails
    const firstMarket = marketDetails.markets?.[0];
    if (!firstMarket) return null;

    return {
      ticker: eventTicker,
      title: marketTitle,
      rawEventData: marketDetails,
      image: marketDetails.symbol_image_url,
      icon: marketDetails.symbol_image_url,
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
    } catch {
      setCountdown(null);
      setHasGenerated(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [authenticated, login, marketForGeneration, ready, generateFromMarket]);

  // Get available markets for filter and trading
  const availableMarkets = useMemo(() => {
    if (!marketDetails?.markets) return [];
    return marketDetails.markets.map((market) => ({
      condition_id: market.condition_id,
      ticker: market.ticker,
      groupItemTitle: market.groupItemTitle,
      subtitle: market.subtitle,
      clob_token_id: market.clob_token_id,
      clob_no_token_id: market.clob_no_token_id,
      yes_price: market.yes_price,
      no_price: market.no_price,
    }));
  }, [marketDetails]);

  // Prepare market options for Select component
  const marketOptions: SelectOption[] = useMemo(() => {
    return [
      { value: "all", label: "All Markets" },
      ...availableMarkets.map((market) => ({
        value: market.condition_id || market.ticker || "",
        label: market.groupItemTitle || market.subtitle || market.ticker || "",
      })),
    ];
  }, [availableMarkets]);

  // Prepare price filter options
  const priceFilterOptions: SelectOption[] = useMemo(() => {
    return [
      { value: "0", label: "All trades" },
      { value: "10000", label: "Min $10,000" },
      { value: "50000", label: "Min $50,000" },
      { value: "100000", label: "Min $100,000" },
      { value: "250000", label: "Min $250,000" },
      { value: "500000", label: "Min $500,000" },
      { value: "1000000", label: "Min $1,000,000" },
    ];
  }, []);

  // Get current market prices from selected market
  const currentYesPrice = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex].yesPrice;
    }
    if (marketDetails?.markets && marketDetails.markets.length > 0) {
      return marketDetails.markets[0].yes_price || 0;
    }
    return 0;
  }, [marketsForOrderBook, selectedMarketIndex, marketDetails]);

  const currentNoPrice = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex].noPrice;
    }
    if (marketDetails?.markets && marketDetails.markets.length > 0) {
      return marketDetails.markets[0].no_price || 0;
    }
    return 0;
  }, [marketsForOrderBook, selectedMarketIndex, marketDetails]);

  // Handlers
  const handleBuyClick = (outcome: "Yes" | "No") => {
    setSelectedOutcome(outcome);
    setBuySellType("buy");
  };

  const handleSellClick = (outcome: "Yes" | "No") => {
    setSelectedOutcome(outcome);
    setBuySellType("sell");
  };

  // Fetch comments to get count - use seriesId if available, otherwise eventId
  const { data: comments } = usePolymarketComments({
    eventId: eventId || undefined,
    seriesId: marketDetails?.series_id || undefined,
    limit: 100,
    offset: 0,
  });

  const commentsCount = Array.isArray(comments) ? comments.length : 0;

  // Handle buy click from OrderBook - open modal on mobile and update order book outcome
  const handleOrderBookBuyClick = (outcome: "Yes" | "No") => {
    setSelectedOrderBookOutcome(outcome); // Update order book to show correct outcome
    setModalInitialOutcome(outcome);
    setIsBuySellModalOpen(true);
    handleBuyClick(outcome);
  };

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
        marketTitle={marketTitle}
        symbolImageUrl={marketDetails.symbol_image_url}
        currentYesPrice={currentYesPrice}
        totalVolume={totalVolume}
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
          {/* Top Section - Chart and Order Book */}
          {/* Desktop: Side by side, Mobile: Stacked vertically */}
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
                  {marketTitle}
                </div>
              </div>

              {/* Chart - explicit height on mobile so Recharts ResponsiveContainer can measure; flex on desktop */}
              <div className="h-[350px] lg:h-auto lg:flex-1 lg:min-h-[450px] relative bg-[#0a0a0a]">
                <PriceChart
                  markets={marketsWithClobTokenIds}
                  interval={selectedInterval}
                />
              </div>
            </div>

            {/* Mobile: Order Book stacked under chart */}
            <div className="lg:hidden w-full flex-shrink-0 border-t border-white/10 flex flex-col">
              {/* Market Tabs - Show when there are more than 2 markets */}
              {marketsForOrderBook.length > 2 && (
                <div className="flex-shrink-0 border-b border-white/10 px-4 py-2">
                  <div className="flex items-center gap-1 overflow-x-auto custom-select-scrollbar">
                    {marketsForOrderBook.map((market, index) => (
                      <button
                        key={market.clobTokenId}
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
                <OrderBook
                  clobTokenId={selectedMarketClobTokenId}
                  yesPrice={currentYesPrice}
                  noPrice={currentNoPrice}
                  onBuyClick={handleOrderBookBuyClick}
                  selectedOutcome={selectedOrderBookOutcome}
                />
              </div>
            </div>

            {/* Desktop: Buy/Sell next to chart */}
            <div className="hidden lg:block w-[350px] flex-shrink-0 border-l border-white/10">
              <BuySellWidget
                currentYesPrice={currentYesPrice}
                currentNoPrice={currentNoPrice}
                onBuyClick={handleBuyClick}
                onSellClick={handleSellClick}
                symbolImageUrl={marketDetails.symbol_image_url || undefined}
                marketTitle={marketTitle || undefined}
                availableMarkets={availableMarkets}
                marketsForOrderBook={marketsForOrderBook}
                selectedMarketIndex={selectedMarketIndex}
                onMarketIndexChange={setSelectedMarketIndex}
              />
            </div>
          </div>

          {/* Bottom Section - Top Holders/Activity and Buy/Sell */}
          {/* Desktop: Side by side, Mobile: Stacked */}
          <div className="flex min-h-[400px] flex-col flex-shrink-0 border-t border-white/10">
            <div
              className="flex flex-col lg:flex-row items-stretch gap-4 p-4 flex-shrink-0"
              style={{ maxHeight: "750px" }}
            >
              {/* Top Holders/Activity - Full width on mobile */}
              <div className="flex-1 flex flex-col min-w-0 w-full lg:w-auto">
                {/* Tabs and Filters */}
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
                      Comments {commentsCount > 0 && `(${commentsCount})`}
                    </button>
                    <button
                      onClick={() => setActiveTab("holders")}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === "holders"
                          ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                          : "text-white/60 hover:text-white/80"
                      }`}
                    >
                      Top Holders
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

                  {/* Filters - Only show for Activity tab */}
                  {activeTab === "activity" && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                      <Select
                        value={marketFilter}
                        onChange={setMarketFilter}
                        options={marketOptions}
                        placeholder="Select Market"
                        className="w-full sm:min-w-[150px]"
                      />
                      <Select
                        value={priceFilter}
                        onChange={setPriceFilter}
                        options={priceFilterOptions}
                        placeholder="Select Price"
                        className="w-full sm:min-w-[150px]"
                      />
                    </div>
                  )}
                </div>

                {/* Content Area with Scroll */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-select-scrollbar">
                  {activeTab === "holders" ? (
                    <TopHolders conditionId={conditionId} />
                  ) : activeTab === "activity" ? (
                    <ActivityFeed
                      conditionId={conditionId}
                      eventId={eventId}
                      marketFilter={marketFilter}
                      priceFilter={priceFilter}
                    />
                  ) : (
                    <Comments 
                      eventId={eventId || undefined} 
                      seriesId={marketDetails?.series_id || undefined}
                    />
                  )}
                </div>
              </div>

              {/* Desktop: Order Book moved here (swap with Buy/Sell) */}
              <div className="hidden lg:flex w-[400px] flex-shrink-0 border-l border-white/10 flex-col min-h-0">
                {/* Market Tabs - Show when there are more than 2 markets */}
                {marketsForOrderBook.length > 2 && (
                  <div className="flex-shrink-0 border-b border-white/10 px-4 py-2">
                    <div className="flex items-center gap-1 overflow-x-auto custom-select-scrollbar">
                      {marketsForOrderBook.map((market, index) => (
                        <button
                          key={market.clobTokenId}
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
                  <OrderBook
                    clobTokenId={selectedMarketClobTokenId}
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

      {/* Buy/Sell Modal - Mobile Only */}
      <BuySellModal
        isOpen={isBuySellModalOpen}
        onClose={() => setIsBuySellModalOpen(false)}
        currentYesPrice={currentYesPrice}
        currentNoPrice={currentNoPrice}
        onBuyClick={handleBuyClick}
        onSellClick={handleSellClick}
        symbolImageUrl={marketDetails.symbol_image_url || undefined}
        marketTitle={marketTitle || undefined}
        availableMarkets={availableMarkets}
        marketsForOrderBook={marketsForOrderBook}
        selectedMarketIndex={selectedMarketIndex}
        onMarketIndexChange={setSelectedMarketIndex}
        initialOutcome={modalInitialOutcome}
      />
    </div>
  );
}
