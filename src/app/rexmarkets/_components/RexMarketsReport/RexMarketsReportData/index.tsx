"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import clsx from "clsx";
import Image from "next/image";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useReports } from "@/hooks/useReports";
import ChatSidebar from "@/components/rexscreener/rexchat/ChatSidebar";

import AIGeneratedMarketsReport from "./AIGeneratedMarketsReport";
import MarketsData from "./MarketsData";
import { Minimize, ArrowLeft, X } from "lucide-react";

type RexMarketsReportDataProps = {
  generatedReport?: MarketReport | null;
  userId?: string | null;
  selectedReportId?: string | null;
  onReportSelect?: (reportId: string) => void;
  selectedMarketTicker?: string | null;
  selectedMarketTitle?: string | null;
  selectedMarketVolume?: number;
  selectedMarketEventId?: string | null;
  onClose?: () => void;
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
      onReportSelect("");
    } else {
      setInternalSelectedReportId(null);
    }
  }, [onReportSelect]);

  const showMarketsDataMinimizeButton =
    !marketsDataMinimized && !aiReportMinimized;

  const { data: serverReports = [] } = useReports(
    userId || undefined,
    "market"
  );

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{
      maxHeight: '100dvh', // Use dynamic viewport height for mobile
    }}>
      {/* Close button - always visible */}
      {(aiReportMinimized || marketsDataMinimized) && onClose && (
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

      {/* Chat Sidebar */}
      <div
        className={`absolute top-0 left-0 h-full z-30 transform transition-transform duration-300 ${
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
          className="absolute inset-0 bg-black/50 z-25"
          onClick={() => setShowHistory(false)}
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
          {showMarketsDataMinimizeButton && (
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
                <div className="flex flex-col items-start ">
                  <h6 className="!text-[12px] !font-normal text-[#F2F2F2]">
                    Rex Pilot
                  </h6>
                  <p className="text-[12px] font-normal text-[#7A7A7A]">
                    Your AI Pilot for everything crypto
                  </p>
                </div>
              </div>

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
              <div className="flex flex-col items-center justify-center h-full gap-10 px-10">
                <header className="flex flex-col items-center justify-center">
                  <div className="flex items-end">
                    <Image
                      src="/images/rexmarket.png"
                      alt="Rex Markets Logo"
                      width={200}
                      height={200}
                      priority
                    />
                  </div>
                  <div className="flex flex-col gap-10 items-center justify-center">
                    <div className="flex flex-col gap-2">
                      <h1 className="max-w-[600px] w-full !font-normal !text-[14px] sm:!text-[18px] text-center text-white">
                        Conversational Intelligence for Event-Traders.
                      </h1>
                      <h4 className="max-w-[600px] w-full !text-[12px] sm:!text-[14px] !font-normal text-[#F2F2F2] text-center">
                        Click <span className="text-[#00B050]">Generate</span>{" "}
                        to get Intelligence Reports for any prediction event!
                      </h4>
                    </div>
                    {serverReports.length > 0 && (
                      <button
                        onClick={() => setShowHistory(true)}
                        className="px-6 py-3 bg-[#ffc000] text-black rounded-lg !font-semibold text-[14px] hover:bg-[#00b050] transition"
                      >
                        View Report History ({serverReports.length})
                      </button>
                    )}
                  </div>
                </header>
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
        <div className="w-full border-t border-[#ffc000] flex items-center justify-center py-2 z-30">
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
                {(selectedReportId || generatedReport?.id) && (
                  <button
                    onClick={handleBackToEmptyState}
                    className="flex items-center justify-center gap-1 z-51 w-[40px] h-[40px] bg-[#3C3C3C] rounded-[8px] cursor-pointer text-[14px]"
                    aria-label="Back to empty state"
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
              <div className="flex items-center gap-2">
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
          <div className="px-4 pb-4 pt-8 flex-1 min-h-0 overflow-hidden relative h-[calc(100%-60px)] sm:h-[calc(100%-60px)] md:h-[calc(100%-60px)]" style={{
              maxHeight: 'calc(100dvh - 60px)', // Use dynamic viewport height for mobile
            }}>
            <AIGeneratedMarketsReport
              generatedReport={generatedReport}
              userId={userId}
              selectedReportId={selectedReportId}
              onViewHistory={() => setShowHistory(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
