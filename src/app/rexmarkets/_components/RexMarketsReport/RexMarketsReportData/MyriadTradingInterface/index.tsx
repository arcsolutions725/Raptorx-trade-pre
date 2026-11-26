"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useGenerateMarketReport } from "@/hooks/useGenerateMarketReport";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { usePrivy } from "@privy-io/react-auth";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import { useRexMarketsGenerateReportOptional } from "@/app/rexmarkets/_components/RexMarketsGenerateReportContext";
import TradingHeader from "../PolymarketTradingInterface/components/Header/TradingHeader";
import {
  FeedTabs,
  MarketPageLoading,
  MarketPageMessage,
  RangeSeg,
} from "../shared/marketUi";
import MarketLineChart from "./components/MarketLineChart";
import MyriadOrderBook from "./components/MyriadOrderBook";
import MyriadBuySellWidget from "./components/MyriadBuySellWidget";
import MyriadTopHolders from "./components/MyriadTopHolders";
import MyriadActivity from "./components/MyriadActivity";
import {
  buildMyriadMultiChart,
  MYRIAD_CHART_INTERVALS,
  type ChartTimeframeKey,
} from "@/lib/myriad/parsePriceChart";
import type {
  MyriadMarketDetailApi,
  MyriadOutcomeDetail,
} from "@/lib/myriad/mapMyriadMarketDetails";
import { MYRIAD_BSC_USD1 } from "@/hooks/useMyriadBscBalances";

export type MyriadTradingInterfaceProps = {
  marketSlug: string;
  marketTitle?: string | null;
  totalVolume?: number;
  onBack?: () => void;
  onReportGenerated?: (report: MarketReport) => void;
  userId?: string | null;
  sessionSavedReportId?: string | null;
  /** Claw AI 5.0 button in the market head: opens / closes the Rex Pilot sidebar */
  onPilotToggle?: () => void;
  pilotOpen?: boolean;
  /** id of the Rex Pilot sidebar element (aria-controls) */
  pilotControlsId?: string;
};

/** Chart / selector row; `ethMarketId` when outcome maps to a distinct on-chain OB market (e.g. NegRisk). */
type MyriadOutcomeOption = {
  index: number;
  title: string;
  price: number;
  ethMarketId?: number;
};

export default function MyriadTradingInterface({
  marketSlug,
  marketTitle,
  totalVolume,
  onBack,
  onReportGenerated,
  userId,
  sessionSavedReportId,
  onPilotToggle,
  pilotOpen,
  pilotControlsId,
}: MyriadTradingInterfaceProps) {
  const { marketDetails, isLoading: isLoadingDetails } = useMarketDetails(
    marketSlug || null,
    null,
    marketSlug || null
  );

  const { generateFromMarket } = useGenerateMarketReport({
    onReportGenerated: (r) => onReportGenerated?.(r),
    userId: userId || undefined,
  });

  const { authenticated, ready, login } = usePrivy();
  const { isGenerating, startedAt } = useReportGenStatus(marketSlug || undefined);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [chartTf, setChartTf] = useState<ChartTimeframeKey>("7d");
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(0);
  const [mobileOrderBookDepthExpanded, setMobileOrderBookDepthExpanded] = useState(true);
  const [bottomTab, setBottomTab] = useState<"holders" | "activity">("holders");

  useEffect(() => {
    if (!sessionSavedReportId) setHasGenerated(false);
  }, [sessionSavedReportId]);

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

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdown !== null && countdown > 0 && isGenerating && marketSlug) {
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
  }, [countdown, isGenerating, marketSlug]);

  const raw = marketDetails?.rawEventData as MyriadMarketDetailApi | undefined;
  const myriadId = marketDetails?.myriadMarketId ?? 0;
  const myriadNet = marketDetails?.myriadNetworkId ?? 0;
  const isOrderBookMarket = marketDetails?.myriadIsOrderBook === true;
  const outcomes = raw?.outcomes ?? [];

  const outcomeOptions = useMemo((): MyriadOutcomeOption[] => {
    const opts: MyriadOutcomeOption[] = outcomes.map((o) => ({
      index: typeof o.id === "number" ? o.id : Number(o.id),
      title: (o.title ?? `Outcome ${o.id}`).trim(),
      price: Number(o.price ?? 0),
      ethMarketId:
        typeof o.ethMarketId === "number" && o.ethMarketId > 0
          ? o.ethMarketId
          : undefined,
    }));
    return opts.length > 0 ? opts : [{ index: 0, title: "Outcome", price: 0 }];
  }, [outcomes]);

  const selectedOutcomeMeta = useMemo(
    () => outcomeOptions.find((o) => o.index === selectedOutcomeIndex),
    [outcomeOptions, selectedOutcomeIndex]
  );

  /** Binary CLOB: root `id` is the on-chain market for both outcomes; use per-outcome id only when it differs (NegRisk). */
  const resolvedTradeMarketId = useMemo(() => {
    const root = myriadId;
    const eth = selectedOutcomeMeta?.ethMarketId;
    if (typeof eth === "number" && eth > 0 && eth !== root) return eth;
    return root;
  }, [selectedOutcomeMeta?.ethMarketId, myriadId]);

  useEffect(() => {
    if (outcomeOptions.length === 0) return;
    if (!outcomeOptions.some((o) => o.index === selectedOutcomeIndex)) {
      setSelectedOutcomeIndex(outcomeOptions[0].index);
    }
  }, [outcomeOptions, selectedOutcomeIndex]);

  const { chartData, marketKeys } = useMemo(
    () => buildMyriadMultiChart(outcomes as MyriadOutcomeDetail[], chartTf),
    [outcomes, chartTf]
  );

  const headlinePrice = outcomeOptions[0]?.price ?? 0;

  /**
   * ERC20 the AMM / approval flow must use — **must match** GET /markets `token.address` so
   * `POST /markets/quote` calldata and `approve` target the same contract. Forcing USD1 when
   * the market settles in USDT (or another stable) caused trades to revert with “insufficient balance”.
   * Fall back to canonical USD1 only when the API omits `token.address`.
   */
  const collateralTokenAddress = useMemo(() => {
    const addr = raw?.token?.address;
    const parsed = typeof addr === "string" && addr.startsWith("0x") ? addr.trim() : undefined;
    if (parsed) return parsed;
    const symRaw = raw?.token?.symbol;
    const sym = typeof symRaw === "string" ? symRaw.trim().toUpperCase() : "";
    if (sym === "USD1" || sym === "PTS" || sym === "") {
      return MYRIAD_BSC_USD1;
    }
    return undefined;
  }, [raw?.token?.address, raw?.token?.symbol]);

  const collateralDecimals = useMemo(() => {
    const d = raw?.token?.decimals;
    return typeof d === "number" && Number.isFinite(d) ? Math.floor(d) : 18;
  }, [raw?.token?.decimals]);

  const collateralSymbol = useMemo(() => {
    const s = raw?.token?.symbol;
    return typeof s === "string" && s.trim() ? s.trim() : undefined;
  }, [raw?.token?.symbol]);

  const marketForGeneration = useMemo(() => {
    if (!marketDetails || !marketSlug) return null;
    const title = marketTitle || marketDetails.title;
    return {
      ticker: marketSlug,
      title,
      rawEventData: marketDetails,
      image: marketDetails.symbol_image_url,
      icon: marketDetails.symbol_image_url,
    };
  }, [marketDetails, marketSlug, marketTitle]);

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
      if (err?.status === 402) setShowPaywall(true);
      setCountdown(null);
      setHasGenerated(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [authenticated, login, marketForGeneration, ready, generateFromMarket]);

  const genCtx = useRexMarketsGenerateReportOptional();
  useEffect(() => {
    if (!genCtx) return;
    genCtx.registerGenerateHandler(() => handleGenerateClick());
    return () => genCtx.registerGenerateHandler(null);
  }, [genCtx, handleGenerateClick]);

  const displayVol =
    typeof totalVolume === "number" && Number.isFinite(totalVolume)
      ? totalVolume
      : Number(marketDetails?.total_volume ?? 0);

  if (isLoadingDetails) {
    return (
      <div className="rx-mk">
        <MarketPageLoading />
      </div>
    );
  }

  if (!marketDetails || !marketSlug) {
    return (
      <div className="rx-mk">
        <MarketPageMessage title="No market data available" />
      </div>
    );
  }

  const imageUrl =
    typeof marketDetails.symbol_image_url === "string" && marketDetails.symbol_image_url
      ? marketDetails.symbol_image_url
      : undefined;

  // Breadcrumb category: the market's first topic ("Myriad" is the mapper's fallback, not a topic)
  const category =
    typeof marketDetails.category === "string" &&
    marketDetails.category.trim() &&
    marketDetails.category !== "Myriad"
      ? marketDetails.category
      : null;

  const chartRangeLabel =
    MYRIAD_CHART_INTERVALS.find((i) => i.api === chartTf)?.label ?? chartTf;

  const orderBookProps = {
    marketId: resolvedTradeMarketId || null,
    networkId: myriadNet || null,
    orderBookEnabled: true,
    outcomeOptions,
    selectedOutcomeIndex,
    onSelectOutcome: setSelectedOutcomeIndex,
  };

  return (
    <div className="rx-mk">
      <div className="mk-frame">
        <TradingHeader
          marketTitle={marketTitle || marketDetails.title}
          symbolImageUrl={imageUrl}
          currentYesPrice={Number.isFinite(headlinePrice) ? headlinePrice : 0}
          totalVolume={displayVol}
          volumeLabel={collateralSymbol ?? "vol"}
          category={category}
          venue="myriad"
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
                  ranges={MYRIAD_CHART_INTERVALS.map((i) => i.label)}
                  value={chartRangeLabel}
                  onChange={(label) => {
                    const next = MYRIAD_CHART_INTERVALS.find((i) => i.label === label);
                    if (next) setChartTf(next.api);
                  }}
                />
              </div>
              {chartData.length > 0 && marketKeys.length > 0 ? (
                <MarketLineChart chartData={chartData} marketKeys={marketKeys} />
              ) : (
                <div className="mk-chart__plot mk-chart__empty">
                  No price history for this range yet.
                </div>
              )}
            </section>

            <section className="mk-side" aria-label="Trade">
              <MyriadBuySellWidget
                isOrderBook={isOrderBookMarket}
                tradeMarketId={resolvedTradeMarketId}
                networkId={myriadNet}
                rootMyriadMarketId={myriadId > 0 ? myriadId : undefined}
                collateralTokenAddress={collateralTokenAddress}
                collateralDecimals={collateralDecimals}
                collateralSymbol={collateralSymbol}
                outcomeOptions={outcomeOptions}
                selectedOutcomeIndex={selectedOutcomeIndex}
                onOutcomeIndexChange={setSelectedOutcomeIndex}
                marketTitle={marketTitle || marketDetails.title}
                marketSlug={marketSlug}
                symbolImageUrl={imageUrl}
              />
            </section>
          </div>

          {/* Phones and tablets: order book under the ticket (order-book markets only) */}
          {isOrderBookMarket ? (
            <section className="mk-book mk-book--stack" aria-label="Order book">
              <div className="mk-sec-head">
                <span className="rx-eyebrow">Order book</span>
              </div>
              <div
                className={
                  mobileOrderBookDepthExpanded ? "mk-book__fill is-open" : "mk-book__fill"
                }
              >
                <MyriadOrderBook
                  {...orderBookProps}
                  onDepthExpandedChange={setMobileOrderBookDepthExpanded}
                />
              </div>
            </section>
          ) : null}

          {/* Top holders / activity, and the order book beside them on desktop */}
          <div className="mk-lower">
            <section className="mk-feed" aria-label="Top holders and activity">
              <FeedTabs
                tabs={[
                  { key: "holders" as const, label: "Top holders" },
                  { key: "activity" as const, label: "Activity" },
                ]}
                active={bottomTab}
                onChange={setBottomTab}
              />
              <div className="mk-feed__body" role="tabpanel">
                {bottomTab === "holders" ? (
                  <MyriadTopHolders slug={marketSlug} />
                ) : (
                  <MyriadActivity slug={marketSlug} />
                )}
              </div>
            </section>

            {isOrderBookMarket ? (
              <section className="mk-book mk-book--side" aria-label="Order book">
                <div className="mk-sec-head">
                  <span className="rx-eyebrow">Order book</span>
                </div>
                <MyriadOrderBook {...orderBookProps} showDepthToggle={false} />
              </section>
            ) : null}
          </div>
        </div>
      </div>

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context="rexmarkets"
        paymentMetadata={userId ? { userId } : undefined}
      />
    </div>
  );
}
