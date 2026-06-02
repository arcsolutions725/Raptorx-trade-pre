"use client";

import { useState, useEffect, useRef } from "react";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";

import RexMarketsReportData from "./RexMarketsReportData";

type RexMarketsReportProps = {
  generatedReport?: MarketReport | null;
  userId?: string | null;
  selectedMarketTicker?: string | null;
  selectedMarketTitle?: string | null;
  selectedMarketVolume?: number;
  selectedMarketEventId?: string | null;
  onClose?: () => void;
  /** Clears in-session report on the parent so the sidebar can show the Generate empty state and the main header can reset. */
  onClearSessionReport?: () => void;
};

export default function RexMarketsReport({
  generatedReport,
  userId,
  selectedMarketTicker,
  selectedMarketTitle,
  selectedMarketVolume,
  selectedMarketEventId,
  onClose,
  onClearSessionReport,
}: RexMarketsReportProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    generatedReport?.id || null
  );
  const prevTickerRef = useRef<string | null>(null);
  const prevGenReportIdRef = useRef<string | null>(null);

  useEffect(() => {
    const t = selectedMarketTicker ?? null;
    if (prevTickerRef.current === t) return;
    prevTickerRef.current = t;
    if (!generatedReport?.id) {
      setSelectedReportId(null);
      prevGenReportIdRef.current = null;
    }
  }, [selectedMarketTicker, generatedReport?.id]);

  // Only sync selection when the saved report id actually changes (e.g. new generation).
  // Avoid overwriting selectedReportId after the user dismisses with "back" while generatedReport is still in parent state for one frame.
  useEffect(() => {
    const gid = generatedReport?.id ?? null;
    if (gid !== prevGenReportIdRef.current) {
      prevGenReportIdRef.current = gid;
      if (gid) {
        setSelectedReportId(gid);
      } else {
        setSelectedReportId(null);
      }
    }
  }, [generatedReport?.id]);

  return (
    <div
      className="flex h-full min-h-0 w-full max-h-[100dvh] flex-col overflow-hidden border-0 lg:max-h-none lg:border-l lg:border-l-[#ffc000]"
    >
      <RexMarketsReportData 
        generatedReport={generatedReport} 
        userId={userId}
        selectedReportId={selectedReportId}
        onReportSelect={(rid) => setSelectedReportId(rid)}
        selectedMarketTicker={selectedMarketTicker}
        selectedMarketTitle={selectedMarketTitle}
        selectedMarketVolume={selectedMarketVolume}
        selectedMarketEventId={selectedMarketEventId}
        onClose={onClose}
        onClearSessionReport={onClearSessionReport}
      />
    </div>
  );
}
