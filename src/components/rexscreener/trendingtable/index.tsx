/* eslint-disable @typescript-eslint/no-explicit-any */
import { TrendingTableContent } from "./tablecontent";
import type { TrendingToken, Chain } from "@/hooks/useTrendingTokens";

interface TrendingTableProps {
  onReportGenerated?: (report: any) => void;
  currentUserId: string;
  isAdmin: boolean;
  onTokenSelect?: (
    token: TrendingToken | null,
    address: string | null,
    isViewingChart: boolean
  ) => void;
  onChainChange?: (chain: Chain) => void;
}
export function TrendingTable({
  onReportGenerated,
  currentUserId,
  isAdmin,
  onTokenSelect,
  onChainChange,
}: TrendingTableProps) {
  return (
    <div className="w-full h-full flex flex-col">
      <TrendingTableContent
        onReportGenerated={onReportGenerated}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onTokenSelect={onTokenSelect}
        onChainChange={onChainChange}
      />
    </div>
  );
}
