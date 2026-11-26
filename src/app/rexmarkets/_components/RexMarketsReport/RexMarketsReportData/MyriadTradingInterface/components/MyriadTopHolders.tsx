"use client";

import { useMyriadHoldersDetail } from "@/hooks/useMyriadHoldersDetail";
import { formatAddress } from "@/utils/polymarketTrading";
import HolderAvatar from "../../PolymarketTradingInterface/components/shared/HolderAvatar";
import "@/styles/pages/market-venues-b.css";

/** Top holders per outcome (Myriad), in the comments / activity area. Styles: market-venues-b.css (.mkb-holders). */
export default function MyriadTopHolders({ slug }: { slug: string | null }) {
  const { data, isLoading, isError } = useMyriadHoldersDetail(slug, 1, 15);

  const groups = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="mk-msg" role="status">
        Loading holders...
      </div>
    );
  }
  if (isError || groups.length === 0) {
    return <div className="mk-msg">No holder data available</div>;
  }

  return (
    <div className={`mkb-holders mkb-holders--${Math.min(groups.length, 3)}`}>
      {groups.map((g) => (
        <div key={g.outcomeId} className="mkb-holders__group">
          <div className="mkb-holders__head">
            <b title={g.outcomeTitle}>{g.outcomeTitle}</b>
            <span>Shares</span>
          </div>
          {g.holders?.length ? (
            g.holders.map((h, idx) => (
              <div key={`${g.outcomeId}-${h.user}-${idx}`} className="mkb-holders__row">
                <HolderAvatar name={h.user} tone="gold" size={28} />
                <span className="mkb-holders__who" title={h.user}>
                  {formatAddress(h.user)}
                </span>
                <span className="rx-num mkb-holders__val">
                  {Number(h.shares ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            ))
          ) : (
            <div className="mkb-holders__none">No holders</div>
          )}
        </div>
      ))}
    </div>
  );
}
