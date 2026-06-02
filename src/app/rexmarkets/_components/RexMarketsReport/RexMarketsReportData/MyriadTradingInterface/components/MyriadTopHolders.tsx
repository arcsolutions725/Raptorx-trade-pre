"use client";

import { useMyriadHoldersDetail } from "@/hooks/useMyriadHoldersDetail";
import { formatAddress } from "@/utils/polymarketTrading";
import HolderAvatar from "../../PolymarketTradingInterface/components/shared/HolderAvatar";

export default function MyriadTopHolders({ slug }: { slug: string | null }) {
  const { data, isLoading, isError } = useMyriadHoldersDetail(slug, 1, 15);

  const groups = data?.data ?? [];

  if (isLoading) {
    return <div className="text-xs text-white/60 py-2">Loading holders...</div>;
  }
  if (isError || groups.length === 0) {
    return <div className="text-xs text-white/60 py-2">No holder data available</div>;
  }

  return (
    <div
      className={`grid gap-4 ${
        groups.length === 1 ? "grid-cols-1" : groups.length === 2 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      }`}
    >
      {groups.map((g) => (
        <div key={g.outcomeId} className="min-w-0">
          <div className="flex items-center justify-between text-[10px] text-white/60 mb-1 pb-1 border-b border-white/10 px-2">
            <span className="text-sm text-[#ffc000] font-medium truncate pr-2">{g.outcomeTitle}</span>
            <span className="shrink-0">SHARES</span>
          </div>
          <div className="space-y-0">
            {g.holders?.length ? (
              g.holders.map((h, idx) => (
                <div
                  key={`${g.outcomeId}-${h.user}-${idx}`}
                  className="flex items-center justify-between text-xs py-2 hover:bg-white/5 rounded px-2 border-b border-white/5 last:border-b-0"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <HolderAvatar name={h.user} tone="gold" />
                    <span className="text-white/90 truncate font-medium" title={h.user}>
                      {formatAddress(h.user)}
                    </span>
                  </div>
                  <span className="text-[#ffc000] font-semibold shrink-0 ml-2">
                    {Number(h.shares ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-white/60 py-2 px-2">No holders</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
