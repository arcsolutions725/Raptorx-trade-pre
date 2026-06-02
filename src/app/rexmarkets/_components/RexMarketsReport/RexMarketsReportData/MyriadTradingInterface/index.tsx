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
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">Loading market data...</div>
      </div>
    );
  }

  if (!marketDetails || !marketSlug) {
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
        marketTitle={marketTitle || marketDetails.title}
        symbolImageUrl={imageUrl}
        currentYesPrice={Number.isFinite(headlinePrice) ? headlinePrice : 0}
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
          <div className="flex shrink-0 flex-col border-b border-white/10 lg:flex-row lg:items-start">
            <div className="flex min-w-0 w-full flex-1 flex-col lg:w-auto">
              <div className="flex shrink-0 items-center justify-start border-b border-white/10 px-4 py-2">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {MYRIAD_CHART_INTERVALS.map(({ label, api }) => (
                    <button
                      key={api}
                      type="button"
                      onClick={() => setChartTf(api)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors whitespace-nowrap ${
                        chartTf === api
                          ? "bg-[#ffc000] text-black font-semibold"
                          : "bg-white/10 text-white/60 hover:bg-white/20"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative h-[min(22rem,55vh)] min-h-[280px] w-full shrink-0 bg-[#0a0a0a] sm:h-[24rem] lg:h-[26rem]">
                {chartData.length > 0 && marketKeys.length > 0 ? (
                  <LimitlessPriceChart
                    chartData={chartData}
                    marketKeys={marketKeys}
                    accentColor="#ffc000"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm px-4 text-center">
                    No price history for this range yet.
                  </div>
                )}
              </div>
            </div>

            <div className="lg:hidden w-full shrink-0 border-t border-white/10 flex flex-col">
              <div className="w-full self-start">
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
              </div>
              {isOrderBookMarket ? (
                <div
                  className={`overflow-hidden border-t border-white/10 ${
                    mobileOrderBookDepthExpanded ? "min-h-80" : ""
                  }`}
                >
                  <MyriadOrderBook
                    marketId={resolvedTradeMarketId || null}
                    networkId={myriadNet || null}
                    orderBookEnabled
                    outcomeOptions={outcomeOptions}
                    selectedOutcomeIndex={selectedOutcomeIndex}
                    onSelectOutcome={setSelectedOutcomeIndex}
                    onDepthExpandedChange={setMobileOrderBookDepthExpanded}
                  />
                </div>
              ) : null}
            </div>

            <div className="hidden lg:flex w-87.5 shrink-0 self-start max-h-full flex-col border-l border-white/10 bg-[#0a0a0a] overflow-y-auto rexmarkets-scroll-pane-y">
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
            </div>
          </div>

          <div className="flex min-h-0 flex-col shrink-0 border-t border-white/10">
            <div
              className="flex flex-col lg:flex-row items-stretch gap-4 p-4 shrink-0"
              style={{ maxHeight: "750px" }}
            >
              <div className="flex-1 flex flex-col min-w-0 w-full lg:w-auto">
                <div className="flex items-center gap-1 border-b border-white/10 pb-2 mb-4">
                  {(
                    [
                      { id: "holders" as const, label: "Top holders" },
                      { id: "activity" as const, label: "Activity" },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBottomTab(id)}
                      className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${
                        bottomTab === id ? "text-white border-b-2" : "text-white/60 hover:text-white/80"
                      }`}
                      style={bottomTab === id ? { borderBottomColor: "#ffc000" } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto rexmarkets-scroll-pane-y">
                  {bottomTab === "holders" ? (
                    <MyriadTopHolders slug={marketSlug} />
                  ) : (
                    <MyriadActivity slug={marketSlug} />
                  )}
                </div>
              </div>

              {isOrderBookMarket ? (
                <div className="hidden lg:flex w-100 shrink-0 border-l border-white/10 flex-col min-h-0">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <MyriadOrderBook
                      marketId={resolvedTradeMarketId || null}
                      networkId={myriadNet || null}
                      orderBookEnabled
                      outcomeOptions={outcomeOptions}
                      selectedOutcomeIndex={selectedOutcomeIndex}
                      onSelectOutcome={setSelectedOutcomeIndex}
                      showDepthToggle={false}
                    />
                  </div>
                </div>
              ) : null}
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
