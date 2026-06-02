"use client";

import { useLimitlessHolders } from "@/hooks/useLimitlessHolders";
import { formatAddress } from "@/utils/polymarketTrading";
import HolderAvatar from "../../../PolymarketTradingInterface/components/shared/HolderAvatar";

type TopHoldersProps = {
  marketSlug: string | null;
};

export default function TopHolders({ marketSlug }: TopHoldersProps) {
  const { data, isLoading } = useLimitlessHolders(marketSlug ?? null, 1, 10);
  const yesData = data?.yes?.data ?? [];
  const noData = data?.no?.data ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="min-w-0">
        <div className="flex items-center justify-between text-[10px] text-white/60 mb-1 pb-1 border-b border-white/10 px-2">
          <span className="text-sm text-green-400">Yes Holders</span>
          <span>SHARES</span>
        </div>
        <div className="space-y-0">
          {isLoading ? (
            <div className="text-xs text-white/60 py-2">Loading...</div>
          ) : yesData.length > 0 ? (
            yesData.map((holder, idx) => (
              <div
                key={`yes-${holder.user}-${idx}`}
                className="flex items-center justify-between text-xs py-2 hover:bg-white/5 rounded px-2 border-b border-white/5 last:border-b-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <HolderAvatar
                    name={holder.username || holder.user}
                  />
                  <span className="text-white/90 truncate flex-1 min-w-0 font-medium" title={holder.username || holder.user}>
                    {holder.username || formatAddress(holder.user)}
                  </span>
                </div>
                <div className="ml-2 flex-shrink-0">
                  <span className="text-green-400 font-semibold">{holder.contractsFormatted}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-white/60 py-2">No Yes holders</div>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center justify-between text-[10px] text-white/60 mb-1 pb-1 border-b border-white/10 px-2">
          <span className="text-sm text-red-400">No Holders</span>
          <span>SHARES</span>
        </div>
        <div className="space-y-0">
          {isLoading ? (
            <div className="text-xs text-white/60 py-2">Loading...</div>
          ) : noData.length > 0 ? (
            noData.map((holder, idx) => (
              <div
                key={`no-${holder.user}-${idx}`}
                className="flex items-center justify-between text-xs py-2 hover:bg-white/5 rounded px-2 border-b border-white/5 last:border-b-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <HolderAvatar name={holder.username || holder.user} />
                  <span className="text-white/90 truncate flex-1 min-w-0 font-medium" title={holder.username || holder.user}>
                    {holder.username || formatAddress(holder.user)}
                  </span>
                </div>
                <div className="ml-2 flex-shrink-0">
                  <span className="text-red-400 font-semibold">{holder.contractsFormatted}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-white/60 py-2">No No holders</div>
          )}
        </div>
      </div>
    </div>
  );
}
