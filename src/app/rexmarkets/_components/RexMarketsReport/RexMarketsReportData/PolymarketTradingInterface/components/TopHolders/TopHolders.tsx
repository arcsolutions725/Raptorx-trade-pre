"use client";

import { useMemo } from "react";
import HolderAvatar from "../shared/HolderAvatar";
import { useTopHolders } from "@/hooks/useTopHolders";
import { formatAddress } from "@/utils/polymarketTrading";
import type { TopHolder } from "@/types/polymarketTrading";

type TopHoldersProps = {
  conditionId: string | null;
};

export default function TopHolders({ conditionId }: TopHoldersProps) {
  const { data: topHoldersData, isLoading: isLoadingTopHolders } =
    useTopHolders(conditionId);

  const topHolders: { yesHolders: TopHolder[]; noHolders: TopHolder[] } =
    useMemo(
      () =>
        topHoldersData || {
          yesHolders: [],
          noHolders: [],
        },
      [topHoldersData]
    );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Yes Holders */}
      <div className="min-w-0">
        <div className="flex items-center justify-between text-[10px] text-white/60 mb-1 pb-1 border-b border-white/10 px-2">
          <span className="text-sm text-green-400">Yes Holders</span>
          <span>SHARES</span>
        </div>
        <div className="space-y-0 overflow-y-auto custom-select-scrollbar">
          {isLoadingTopHolders ? (
            <div className="text-xs text-white/60 py-2">Loading...</div>
          ) : topHolders.yesHolders.length > 0 ? (
            topHolders.yesHolders.map((holder, idx) => (
              <div
                key={`yes-${holder.address}-${idx}`}
                className="flex items-center justify-between text-xs py-2 hover:bg-white/5 rounded px-2 border-b border-white/5 last:border-b-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <HolderAvatar
                    profileImage={holder.profileImage}
                    name={holder.name || holder.pseudonym || holder.address}
                  />
                  <span
                    className="text-white/90 truncate flex-1 min-w-0 font-medium"
                    title={holder.name || holder.pseudonym || holder.address}
                  >
                    {holder.name ||
                      holder.pseudonym ||
                      formatAddress(holder.address)}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-green-400 font-semibold">
                    {(holder.amount || holder.shares).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-white/60 py-2">No Yes holders</div>
          )}
        </div>
      </div>

      {/* No Holders */}
      <div className="min-w-0">
        <div className="flex items-center justify-between text-[10px] text-white/60 mb-1 pb-1 border-b border-white/10 px-2">
          <span className="text-sm text-red-400">No Holders</span>
          <span>SHARES</span>
        </div>
        <div className="space-y-0 overflow-y-auto custom-select-scrollbar">
          {isLoadingTopHolders ? (
            <div className="text-xs text-white/60 py-2">Loading...</div>
          ) : topHolders.noHolders.length > 0 ? (
            topHolders.noHolders.map((holder, idx) => (
              <div
                key={`no-${holder.address}-${idx}`}
                className="flex items-center justify-between text-xs py-2 hover:bg-white/5 rounded px-2 border-b border-white/5 last:border-b-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <HolderAvatar
                    profileImage={holder.profileImage}
                    name={holder.name || holder.pseudonym || holder.address}
                  />
                  <span
                    className="text-white/90 truncate flex-1 min-w-0 font-medium"
                    title={holder.name || holder.pseudonym || holder.address}
                  >
                    {holder.name ||
                      holder.pseudonym ||
                      formatAddress(holder.address)}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-red-400 font-semibold">
                    {(holder.amount || holder.shares).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}
                  </span>
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
