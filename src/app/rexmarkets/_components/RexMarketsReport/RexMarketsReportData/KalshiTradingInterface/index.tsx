"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import TradingHeader from "../PolymarketTradingInterface/components/Header/TradingHeader";
import {
  FeedTabs,
  MarketPageLoading,
  MarketPageMessage,
  OutcomeTabs,
  RangeSeg,
  TicketGutter,
} from "../shared/marketUi";
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
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import { useRexMarketsGenerateReportOptional } from "@/app/rexmarkets/_components/RexMarketsGenerateReportContext";

const INTERVALS = ["1H", "6H", "1D", "1W", "1M", "ALL"];

type KalshiTradingInterfaceProps = {
  eventTicker?: string | null;
  marketTitle?: string | null;
  totalVolume?: number;
  eventId?: string | null;
  onBack?: () => void;
  onReportGenerated?: (report: any) => void;
  userId?: string | null;
  sessionSavedReportId?: string | null;
  /** Claw AI 5.0 button in the market head: opens / closes the Rex Pilot sidebar */
  onPilotToggle?: () => void;
  pilotOpen?: boolean;
  /** id of the Rex Pilot sidebar element (aria-controls) */
  pilotControlsId?: string;
};

export default function KalshiTradingInterface({
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

  const generateReportSidebar = useRexMarketsGenerateReportOptional();
  useEffect(() => {
    if (!generateReportSidebar) return;
    generateReportSidebar.registerGenerateHandler(() => handleGenerateClick());
    return () => generateReportSidebar.registerGenerateHandler(null);
  }, [generateReportSidebar, handleGenerateClick]);

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

  const ticketMarkets = marketsForOrderBook.map((m) => ({
    clobTokenId: null,
    clobNoTokenId: null,
    marketTitle: m.marketTitle,
    ticker: m.ticker,
    conditionId: m.ticker,
    yesPrice: m.yesPrice,
    noPrice: m.noPrice,
    volume: m.volume,
  }));
  const symbolImageUrl =
    typeof marketDetails?.symbol_image_url === "string"
      ? marketDetails.symbol_image_url
      : undefined;
  const outcomeTabs =
    marketsForOrderBook.length > 2 ? (
      <OutcomeTabs
        items={marketsForOrderBook.map((m) => ({
          key: m.marketTicker,
          label: m.marketTitle,
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
          marketTitle={typeof marketTitle === "string" ? marketTitle : null}
          symbolImageUrl={symbolImageUrl}
          currentYesPrice={currentYesPrice}
          totalVolume={typeof totalVolume === "number" ? totalVolume : undefined}
          volumePrefix="$"
          seriesVolume={
            typeof marketDetails.total_series_volume === "number"
              ? marketDetails.total_series_volume
              : undefined
          }
          category={
            typeof marketDetails.category === "string" ? marketDetails.category : null
          }
          venue="kalshi"
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
              {activeMarkets.length > 0 ? (
                <PriceChart
                  markets={activeMarkets}
                  interval={selectedInterval}
                  selectedMarketTicker={selectedMarketTicker}
                />
              ) : (
                <div className="mk-chart__plot mk-chart__empty">
                  No price history available
                </div>
              )}
            </section>

            {/* Kalshi BuySellWidget (DFlow order logic) */}
            {/* line between chart and ticket: drag (or arrow keys) to resize the ticket */}
            <TicketGutter />

            <section className="mk-side" aria-label="Trade">
              <BuySellWidget
                currentYesPrice={currentYesPrice}
                currentNoPrice={currentNoPrice}
                onBuyClick={handleBuyClick}
                onSellClick={handleSellClick}
                symbolImageUrl={symbolImageUrl}
                marketTitle={
                  typeof marketTitle === "string" ? marketTitle : undefined
                }
                availableMarkets={availableMarkets}
                marketsForOrderBook={ticketMarkets}
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
              <KalshiOrderBook
                marketTicker={selectedMarketTicker}
                yesPrice={currentYesPrice}
                noPrice={currentNoPrice}
                onBuyClick={handleOrderBookBuyClick}
                selectedOutcome={selectedOrderBookOutcome}
                onDepthExpandedChange={setMobileOrderBookDepthExpanded}
              />
            </div>
          </section>

          {/* Comments / activity, and the order book beside them on desktop */}
          <div className="mk-lower">
            <section className="mk-feed" aria-label="Comments and activity">
              <FeedTabs
                tabs={[
                  {
                    key: "comments" as const,
                    label: "Comments",
                    count:
                      typeof commentsCount === "number" ? commentsCount : undefined,
                  },
                  { key: "activity" as const, label: "Latest activity" },
                ]}
                active={activeTab}
                onChange={setActiveTab}
              />
              <div className="mk-feed__body" role="tabpanel">
                {activeTab === "activity" ? (
                  <KalshiActivityFeed seriesTicker={marketDetails.series_ticker} />
                ) : (
                  <KalshiComments eventTicker={eventTicker || undefined} />
                )}
              </div>
            </section>

            <section className="mk-book mk-book--side" aria-label="Order book">
              <div className="mk-sec-head">
                <span className="rx-eyebrow">Order book</span>
              </div>
              {outcomeTabs}
              <KalshiOrderBook
                marketTicker={selectedMarketTicker}
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
        marketTitle={
          typeof marketTitle === "string" ? marketTitle : undefined
        }
        availableMarkets={availableMarkets}
        marketsForOrderBook={ticketMarkets}
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
