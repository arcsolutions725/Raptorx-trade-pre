"use client";

import { useMyriadMarketEvents } from "@/hooks/useMyriadMarketEvents";
import { formatAddress, getTimeAgo } from "@/utils/polymarketTrading";
import HolderAvatar from "../../PolymarketTradingInterface/components/shared/HolderAvatar";

/** Recent Myriad trades (activity tab). Styles: market.css (.mk-act). */
export default function MyriadActivity({ slug }: { slug: string | null }) {
  const { data, isLoading, isError } = useMyriadMarketEvents(slug, 1, 40);

  if (isLoading) {
    return (
      <div className="mk-msg" role="status">
        Loading activity...
      </div>
    );
  }
  if (isError) {
    return <div className="mk-msg">Could not load activity</div>;
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return <div className="mk-msg">No recent activity</div>;
  }

  return (
    <div className="mk-acts-list">
      {rows.map((ev, idx) => {
        const isBuy = ev.action === "buy" || ev.action === "add_liquidity";
        const ts = ev.timestamp ? new Date(ev.timestamp * 1000) : new Date();
        const timeAgo = getTimeAgo(ts);
        const name = formatAddress(ev.user);
        const shares = Number(ev.shares ?? 0);
        const val = Number(ev.value ?? 0);
        const outcome = ev.outcomeTitle ?? "—";

        return (
          <div key={`${ev.user}-${ev.timestamp}-${idx}`} className="mk-act">
            <HolderAvatar name={ev.user} tone="gold" />
            <div className="mk-act__line">
              <b title={ev.user}>{name}</b>{" "}
              <span className={isBuy ? "is-buy" : "is-sell"}>{ev.action}</span> <b>{outcome}</b>
              {shares > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="rx-num">
                    {shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>{" "}
                  shares
                </>
              ) : null}
              {val > 0 ? (
                <>
                  {" "}
                  <span className="rx-num">
                    (${val.toLocaleString(undefined, { maximumFractionDigits: 2 })})
                  </span>
                </>
              ) : null}{" "}
              <span className="mk-act__time">{timeAgo}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
