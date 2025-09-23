/* eslint-disable @typescript-eslint/no-explicit-any */
import { TrendingTableContent } from "./tablecontent";
import { TrendingTableHeader } from "./trendingheader";
import type { TrendingToken } from "@/hooks/useTrendingTokens";

interface TrendingTableProps {
  onReportGenerated?: (report: any) => void;
  currentUserId: string;
  isAdmin: boolean;
  /**
   * Callback fired when a user selects a token row (and navigates to the
   * DexScreener chart).  `token` is the full token object, `address` is the
   * contract address string, and `isViewingChart` indicates whether the user
   * is currently in the chart view.
   */
  onTokenSelect?: (
    token: TrendingToken | null,
    address: string | null,
    isViewingChart: boolean
  ) => void;
}
export function TrendingTable({
  onReportGenerated,
  currentUserId,
  isAdmin,
  onTokenSelect,
}: TrendingTableProps) {
  return (
    <div className="w-full flex flex-col border-0 min-[1024px]:border-r-1 border-[#ffc000] min-h-[100vh]">
      <TrendingTableHeader />
      <TrendingTableContent
        onReportGenerated={onReportGenerated}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onTokenSelect={onTokenSelect}
      />
    </div>
  );
}
