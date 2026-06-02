/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";

import MarketDataTable from "./MarketDataTable";

type RexMarketsTableProps = {
  onReportGenerated?: (report: any) => void;
  currentUserId: string;
  onMarketSelected?: (
    eventTicker: string,
    marketTitle: string,
    totalVolume: number,
    eventId?: string
  ) => void;
};

export default function RexMarketsTable({
  onReportGenerated,
  currentUserId,
  onMarketSelected,
}: RexMarketsTableProps) {
  const [searchQuery, setSearchQuery] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <MarketDataTable
          onReportGenerated={onReportGenerated}
          currentUserId={currentUserId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onMarketSelected={onMarketSelected}
        />
      </div>
    </div>
  );
}
