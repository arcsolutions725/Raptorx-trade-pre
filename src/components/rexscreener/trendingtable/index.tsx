/* eslint-disable @typescript-eslint/no-explicit-any */
import { TrendingTableContent } from "./tablecontent";
import type { TrendingToken, Chain } from "@/hooks/useTrendingTokens";

interface TrendingTableProps {
  onReportGenerated?: (report: any, token?: TrendingToken | null) => void;
  currentUserId: string;
  isAdmin: boolean;
  onTokenSelect?: (
    token: TrendingToken | null,
    address: string | null,
    isViewingChart: boolean
  ) => void;
  onChainChange?: (chain: Chain) => void;
  /** When set with externalViewingChart, show chart in left panel (e.g. after Generate from table) */
  externalTokenForChart?: TrendingToken | null;
  externalViewingChart?: boolean;
}
export function TrendingTable({
  onReportGenerated,
  currentUserId,
  isAdmin,
  onTokenSelect,
  onChainChange,
  externalTokenForChart = null,
  externalViewingChart = false,
}: TrendingTableProps) {
  return (
    <div className="w-full h-full flex flex-col">
      <TrendingTableContent
        onReportGenerated={onReportGenerated}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onTokenSelect={onTokenSelect}
        onChainChange={onChainChange}
        externalTokenForChart={externalTokenForChart}
        externalViewingChart={externalViewingChart}
      />
    </div>
  );
}
