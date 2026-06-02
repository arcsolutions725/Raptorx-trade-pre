"use client";

import { useMyriadMarketEvents } from "@/hooks/useMyriadMarketEvents";
import { formatAddress, getTimeAgo } from "@/utils/polymarketTrading";
import HolderAvatar from "../../PolymarketTradingInterface/components/shared/HolderAvatar";

export default function MyriadActivity({ slug }: { slug: string | null }) {
  const { data, isLoading, isError } = useMyriadMarketEvents(slug, 1, 40);

  if (isLoading) {
    return <div className="text-xs text-white/60 py-2">Loading activity...</div>;
  }
  if (isError) {
    return <div className="text-xs text-white/60 py-2">Could not load activity</div>;
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return <div className="text-xs text-white/60 py-2">No recent activity</div>;
  }

  return (
    <div className="space-y-0">
      {rows.map((ev, idx) => {
        const isBuy = ev.action === "buy" || ev.action === "add_liquidity";
        const ts = ev.timestamp ? new Date(ev.timestamp * 1000) : new Date();
        const timeAgo = getTimeAgo(ts);
        const name = formatAddress(ev.user);
        const shares = Number(ev.shares ?? 0);
        const val = Number(ev.value ?? 0);
        const outcome = ev.outcomeTitle ?? "—";

        return (
          <div
            key={`${ev.user}-${ev.timestamp}-${idx}`}
            className="flex items-start gap-3 py-3 px-2 border-b border-white/5 last:border-b-0 hover:bg-white/5 rounded"
          >
            <HolderAvatar name={ev.user} tone="gold" />
            <div className="flex-1 min-w-0 text-sm text-white/90 leading-snug">
              <span className="font-medium">{name}</span>{" "}
              <span className={isBuy ? "text-green-400" : "text-red-400"}>{ev.action}</span>{" "}
              <span className="font-semibold text-white">{outcome}</span>
              {shares > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-white/80">
                    {shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares
                  </span>
                </>
              ) : null}
              {val > 0 ? (
                <>
                  {" "}
                  (
                  <span className="text-white/70">
                    ${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  )
                </>
              ) : null}
              <span className="text-white/50 text-xs ml-1">{timeAgo}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
