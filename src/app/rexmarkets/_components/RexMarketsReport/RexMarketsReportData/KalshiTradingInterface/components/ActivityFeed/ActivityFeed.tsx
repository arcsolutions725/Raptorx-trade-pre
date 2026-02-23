"use client";

import HolderAvatar from "../../../PolymarketTradingInterface/components/shared/HolderAvatar";
import { useKalshiActivity, type KalshiTrade } from "@/hooks/useKalshiActivity";

type KalshiActivityFeedProps = {
  seriesTicker?: string;
};

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  return `${days}d ago`;
}

export default function KalshiActivityFeed({
  seriesTicker,
}: KalshiActivityFeedProps) {
  const { data: activityData, isLoading: isLoadingActivity } =
    useKalshiActivity({
      seriesTicker,
      pageSize: 20,
    });

  return (
    <div className="space-y-0 overflow-y-auto custom-select-scrollbar">
      {isLoadingActivity ? (
        <div className="text-xs text-white/60 py-2">Loading...</div>
      ) : activityData?.trades &&
        Array.isArray(activityData.trades) &&
        activityData.trades.length > 0 ? (
        activityData.trades
          .filter((trade) => trade && typeof trade === "object")
          .map((trade: KalshiTrade, idx: number) => {
          const isBuy = trade.taker_action === "buy";
          const outcome = trade.taker_side === "yes" ? "Yes" : "No";
          const price = parseFloat(trade.price_dollars) || trade.price / 100;
          const priceDisplay = (price * 100).toFixed(1);
          const size = trade.count || 0;
          const usdcSize = size * price;
          const timeAgo = getTimeAgo(trade.create_date);
          const name = trade.taker_nickname || "Anonymous";

          return (
            <div
              key={trade.trade_id || idx}
              className="flex items-center gap-3 py-3 px-2 border-b border-white/5 last:border-b-0 hover:bg-white/5 rounded"
            >
              <HolderAvatar name={name} />
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
                  {trade.ticker &&
                    typeof trade.ticker === "string" &&
                    trade.ticker.trim() && (
                      <>
                        for <span className="text-white/70">{trade.ticker}</span>{" "}
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
