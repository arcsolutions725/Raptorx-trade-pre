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
    <div className="mk-acts-list">
      {isLoadingActivity ? (
        <div className="mk-msg" role="status">
          Loading...
        </div>
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
              className="mk-act"
            >
              <HolderAvatar
                profileImage={trade.profileImage || trade.profileImageOptimized}
                name={name}
                tone="gold"
              />
              <div className="mk-act__line">
                <b>{name}</b>{" "}
                <span className={isBuy ? "is-buy" : "is-sell"}>
                  {isBuy ? "bought" : "sold"}
                </span>{" "}
                <span
                  className={`rx-num ${
                    trade.outcomeIndex === 1 ||
                    String(outcome).toLowerCase() === "no"
                      ? "is-no"
                      : "is-yes"
                  }`}
                >
                  {size.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  {outcome}
                </span>{" "}
                {trade.title && (
                  <>
                    for <span className="mk-act__tk">{trade.title}</span>{" "}
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
