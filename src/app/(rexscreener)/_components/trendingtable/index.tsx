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
  screenerChain: Chain;
  onScreenerChainNavigate: (chain: Chain) => void;
  /** When set with externalViewingChart, show chart in left panel (e.g. after Generate from table) */
  externalTokenForChart?: TrendingToken | null;
  externalViewingChart?: boolean;
  /** /[chain]/[token] deep link: loading token or not found */
  deepLinkTableOverlay?: null | "loading" | "not-found";
}

export function TrendingTable({
  onReportGenerated,
  currentUserId,
  isAdmin,
  onTokenSelect,
  screenerChain,
  onScreenerChainNavigate,
  externalTokenForChart = null,
  externalViewingChart = false,
  deepLinkTableOverlay = null,
}: TrendingTableProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <TrendingTableContent
        onReportGenerated={onReportGenerated}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onTokenSelect={onTokenSelect}
        screenerChain={screenerChain}
        onScreenerChainNavigate={onScreenerChainNavigate}
        externalTokenForChart={externalTokenForChart}
        externalViewingChart={externalViewingChart}
        deepLinkTableOverlay={deepLinkTableOverlay}
      />
    </div>
  );
}
