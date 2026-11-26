"use client";

import { useLimitlessHolders } from "@/hooks/useLimitlessHolders";
import { formatAddress } from "@/utils/polymarketTrading";
import HolderAvatar from "../../../PolymarketTradingInterface/components/shared/HolderAvatar";

type TopHoldersProps = {
  marketSlug: string | null;
};

/** Top Yes / No holders (styles: market-venues-a.css .mk-tophold). */
export default function TopHolders({ marketSlug }: TopHoldersProps) {
  const { data, isLoading } = useLimitlessHolders(marketSlug ?? null, 1, 10);
  const yesData = data?.yes?.data ?? [];
  const noData = data?.no?.data ?? [];

  const columns = [
    { key: "yes", label: "Yes holders", empty: "No Yes holders", holders: yesData },
    { key: "no", label: "No holders", empty: "No No holders", holders: noData },
  ] as const;

  return (
    <div className="mk-tophold">
      {columns.map((col) => (
        <div key={col.key} className={`mk-tophold__col mk-tophold__col--${col.key}`}>
          <div className="mk-tophold__head">
            <b>{col.label}</b>
            <span>Shares</span>
          </div>
          {isLoading ? (
            <div className="mk-msg" role="status">
              Loading...
            </div>
          ) : col.holders.length > 0 ? (
            col.holders.map((holder, idx) => (
              <div key={`${col.key}-${holder.user}-${idx}`} className="mk-tophold__row">
                <HolderAvatar name={holder.username || holder.user} tone="gold" />
                <span className="mk-tophold__name" title={holder.username || holder.user}>
                  {holder.username || formatAddress(holder.user)}
                </span>
                <span className="mk-tophold__val">{holder.contractsFormatted}</span>
              </div>
            ))
          ) : (
            <div className="mk-msg">{col.empty}</div>
          )}
        </div>
      ))}
    </div>
  );
}
