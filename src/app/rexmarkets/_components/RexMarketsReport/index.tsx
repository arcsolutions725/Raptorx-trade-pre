"use client";

import { useState, useEffect } from "react";
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
};

export default function RexMarketsReport({
  generatedReport,
  userId,
  selectedMarketTicker,
  selectedMarketTitle,
  selectedMarketVolume,
  selectedMarketEventId,
  onClose,
}: RexMarketsReportProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    generatedReport?.id || null
  );

  // Update selectedReportId when generatedReport changes
  useEffect(() => {
    if (generatedReport?.id) {
      setSelectedReportId(generatedReport.id);
    }
  }, [generatedReport?.id]);

  return (
    <div className="w-full h-[100vh] flex flex-col border-l border-l-[#ffc000] overflow-hidden">
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
      />
    </div>
  );
}
