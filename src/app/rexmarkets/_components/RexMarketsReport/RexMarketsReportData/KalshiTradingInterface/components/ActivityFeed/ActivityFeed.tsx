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
    <div className="mk-acts-list">
      {isLoadingActivity ? (
        <div className="mk-msg" role="status">
          Loading...
        </div>
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
            <div key={trade.trade_id || idx} className="mk-act">
              <HolderAvatar name={name} tone="gold" />
              <div className="mk-act__line">
                <b>{name}</b>{" "}
                <span className={isBuy ? "is-buy" : "is-sell"}>
                  {isBuy ? "bought" : "sold"}
                </span>{" "}
                <span className={`rx-num ${outcome === "Yes" ? "is-yes" : "is-no"}`}>
                  {size.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  {outcome}
                </span>{" "}
                {trade.ticker &&
                  typeof trade.ticker === "string" &&
                  trade.ticker.trim() && (
                    <>
                      for <span className="mk-act__tk">{trade.ticker}</span>{" "}
                    </>
                  )}
                at <span className="rx-num">{priceDisplay}¢</span>{" "}
                <span className="rx-num">
                  ($
                  {usdcSize.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                  )
                </span>{" "}
                <span className="mk-act__time">{timeAgo}</span>
              </div>
            </div>
          );
        })
      ) : (
        <div className="mk-msg">No activity found</div>
      )}
    </div>
  );
}
