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
  TicketGutter,
} from "../shared/marketUi";
// Same odds chart as the Myriad page (both venues share one chart contract)
import MarketLineChart from "../MyriadTradingInterface/components/MarketLineChart";
import PredictFunOrderBook from "./components/PredictFunOrderBook";
import PredictFunBuySellWidget from "./components/PredictFunBuySellWidget";
import PredictFunActivity from "./components/PredictFunActivity";
import { usePredictFunTimeseries } from "@/hooks/usePredictFunTimeseries";
import { usePredictFunMultiTimeseries } from "@/hooks/usePredictFunMultiTimeseries";
import { usePredictFunSubMarketDetails } from "@/hooks/usePredictFunSubMarketDetails";
import {
  buildPredictFunSingleChart,
  PREDICT_FUN_CHART_INTERVALS,
  selectPredictFunTopChartMarkets,
  type PredictFunChartTimeframeKey,
} from "@/lib/predictfun/parsePriceChart";
import {
  buildPredictFunCryptoChartContext,
  isPredictFunCryptoUpDownRaw,
  resolvePredictFunNumericMarketId,
} from "@/lib/predictfun/predictFunCryptoMarket";
import { predictFunDisplayVolumeUsd } from "@/lib/predictfun/mapPredictFunMarketRow";
import { predictFunOutcomePrice01 } from "@/lib/predictfun/predictFunOutcomePrices";
import PredictFunCryptoUpDownChart from "./components/PredictFunCryptoUpDownChart";
import type { PredictFunApiMarket } from "@/lib/predictfun/mapPredictFunMarketRow";
import { extractPredictFunCategoryChildMarkets } from "@/lib/predictfun/extractCategoryChildMarkets";

export type PredictFunTradingInterfaceProps = {
  marketId: string;
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

type OutcomeOption = { index: number; title: string; price: number };

export default function PredictFunTradingInterface({
  marketId,
  marketTitle,
  totalVolume,
  onBack,
  onReportGenerated,
  userId,
  sessionSavedReportId,
  onPilotToggle,
  pilotOpen,
  pilotControlsId,
}: PredictFunTradingInterfaceProps) {
  const { marketDetails, isLoading: isLoadingDetails } = useMarketDetails(
    marketId || null,
    null,
    marketId || null
  );

  const { generateFromMarket } = useGenerateMarketReport({
    onReportGenerated: (r) => onReportGenerated?.(r),
    userId: userId || undefined,
  });

  const { authenticated, ready, login } = usePrivy();
  const { isGenerating, startedAt } = useReportGenStatus(marketId || undefined);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [chartTf, setChartTf] = useState<PredictFunChartTimeframeKey>("all");
  const [selectedSubMarketId, setSelectedSubMarketId] = useState<string | null>(null);
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(1);
  const [mobileOrderBookDepthExpanded, setMobileOrderBookDepthExpanded] = useState(true);
  const rawAny = marketDetails?.rawEventData as
    | (PredictFunApiMarket & { childMarkets?: PredictFunApiMarket[]; parentCategory?: any })
    | undefined;
  const childMarkets = useMemo(() => {
    const embedded = Array.isArray(rawAny?.childMarkets) ? rawAny!.childMarkets! : [];
    if (embedded.length > 0) return embedded;
    const parent = rawAny?.parentCategory;
    if (parent && typeof parent === "object") {
      const fromParent = extractPredictFunCategoryChildMarkets(
        parent as Record<string, unknown>
      );
      if (fromParent.length > 0) return fromParent;
    }
    return extractPredictFunCategoryChildMarkets(
      rawAny as Record<string, unknown> | null | undefined
    );
  }, [rawAny]);
  const categorySlug = String(
    rawAny?.parentCategory?.slug ?? marketDetails?.slug ?? marketId ?? ""
  ).trim();
  const activeSubMarketId = useMemo(() => {
    if (childMarkets.length === 0) return null;
    if (selectedSubMarketId && childMarkets.some((m) => String(m?.id) === selectedSubMarketId)) {
      return selectedSubMarketId;
    }
    return String(childMarkets[0]?.id ?? "");
  }, [childMarkets, selectedSubMarketId]);

  const { data: subMarketDetail } = usePredictFunSubMarketDetails(
    activeSubMarketId,
    childMarkets.length > 0 && !!activeSubMarketId
  );

  const activeMarketRaw = useMemo(() => {
    if (childMarkets.length === 0) {
      return (rawAny as PredictFunApiMarket | undefined);
    }
    const picked =
      childMarkets.find((m) => String(m?.id) === String(activeSubMarketId)) ??
      childMarkets[0];
    if (!picked) return (rawAny as PredictFunApiMarket | undefined);
    if (!subMarketDetail) return picked;
    return {
      ...picked,
      ...subMarketDetail,
      outcomes: subMarketDetail.outcomes ?? picked.outcomes,
      imageUrl: subMarketDetail.imageUrl ?? picked.imageUrl,
    };
  }, [childMarkets, rawAny, activeSubMarketId, subMarketDetail]);

  const activeSubMarketTitle = String(
    activeMarketRaw?.title ?? activeMarketRaw?.question ?? ""
  ).trim();

  const outcomes = activeMarketRaw?.outcomes ?? [];
  const listChancePct = Number((activeMarketRaw as { chancePercentage?: number })?.chancePercentage);

  const subMarketOptions = useMemo(
    () =>
      childMarkets.map((m) => ({
        id: String(m?.id ?? ""),
        title: String(m?.title ?? m?.question ?? "Outcome"),
        chance: Number((m as { chancePercentage?: number })?.chancePercentage ?? 0),
        imageUrl:
          typeof m?.imageUrl === "string" && m.imageUrl ? m.imageUrl : undefined,
      })),
    [childMarkets]
  );

  useEffect(() => {
    if (subMarketOptions.length === 0) return;
    if (!selectedSubMarketId || !subMarketOptions.some((m) => m.id === selectedSubMarketId)) {
      setSelectedSubMarketId(subMarketOptions[0].id);
    }
  }, [subMarketOptions, selectedSubMarketId]);

  const outcomeOptions = useMemo((): OutcomeOption[] => {
    const opts = outcomes.map((o) => ({
      index: typeof o.indexSet === "number" ? o.indexSet : Number(o.indexSet ?? 0),
      title: (o.name ?? "Outcome").trim(),
      price: predictFunOutcomePrice01(
        outcomes,
        typeof o.indexSet === "number" ? o.indexSet : Number(o.indexSet ?? 0),
        Number.isFinite(listChancePct) ? listChancePct : undefined
      ),
    }));
    return opts.length > 0 ? opts : [{ index: 1, title: "Yes", price: 0 }];
  }, [outcomes, listChancePct]);

  useEffect(() => {
    if (!outcomeOptions.some((o) => o.index === selectedOutcomeIndex)) {
      setSelectedOutcomeIndex(outcomeOptions[0]?.index ?? 1);
    }
  }, [outcomeOptions, selectedOutcomeIndex]);

  const yesOutcome =
    outcomeOptions.find((o) => /^(yes|up)$/i.test(o.title)) ?? outcomeOptions[0];
  const noOutcome =
    outcomeOptions.find((o) => /^(no|down)$/i.test(o.title)) ??
    outcomeOptions[1] ??
    outcomeOptions[0];
  const firstOutcomeLabel = yesOutcome?.title?.trim() || "Yes";
  const secondOutcomeLabel = noOutcome?.title?.trim() || "No";

  const isCryptoUpDownMarket = useMemo(() => {
    const parent = rawAny?.parentCategory as Record<string, unknown> | undefined;
    return (
      isPredictFunCryptoUpDownRaw(rawAny as Record<string, unknown>) ||
      isPredictFunCryptoUpDownRaw(parent) ||
      isPredictFunCryptoUpDownRaw(activeMarketRaw as Record<string, unknown>)
    );
  }, [rawAny, activeMarketRaw]);

  const cryptoChartContext = useMemo(() => {
    if (!isCryptoUpDownMarket) return null;
    const parent = rawAny?.parentCategory as Record<string, unknown> | undefined;
    return buildPredictFunCryptoChartContext(
      activeMarketRaw as Record<string, unknown>,
      parent ?? (rawAny as Record<string, unknown>)
    );
  }, [isCryptoUpDownMarket, activeMarketRaw, rawAny]);

  const topChartMarkets = useMemo(
    () => (isCryptoUpDownMarket ? [] : selectPredictFunTopChartMarkets(childMarkets)),
    [childMarkets, isCryptoUpDownMarket]
  );

  const isCategoryMultiChart = topChartMarkets.length > 0;

  const {
    chartData: multiChartData,
    marketKeys: multiMarketKeys,
    isLoading: multiChartLoading,
    isFetching: multiChartFetching,
  } = usePredictFunMultiTimeseries(topChartMarkets, chartTf, isCategoryMultiChart);

  const singleChartMarketId = useMemo(() => {
    const parent = rawAny?.parentCategory as Record<string, unknown> | undefined;
    return resolvePredictFunNumericMarketId(
      activeMarketRaw as Record<string, unknown>,
      parent,
      rawAny as Record<string, unknown>,
      { id: marketDetails?.ticker, ...((marketDetails?.rawEventData as object) ?? {}) }
    );
  }, [activeMarketRaw, rawAny, marketDetails?.ticker, marketDetails?.rawEventData]);

  const { series, isLoading: singleLoading, isFetching: singleFetching } =
    usePredictFunTimeseries(
      singleChartMarketId || null,
      chartTf,
      !isCategoryMultiChart && !!singleChartMarketId
    );

  const chartLoading = isCategoryMultiChart
    ? multiChartLoading || multiChartFetching
    : singleLoading || singleFetching;

  const { chartData, marketKeys } = useMemo(() => {
    if (isCategoryMultiChart) {
      return { chartData: multiChartData, marketKeys: multiMarketKeys };
    }
    const built = buildPredictFunSingleChart(
      series,
      chartTf,
      firstOutcomeLabel
    );
    return {
      chartData: built.chartData,
      marketKeys: built.marketKeys,
    };
  }, [
    isCategoryMultiChart,
    multiChartData,
    multiMarketKeys,
    series,
    chartTf,
    firstOutcomeLabel,
  ]);

  const displayEventTitle = marketTitle || marketDetails?.title || "";

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
    if (countdown !== null && countdown > 0 && isGenerating && marketId) {
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
  }, [countdown, isGenerating, marketId]);

  const marketForGeneration = useMemo(() => {
    if (!marketDetails || !marketId) return null;
    const activeId = String(activeMarketRaw?.id ?? marketId);
    return {
      ticker: activeId,
      title: marketTitle || marketDetails.title,
      rawEventData: marketDetails,
      image: marketDetails.symbol_image_url,
      icon: marketDetails.symbol_image_url,
    };
  }, [marketDetails, marketId, marketTitle, activeMarketRaw]);

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

  const displayVol = useMemo(() => {
    if (
      typeof totalVolume === "number" &&
      Number.isFinite(totalVolume) &&
      totalVolume > 0
    ) {
      return totalVolume;
    }
    const md = marketDetails;
    if (!md) return 0;
    if (md.total_volume > 0) return md.total_volume;
    const fromOutcomes = (md.markets ?? []).reduce(
      (sum, m) => sum + (m.volume_24h ?? m.volume ?? 0),
      0
    );
    if (fromOutcomes > 0) return fromOutcomes;
    const raw =
      (activeMarketRaw as PredictFunApiMarket | undefined) ??
      (md.rawEventData as PredictFunApiMarket | undefined);
    return predictFunDisplayVolumeUsd(raw);
  }, [totalVolume, marketDetails, activeMarketRaw]);

  if (isLoadingDetails) {
    return (
      <div className="rx-mk">
        <MarketPageLoading />
      </div>
    );
  }

  if (!marketDetails || !marketId) {
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
  const activeImageUrl =
    (typeof activeMarketRaw?.imageUrl === "string" && activeMarketRaw.imageUrl) || imageUrl;
  const tradeMarketId = String(activeMarketRaw?.id ?? marketId);

  const chartRangeLabel =
    PREDICT_FUN_CHART_INTERVALS.find((i) => i.key === chartTf)?.label ?? chartTf;

  const orderBookProps = {
    marketId: tradeMarketId,
    yesPrice: yesOutcome?.price,
    noPrice: noOutcome?.price,
    firstOutcomeLabel,
    secondOutcomeLabel,
  };

  return (
    <div className="rx-mk">
      <div className="mk-frame">
        <TradingHeader
          marketTitle={
            isCategoryMultiChart
              ? displayEventTitle
              : activeSubMarketTitle || displayEventTitle
          }
          symbolImageUrl={activeImageUrl}
          currentYesPrice={yesOutcome?.price ?? 0}
          totalVolume={displayVol}
          volumePrefix="$"
          venue="predictfun"
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
            <section
              className="mk-chart"
              aria-label={isCryptoUpDownMarket ? "Price over time" : "Odds over time"}
            >
              <div className="mk-chart__head">
                <span className="rx-eyebrow">
                  {isCryptoUpDownMarket ? "Price over time" : "Odds over time"}
                </span>
                {!isCryptoUpDownMarket ? (
                  <RangeSeg
                    ranges={PREDICT_FUN_CHART_INTERVALS.map((i) => i.label)}
                    value={chartRangeLabel}
                    onChange={(label) => {
                      const next = PREDICT_FUN_CHART_INTERVALS.find((i) => i.label === label);
                      if (next) setChartTf(next.key);
                    }}
                  />
                ) : null}
              </div>
              {isCryptoUpDownMarket && cryptoChartContext ? (
                <PredictFunCryptoUpDownChart context={cryptoChartContext} />
              ) : chartLoading ? (
                <div className="mk-chart__plot mk-chart__empty" role="status">
                  Loading chart…
                </div>
              ) : chartData.length > 0 && marketKeys.length > 0 ? (
                <MarketLineChart
                  key={`chart-${isCategoryMultiChart ? topChartMarkets.map((m) => m.id).join("-") : activeMarketRaw?.id}-${chartTf}`}
                  chartData={chartData}
                  marketKeys={marketKeys}
                />
              ) : (
                <div className="mk-chart__plot mk-chart__empty">
                  No price history for this range yet.
                </div>
              )}
            </section>

            {/* line between chart and ticket: drag (or arrow keys) to resize the ticket */}
            <TicketGutter />

            <section className="mk-side" aria-label="Trade">
              <PredictFunBuySellWidget
                marketId={tradeMarketId}
                marketRaw={activeMarketRaw}
                categorySlug={categorySlug}
                relatedMarketIds={[
                  marketId,
                  categorySlug,
                  String(rawAny?.parentCategory?.id ?? ""),
                ].filter(Boolean)}
                outcomeOptions={outcomeOptions}
                selectedOutcomeIndex={selectedOutcomeIndex}
                onOutcomeIndexChange={setSelectedOutcomeIndex}
                marketTitle={activeSubMarketTitle || marketTitle || marketDetails.title}
                symbolImageUrl={activeImageUrl}
                subMarketOptions={subMarketOptions}
                selectedSubMarketId={activeSubMarketId}
                onSubMarketIdChange={setSelectedSubMarketId}
              />
            </section>
          </div>

          {/* Phones and tablets: order book under the ticket */}
          <section className="mk-book mk-book--stack" aria-label="Order book">
            <div className="mk-sec-head">
              <span className="rx-eyebrow">Order book</span>
            </div>
            <div
              className={
                mobileOrderBookDepthExpanded ? "mk-book__fill is-open" : "mk-book__fill"
              }
            >
              <PredictFunOrderBook
                {...orderBookProps}
                onDepthExpandedChange={setMobileOrderBookDepthExpanded}
              />
            </div>
          </section>

          {/* Activity, and the order book beside it on desktop */}
          <div className="mk-lower">
            <section className="mk-feed" aria-label="Activity">
              <FeedTabs
                tabs={[{ key: "activity" as const, label: "Activity" }]}
                active="activity"
                onChange={() => {}}
              />
              <div className="mk-feed__body" role="tabpanel">
                <PredictFunActivity
                  marketId={String(activeMarketRaw?.id ?? "") || null}
                  categorySlug={childMarkets.length > 0 ? categorySlug || null : null}
                />
              </div>
            </section>

            <section className="mk-book mk-book--side" aria-label="Order book">
              <div className="mk-sec-head">
                <span className="rx-eyebrow">Order book</span>
              </div>
              <PredictFunOrderBook {...orderBookProps} showDepthToggle={false} />
            </section>
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
