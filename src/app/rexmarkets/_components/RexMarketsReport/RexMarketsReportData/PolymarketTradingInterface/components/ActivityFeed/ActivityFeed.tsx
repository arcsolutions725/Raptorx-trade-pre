"use client";

import HolderAvatar from "../shared/HolderAvatar";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { formatAddress, getTimeAgo } from "@/utils/polymarketTrading";
import type { TradeActivity } from "@/types/polymarketTrading";

type ActivityFeedProps = {
  conditionId: string | null;
  eventId?: string | null;
  marketFilter: string;
  priceFilter: string;
};

export default function ActivityFeed({
  conditionId,
  eventId,
  marketFilter,
  priceFilter,
}: ActivityFeedProps) {
  const { data: activityData, isLoading: isLoadingActivity } = useActivityFeed({
    conditionId,
    eventId,
    marketFilter,
    priceFilter,
  });

  return (
    <div className="space-y-0">
      {isLoadingActivity ? (
        <div className="text-xs text-white/60 py-2">Loading...</div>
      ) : activityData?.trades && activityData.trades.length > 0 ? (
        activityData.trades.map((trade: TradeActivity, idx: number) => {
          const isBuy = trade.side === "BUY";
          const outcome =
            trade.outcome || (trade.outcomeIndex === 0 ? "Yes" : "No");
          const price = trade.price || 0;
          const priceDisplay = price ? (price * 100).toFixed(1) : "0.0";
          const size = trade.size || 0;
          const usdcSize = size * price;
          const timestamp = trade.timestamp
            ? new Date(trade.timestamp * 1000)
            : new Date();
          const timeAgo = getTimeAgo(timestamp);
          const name =
            trade.name ||
            trade.pseudonym ||
            formatAddress(trade.proxyWallet || "");

          return (
            <div
              key={`activity-${trade.transactionHash}-${idx}`}
              className="flex items-center gap-3 py-3 px-2 border-b border-white/5 last:border-b-0 hover:bg-white/5 rounded"
            >
              <HolderAvatar
                profileImage={trade.profileImage || trade.profileImageOptimized}
                name={name}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/90">
                  <span className="font-medium">{name}</span>{" "}
                  <span className={isBuy ? "text-green-400" : "text-red-400"}>
                    {isBuy ? "bought" : "sold"}
                  </span>{" "}
                  <span className="font-semibold text-red-400">
                    {size.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}{" "}
                    {outcome}
                  </span>{" "}
                  {trade.title && (
                    <>
                      for <span className="text-white/70">{trade.title}</span>{" "}
                    </>
                  )}
                  at <span className="font-medium">{priceDisplay}¢</span>{" "}
                  <span className="text-white/60">
                    ($
                    {usdcSize.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    )
                  </span>{" "}
                  <span className="text-white/50 text-xs">{timeAgo}</span>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-xs text-white/60 py-2">No activity found</div>
      )}
    </div>
  );
}
