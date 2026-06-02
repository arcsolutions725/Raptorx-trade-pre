"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Image from "next/image";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import { useReports } from "@/hooks/useReports";
import ChatSidebar from "@/app/(rexscreener)/_components/rexchat/ChatSidebar";

import AIGeneratedMarketsReport from "./AIGeneratedMarketsReport";
import MarketsData from "./MarketsData";
import { Minimize, ArrowLeft, X } from "lucide-react";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useDataSource } from "@/contexts/DataSourceContext";
import { PREDICT_FUN_LOGO_SRC } from "@/lib/predictfun/assets";

type PilotPlatform = "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun";

function pilotPlatformFromPathAndListing(
  pathname: string | null,
  listingSource: PilotPlatform | "all",
): PilotPlatform | null {
  const p = pathname || "";
  if (p.startsWith("/rexmarkets/polymarket/")) return "polymarket";
  if (p.startsWith("/rexmarkets/kalshi/")) return "kalshi";
  if (p.startsWith("/rexmarkets/limitless/")) return "limitless";
  if (p.startsWith("/rexmarkets/myriad/")) return "myriad";
  if (p.startsWith("/rexmarkets/predict-fun/")) return "predictfun";
  if (p === "/rexmarkets") {
    if (listingSource === "all") return null;
    return listingSource;
  }
  return null;
}

/** Matches Rex Predictions header source tabs: compact pill with icon + label. Hidden when listing "All" tab (no platform). */
function RexPilotSourceMiniTab({ platform }: { platform: PilotPlatform }) {
  const shell =
    "inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-[8px] px-1.5 text-[11px] font-semibold leading-none";
  if (platform === "kalshi") {
    return (
      <span
        className={clsx(shell, "bg-[#17cb91] text-black")}
        aria-label="Kalshi"
      >
        <span className="text-xs font-bold leading-none">K</span>
        <span className="whitespace-nowrap">Kalshi</span>
      </span>
    );
  }
  if (platform === "polymarket") {
    return (
      <span
        className={clsx(shell, "bg-[#2C59F7] text-white")}
        aria-label="Polymarket"
      >
        <Image
          src="/images/polymarket.png"
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 shrink-0 object-contain"
        />
        <span className="whitespace-nowrap">Polymarket</span>
      </span>
    );
  }
  if (platform === "myriad") {
    return (
      <span className={clsx(shell, "bg-black text-white")} aria-label="Myriad">
        <Image
          src="/images/myriad.webp"
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 shrink-0 object-contain"
        />
        <span className="whitespace-nowrap">Myriad</span>
      </span>
    );
  }
  if (platform === "predictfun") {
    return (
      <span
        className={clsx(shell, "bg-[#A855F7] text-white")}
        aria-label="Predict.fun"
      >
        <Image
          src={PREDICT_FUN_LOGO_SRC}
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 shrink-0 object-contain"
        />
        <span className="whitespace-nowrap">Predict.fun</span>
      </span>
    );
  }
  return (
    <span
      className={clsx(shell, "bg-[#c3ff01] text-black")}
      aria-label="Limitless"
    >
      <Image
        src="/images/limitless-logo-new.webp"
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-3.5 max-w-[85%] shrink-0 object-contain"
      />
      <span className="whitespace-nowrap">Limitless</span>
    </span>
  );
}

type RexMarketsReportDataProps = {
  generatedReport?: MarketReport | null;
  userId?: string | null;
  selectedReportId?: string | null;
  onReportSelect?: (reportId: string | null) => void;
  selectedMarketTicker?: string | null;
  selectedMarketTitle?: string | null;
  selectedMarketVolume?: number;
  selectedMarketEventId?: string | null;
  onClose?: () => void;
  onClearSessionReport?: () => void;
};

export default function RexMarketsReportData({
  generatedReport,
  userId,
  selectedReportId: externalSelectedReportId,
  onReportSelect,
  selectedMarketTicker,
  selectedMarketTitle,
  selectedMarketVolume,
  selectedMarketEventId,
  onClose,
  onClearSessionReport,
}: RexMarketsReportDataProps) {
  const [aiReportMinimized, setAiReportMinimized] = useState(true);
  const [marketsDataMinimized, setMarketsDataMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [internalSelectedReportId, setInternalSelectedReportId] = useState<
    string | null
  >(generatedReport?.id || null);

  // Use external selectedReportId if provided, otherwise use internal state
  const selectedReportId = useMemo(
    () =>
      externalSelectedReportId !== undefined
        ? externalSelectedReportId
        : internalSelectedReportId,
    [externalSelectedReportId, internalSelectedReportId]
  );

  // Update selectedReportId and expand AI report when generatedReport changes
  useEffect(() => {
    if (generatedReport?.id) {
      if (onReportSelect) {
        onReportSelect(generatedReport.id);
      } else {
        setInternalSelectedReportId(generatedReport.id);
      }
      setAiReportMinimized(false);
    }
  }, [generatedReport?.id, onReportSelect]);

  // Expand AI report section when a report is selected from chat history
  useEffect(() => {
    if (selectedReportId) {
      setAiReportMinimized(false);
    }
  }, [selectedReportId]);

  // Prevent both sections from being minimized simultaneously
  useEffect(() => {
    if (aiReportMinimized && marketsDataMinimized) {
      setMarketsDataMinimized(false);
    }
  }, [aiReportMinimized, marketsDataMinimized]);

  // Memoized event handlers
  const handleExpandMarketsData = useCallback(() => {
    setMarketsDataMinimized(false);
  }, []);

  const handleMinimizeMarketsData = useCallback(() => {
    setMarketsDataMinimized(true);
  }, []);

  const handleExpandAiReport = useCallback(() => {
    setAiReportMinimized(false);
  }, []);

  const handleMinimizeAiReport = useCallback(() => {
    setAiReportMinimized(true);
  }, []);

  const handleBackToEmptyState = useCallback(() => {
    if (onReportSelect) {
      onReportSelect(null);
    } else {
      setInternalSelectedReportId(null);
    }
    onClearSessionReport?.();
  }, [onReportSelect, onClearSessionReport]);

  /** Top bar (Rex Pilot + source tab) stays visible when News Intelligence is minimized; only hide with Markets Data minimized. */
  const showMarketsDataHeader = !marketsDataMinimized;

  const { data: serverReports = [] } = useReports(
    userId || undefined,
    "market"
  );

  const pathname = usePathname();
  const { dataSource: listingDataSource } = useDataSource();
  const pilotPlatform = useMemo(
    () => pilotPlatformFromPathAndListing(pathname, listingDataSource),
    [pathname, listingDataSource],
  );
  const isLimitlessRoute = pathname?.startsWith("/rexmarkets/limitless/");
  const isMyriadRoute = pathname?.startsWith("/rexmarkets/myriad/");
  const isPredictFunRoute = pathname?.startsWith("/rexmarkets/predict-fun/");
  const { marketDetails } = useMarketDetails(
    selectedMarketTicker || null,
    selectedMarketEventId || null,
    isLimitlessRoute || isMyriadRoute || isPredictFunRoute
      ? selectedMarketTicker ?? null
      : undefined,
  );
  const selectedMarketImageUrl = marketDetails?.symbol_image_url ?? null;

  const { isGenerating: marketReportGenActive } = useReportGenStatus(
    selectedMarketTicker || undefined,
  );

  // Market detail routes pass a ticker once details load; show Rex Pilot + News Intelligence stacked like the design.
  useEffect(() => {
    if (!selectedMarketTicker?.trim()) return;
    setAiReportMinimized(false);
  }, [selectedMarketTicker]);

  useEffect(() => {
    if (!marketReportGenActive || !selectedMarketTicker?.trim()) return;
    setAiReportMinimized(false);
  }, [marketReportGenActive, selectedMarketTicker]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{
      maxHeight: '100dvh', // Use dynamic viewport height for mobile
    }}>
      {/* Close when Markets Data is collapsed (no header row with close). */}
      {marketsDataMinimized && onClose && (
        <div className="absolute top-2 right-2 z-50">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-[40px] h-[40px] bg-[#3C3C3C] rounded-[8px] cursor-pointer hover:bg-[#4C4C4C] transition-colors"
            aria-label="Close sidebar"
          >
            <X width={18} height={18} />
          </button>
        </div>
      )}

      {/* Chat Sidebar — z above header controls (z-51/z-60) so history covers close/back/minimize */}
      <div
        className={`absolute top-0 left-0 h-full z-[70] transform transition-transform duration-300 ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full relative">
          {userId && (
            <ChatSidebar
              userId={userId}
              currentReportId={selectedReportId || undefined}
              onSelectReport={(rid: string) => {
                if (onReportSelect) {
                  onReportSelect(rid);
                } else {
                  setInternalSelectedReportId(rid);
                }
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
              reportType="market"
            />
          )}
        </div>
      </div>
      {showHistory && (
        <div
          className="absolute inset-0 z-[65] bg-black/50"
          onClick={() => setShowHistory(false)}
          aria-hidden="true"
        />
      )}
      {/* MarketsData Section - Top */}
      {marketsDataMinimized && (
        <div className="w-full flex items-center justify-center py-3 z-30 border-b border-[#ffc000]">
          <button
            onClick={handleExpandMarketsData}
            className="flex items-center gap-3 px-4 py-1 cursor-pointer"
            aria-label="Expand Markets Data"
            title="Expand Markets Data"
          >
            <p className="text-white text-base sm:text-lg">
              Expand <span className="text-[#ffc000]">Rex Markets.</span>
            </p>
          </button>
        </div>
      )}
      <div
        className={clsx(
          "flex-1 overflow-hidden transition-all duration-300 ease-in-out flex flex-col",
          marketsDataMinimized ? "max-h-0 opacity-0" : "flex-1 opacity-100"
        )}
      >
        <div
          className={clsx(
            "relative flex-1 flex flex-col min-h-0",
            aiReportMinimized
              ? "justify-center items-center"
              : "overflow-hidden"
          )}
        >
          {showMarketsDataHeader && (
            <div className="w-full flex justify-between items-center bg-[#141414] px-5 py-3">
              <div className="flex items-center gap-2">
                {onClose && (
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center gap-1 z-51 w-[40px] h-[40px] bg-[#3C3C3C] rounded-[8px] cursor-pointer text-[14px]"
                    aria-label="Close sidebar"
                  >
                    <X width={18} height={18} />
                  </button>
                )}
                <div className="flex min-w-0 flex-col items-start">
                  <div className="flex flex-wrap items-center gap-2">
                    <h6 className="!text-[12px] !font-normal text-[#F2F2F2]">
                      Rex Pilot
                    </h6>
                    {pilotPlatform ? (
                      <RexPilotSourceMiniTab platform={pilotPlatform} />
                    ) : null}
                  </div>
                  <p className="text-[12px] font-normal text-[#7A7A7A]">
                    Your AI Pilot for everything crypto
                  </p>
                </div>
              </div>

              {!aiReportMinimized && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMinimizeMarketsData}
                    className="flex items-center justify-center gap-1 px-2 py-1 z-60 rounded cursor-pointer text-[14px] text-white"
                    aria-label="Minimize Markets Data"
                  >
                    <Minimize width={18} height={18} />
                    <span className="text-white">minimize</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <div
            className={clsx(
              "px-4 pb-4 pt-4 w-full h-[calc(100%-64px)] sm:h-[calc(100%-64px)] md:h-[calc(100%-64px)] overflow-hidden",
              aiReportMinimized &&
                !selectedMarketTicker &&
                "flex items-center justify-center"
            )}
            style={{
              maxHeight: 'calc(100dvh - 64px)', // Use dynamic viewport height for mobile
            }}
          >
            {aiReportMinimized &&
            !marketsDataMinimized &&
            !selectedReportId &&
            !selectedMarketTicker ? (
              <div className="relative h-full min-h-0 w-full">
                <div className="flex h-full min-h-0 w-full flex-col items-center justify-center px-6 py-3 sm:px-10">
                  <header className="flex w-full max-w-[420px] flex-col items-center justify-center text-center">
                    <div className="flex items-end">
                      <Image
                        src="/images/rexmarket.png"
                        alt="Rex Markets Logo"
                        width={200}
                        height={200}
                        priority
                        className="max-h-[160px] w-auto sm:max-h-[200px]"
                      />
                    </div>
                    <div className="mt-6 flex flex-col gap-2 sm:mt-8">
                      <h1 className="w-full !font-normal !text-[14px] text-white sm:!text-[18px]">
                        Conversational Intelligence for Event-Traders.
                      </h1>
                      <h4 className="w-full !text-[12px] !font-normal text-[#F2F2F2] sm:!text-[14px]">
                        Click <span className="text-[#00B050]">Generate</span>{" "}
                        to get Intelligence Reports for any prediction event!
                      </h4>
                    </div>
                    {userId ? (
                      <div className="mt-6 flex w-full justify-center sm:mt-8">
                        <button
                          type="button"
                          onClick={() => setShowHistory(true)}
                          className="pointer-events-auto flex min-h-[44px] cursor-pointer items-center justify-center border-0 bg-transparent px-1 py-1 transition hover:opacity-90 hover:scale-[1.03] sm:min-h-[50px]"
                          aria-label={
                            serverReports.length > 0
                              ? `View Report History (${serverReports.length})`
                              : "View Report History"
                          }
                        >
                          <Image
                            src="/images/history.webp"
                            alt=""
                            width={180}
                            height={96}
                            className="h-[36px] w-auto max-w-[min(100%,108px)] object-contain sm:h-[42px] sm:max-w-[min(100%,126px)]"
                          />
                        </button>
                      </div>
                    ) : null}
                  </header>
                </div>
              </div>
            ) : (
              <>
                <MarketsData
                  eventTicker={selectedMarketTicker}
                  marketTitle={selectedMarketTitle}
                  totalVolume={selectedMarketVolume}
                  eventId={selectedMarketEventId}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Intelligence Report Section - Bottom */}
      {aiReportMinimized && (
        <div className="w-full border-t border-[#ffc000] flex items-center justify-center py-[9.5px] z-30">
          <button
            onClick={handleExpandAiReport}
            className="flex items-center gap-3 px-4 py-1 cursor-pointer"
            aria-label="Expand AI Generated Markets Report"
            title="Expand AI Generated Markets Report"
          >
            <p className="text-white text-base sm:text-lg">
              <span className="text-[#ffc000]">News Intelligence </span>
              Report.
            </p>
          </button>
        </div>
      )}
      <div
        className={clsx(
          "flex-1 border-t border-[#ffc000] overflow-hidden transition-all duration-300 ease-in-out flex flex-col",
          aiReportMinimized ? "max-h-0 opacity-0" : "flex-1 opacity-100"
        )}
      >
        <div className="relative flex-1 flex flex-col min-h-0">
          {!aiReportMinimized && (
            <div className="w-full flex justify-between items-center bg-[#141414] px-5 py-3">
              <div className="flex items-center gap-2 justify-center">
                {!!selectedReportId && (
                  <button
                    onClick={handleBackToEmptyState}
                    className="flex items-center justify-center gap-1 z-51 w-[40px] h-[40px] bg-[#3C3C3C] rounded-[8px] cursor-pointer text-[14px]"
                    aria-label="Back to Generate and empty state"
                  >
                    <ArrowLeft width={18} height={18} />
                  </button>
                )}
                <div className="flex flex-col items-start ">
                  <h6 className="!text-[12px] !font-normal text-[#F2F2F2]">
                    News Intelligence Report
                  </h6>
                  <p className="text-[12px] font-normal text-[#7A7A7A]">
                    Real-time conversational news context, by your side
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {userId ? (
                  <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="pointer-events-auto flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition hover:opacity-90 hover:scale-[1.03]"
                    aria-label={
                      serverReports.length > 0
                        ? `View Report History (${serverReports.length})`
                        : "View Report History"
                    }
                  >
                    <Image
                      src="/images/history.webp"
                      alt=""
                      width={140}
                      height={80}
                      className="h-[28px] w-auto max-w-[76px] object-contain sm:h-[30px] sm:max-w-[88px]"
                    />
                  </button>
                ) : null}
                <button
                  onClick={handleMinimizeAiReport}
                  className="flex items-center justify-center gap-1 px-2 py-1 z-60 rounded cursor-pointer text-[14px] text-white"
                  aria-label="Minimize AI Generated Markets Report"
                >
                  <Minimize width={18} height={18} />
                  <span className="text-white">minimize</span>
                </button>
              </div>
            </div>
          )}
          <div
            className="relative h-[calc(100%-60px)] min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-2 pt-2 sm:pb-3 sm:pt-3"
            style={{
              maxHeight: "calc(100dvh - 60px)",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
            }}
          >
            <AIGeneratedMarketsReport
              generatedReport={generatedReport}
              userId={userId}
              selectedReportId={selectedReportId}
              reportGenLookupKey={selectedMarketTicker ?? null}
              selectedMarketTitle={selectedMarketTitle ?? null}
              selectedMarketImageUrl={selectedMarketImageUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
