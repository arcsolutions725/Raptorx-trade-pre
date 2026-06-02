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
import LimitlessPriceChart from "../LimitlessTradingInterface/components/Chart/PriceChart";
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

const POLYMARKET_ACCENT = "#ffc000";
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
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">Loading market data...</div>
      </div>
    );
  }

  if (!marketDetails || !marketId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">No market data available</div>
      </div>
    );
  }

  const imageUrl =
    typeof marketDetails.symbol_image_url === "string" && marketDetails.symbol_image_url
      ? marketDetails.symbol_image_url
      : undefined;

  return (
    <div className="flex flex-col h-full w-full bg-black text-white overflow-hidden">
      <TradingHeader
        marketTitle={
          isCategoryMultiChart
            ? displayEventTitle
            : activeSubMarketTitle || displayEventTitle
        }
        symbolImageUrl={
          (typeof activeMarketRaw?.imageUrl === "string" && activeMarketRaw.imageUrl) ||
          imageUrl
        }
        currentYesPrice={yesOutcome?.price ?? 0}
        totalVolume={displayVol}
        volumeLabel="vol"
        onBack={onBack}
        onGenerateClick={handleGenerateClick}
        isGenerating={isGenerating}
        countdown={countdown}
        hasGenerated={hasGenerated}
        ready={ready}
        canGenerate={!!marketForGeneration}
      />

      <div
        className="flex-1 overflow-y-auto rexmarkets-scroll-pane-y min-h-0 pb-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col">
          <div className="flex shrink-0 flex-col border-b border-white/10 lg:flex-row lg:items-stretch">
            <div className="flex min-w-0 w-full flex-1 flex-col lg:w-auto">
              {!isCryptoUpDownMarket ? (
                <div className="flex shrink-0 items-center justify-start border-b border-white/10 px-4 py-2">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {PREDICT_FUN_CHART_INTERVALS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setChartTf(key)}
                        className={`px-2 py-0.5 rounded text-xs transition-colors whitespace-nowrap ${
                          chartTf === key
                            ? "bg-[#ffc000] text-black font-semibold"
                            : "bg-white/10 text-white/60 hover:bg-white/20"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="relative h-[min(22rem,55vh)] min-h-[280px] w-full shrink-0 bg-[#0a0a0a] sm:h-[24rem] lg:h-[26rem] lg:min-h-[450px]">
                {isCryptoUpDownMarket && cryptoChartContext ? (
                  <PredictFunCryptoUpDownChart
                    context={cryptoChartContext}
                    className="h-full"
                  />
                ) : chartLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
                    Loading chart…
                  </div>
                ) : chartData.length > 0 && marketKeys.length > 0 ? (
                  <LimitlessPriceChart
                    key={`chart-${isCategoryMultiChart ? topChartMarkets.map((m) => m.id).join("-") : activeMarketRaw?.id}-${chartTf}`}
                    chartData={chartData}
                    marketKeys={marketKeys}
                    accentColor={POLYMARKET_ACCENT}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm px-4 text-center">
                    No price history for this range yet.
                  </div>
                )}
              </div>
            </div>

            <div className="lg:hidden w-full shrink-0 border-t border-white/10 flex flex-col">
              <PredictFunBuySellWidget
                marketId={String(activeMarketRaw?.id ?? marketId)}
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
                symbolImageUrl={
                  (typeof activeMarketRaw?.imageUrl === "string" && activeMarketRaw.imageUrl) ||
                  imageUrl
                }
                subMarketOptions={subMarketOptions}
                selectedSubMarketId={activeSubMarketId}
                onSubMarketIdChange={setSelectedSubMarketId}
              />
              <div
                className={`overflow-hidden border-t border-white/10 ${
                  mobileOrderBookDepthExpanded ? "min-h-80" : ""
                }`}
              >
                <PredictFunOrderBook
                  marketId={String(activeMarketRaw?.id ?? marketId)}
                  yesPrice={yesOutcome?.price}
                  noPrice={noOutcome?.price}
                  firstOutcomeLabel={firstOutcomeLabel}
                  secondOutcomeLabel={secondOutcomeLabel}
                  onDepthExpandedChange={setMobileOrderBookDepthExpanded}
                />
              </div>
            </div>

            <div className="hidden lg:flex w-[350px] shrink-0 flex-col min-h-0 border-l border-white/10 bg-[#0a0a0a]">
              <PredictFunBuySellWidget
                marketId={String(activeMarketRaw?.id ?? marketId)}
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
                symbolImageUrl={
                  (typeof activeMarketRaw?.imageUrl === "string" && activeMarketRaw.imageUrl) ||
                  imageUrl
                }
                subMarketOptions={subMarketOptions}
                selectedSubMarketId={activeSubMarketId}
                onSubMarketIdChange={setSelectedSubMarketId}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-col shrink-0 border-t border-white/10">
            <div
              className="flex flex-col lg:flex-row items-stretch gap-4 p-4 shrink-0"
              style={{ maxHeight: "750px" }}
            >
              <div className="flex-1 flex flex-col min-w-0 w-full lg:w-auto">
                <div className="flex items-center gap-1 border-b border-white/10 pb-2 mb-4">
                  <span className="px-4 py-2 text-sm font-semibold text-white border-b-2" style={{ borderBottomColor: POLYMARKET_ACCENT }}>
                    Activity
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto rexmarkets-scroll-pane-y">
                  <PredictFunActivity
                    marketId={String(activeMarketRaw?.id ?? "") || null}
                    categorySlug={childMarkets.length > 0 ? categorySlug || null : null}
                  />
                </div>
              </div>

              <div className="hidden lg:flex w-100 shrink-0 border-l border-white/10 flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <PredictFunOrderBook
                    marketId={String(activeMarketRaw?.id ?? marketId)}
                    yesPrice={yesOutcome?.price}
                    noPrice={noOutcome?.price}
                    firstOutcomeLabel={firstOutcomeLabel}
                    secondOutcomeLabel={secondOutcomeLabel}
                    showDepthToggle={false}
                  />
                </div>
              </div>
            </div>
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
