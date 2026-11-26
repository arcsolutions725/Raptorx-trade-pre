"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import { Select, SelectOption } from "@/components/ui/Select";
import TradingHeader from "./components/Header/TradingHeader";
import {
  FeedTabs,
  MarketPageLoading,
  MarketPageMessage,
  OutcomeTabs,
  RangeSeg,
  TicketGutter,
} from "../shared/marketUi";
import "@/styles/pages/market-venues-a.css";
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
import { usePolymarketTradesSync } from "@/hooks/usePolymarketTradesSync";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import { useRexMarketsGenerateReportOptional } from "@/app/rexmarkets/_components/RexMarketsGenerateReportContext";

const INTERVALS = ["1H", "6H", "1D", "1W", "1M", "ALL"];

/** Polymarket tag slug (e.g. "us-politics") as a breadcrumb label ("Us politics"). */
function categoryLabel(slug: unknown): string | null {
  if (typeof slug !== "string" || !slug.trim()) return null;
  const text = slug.trim().replace(/[-_]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Props = PolymarketTradingInterfaceProps & {
  /** Claw AI 5.0 button in the market head: opens / closes the Rex Pilot sidebar */
  onPilotToggle?: () => void;
  pilotOpen?: boolean;
  /** id of the Rex Pilot sidebar element (aria-controls) */
  pilotControlsId?: string;
};

export default function PolymarketTradingInterface({
  eventTicker,
  marketTitle,
  totalVolume,
  eventId,
  onBack,
  onReportGenerated,
  userId,
  sessionSavedReportId,
  onPilotToggle,
  pilotOpen,
  pilotControlsId,
}: Props) {
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
  const [mobileOrderBookDepthExpanded, setMobileOrderBookDepthExpanded] =
    useState(true);

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
  usePolymarketTradesSync(userId ?? null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (!sessionSavedReportId) setHasGenerated(false);
  }, [sessionSavedReportId]);

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

  const generateReportSidebar = useRexMarketsGenerateReportOptional();
  useEffect(() => {
    if (!generateReportSidebar) return;
    generateReportSidebar.registerGenerateHandler(() => handleGenerateClick());
    return () => generateReportSidebar.registerGenerateHandler(null);
  }, [generateReportSidebar, handleGenerateClick]);

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

  const symbolImageUrl = marketDetails?.symbol_image_url || undefined;
  const outcomeTabs =
    marketsForOrderBook.length > 2 ? (
      <OutcomeTabs
        items={marketsForOrderBook.map((market) => ({
          key: market.clobTokenId,
          label: market.marketTitle,
        }))}
        selectedIndex={selectedMarketIndex}
        onSelect={setSelectedMarketIndex}
      />
    ) : null;

  // Loading and error states
  if (isLoadingDetails) {
    return (
      <div className="rx-mk">
        <MarketPageLoading />
      </div>
    );
  }

  if (!marketDetails || !eventTicker) {
    return (
      <div className="rx-mk">
        <MarketPageMessage title="No market data available" />
      </div>
    );
  }

  return (
    <div className="rx-mk">
      <div className="mk-frame">
        <TradingHeader
          marketTitle={marketTitle}
          symbolImageUrl={symbolImageUrl}
          currentYesPrice={currentYesPrice}
          totalVolume={totalVolume}
          volumePrefix="$"
          seriesVolume={
            typeof marketDetails.total_series_volume === "number"
              ? marketDetails.total_series_volume
              : undefined
          }
          category={categoryLabel(marketDetails.category)}
          venue="polymarket"
          onBack={onBack}
          onGenerateClick={handleGenerateClick}
          isGenerating={isGenerating}
          countdown={countdown}
          hasGenerated={hasGenerated}
          ready={ready}
          canGenerate={!!marketForGeneration}
          onPilotToggle={onPilotToggle}
          pilotOpen={pilotOpen}
          pilotControlsId={pilotControlsId}
        />

        {/* Everything under the market head scrolls */}
        <div className="mk-scroll">
          {/* Chart + trade ticket: side by side on wide screens (filling the view), stacked on narrow ones */}
          <div className="mk-main">
            <section className="mk-chart" aria-label="Odds over time">
              <div className="mk-chart__head">
                <span className="rx-eyebrow">Odds over time</span>
                <RangeSeg
                  ranges={INTERVALS}
                  value={selectedInterval}
                  onChange={setSelectedInterval}
                />
              </div>
              <PriceChart
                markets={marketsWithClobTokenIds}
                interval={selectedInterval}
              />
            </section>

            {/* line between chart and ticket: drag (or arrow keys) to resize the ticket */}
            <TicketGutter />

            <section className="mk-side" aria-label="Trade">
              <BuySellWidget
                currentYesPrice={currentYesPrice}
                currentNoPrice={currentNoPrice}
                onBuyClick={handleBuyClick}
                onSellClick={handleSellClick}
                symbolImageUrl={symbolImageUrl}
                marketTitle={marketTitle || undefined}
                availableMarkets={availableMarkets}
                marketsForOrderBook={marketsForOrderBook}
                selectedMarketIndex={selectedMarketIndex}
                onMarketIndexChange={setSelectedMarketIndex}
              />
            </section>
          </div>

          {/* Phones and tablets: order book under the ticket */}
          <section className="mk-book mk-book--stack" aria-label="Order book">
            <div className="mk-sec-head">
              <span className="rx-eyebrow">Order book</span>
            </div>
            {outcomeTabs}
            <div
              className={
                mobileOrderBookDepthExpanded ? "mk-book__fill is-open" : "mk-book__fill"
              }
            >
              <OrderBook
                clobTokenId={selectedMarketClobTokenId}
                yesPrice={currentYesPrice}
                noPrice={currentNoPrice}
                onBuyClick={handleOrderBookBuyClick}
                selectedOutcome={selectedOrderBookOutcome}
                onDepthExpandedChange={setMobileOrderBookDepthExpanded}
              />
            </div>
          </section>

          {/* Comments / top holders / activity, and the order book beside them on desktop */}
          <div className="mk-lower">
            <section className="mk-feed" aria-label="Comments, top holders and activity">
              <FeedTabs
                tabs={[
                  { key: "comments" as const, label: "Comments", count: commentsCount },
                  { key: "holders" as const, label: "Top holders" },
                  { key: "activity" as const, label: "Latest activity" },
                ]}
                active={activeTab}
                onChange={setActiveTab}
              />

              {/* Filters - Only show for Activity tab */}
              {activeTab === "activity" && (
                <div className="mk-feed__filters">
                  <Select
                    value={marketFilter}
                    onChange={setMarketFilter}
                    options={marketOptions}
                    placeholder="Select Market"
                    className="mk-select"
                  />
                  <Select
                    value={priceFilter}
                    onChange={setPriceFilter}
                    options={priceFilterOptions}
                    placeholder="Select Price"
                    className="mk-select"
                  />
                </div>
              )}

              <div className="mk-feed__body" role="tabpanel">
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
            </section>

            <section className="mk-book mk-book--side" aria-label="Order book">
              <div className="mk-sec-head">
                <span className="rx-eyebrow">Order book</span>
              </div>
              {outcomeTabs}
              <OrderBook
                clobTokenId={selectedMarketClobTokenId}
                yesPrice={currentYesPrice}
                noPrice={currentNoPrice}
                onBuyClick={handleOrderBookBuyClick}
                selectedOutcome={selectedOrderBookOutcome}
                showDepthToggle={false}
              />
            </section>
          </div>
        </div>
      </div>

      {/* Buy/Sell sheet - phones only (opened from the order book) */}
      <BuySellModal
        isOpen={isBuySellModalOpen}
        onClose={() => setIsBuySellModalOpen(false)}
        currentYesPrice={currentYesPrice}
        currentNoPrice={currentNoPrice}
        onBuyClick={handleBuyClick}
        onSellClick={handleSellClick}
        symbolImageUrl={symbolImageUrl}
        marketTitle={marketTitle || undefined}
        availableMarkets={availableMarkets}
        marketsForOrderBook={marketsForOrderBook}
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
