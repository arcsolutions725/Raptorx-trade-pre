"use client";

import { useMemo } from "react";
import HolderAvatar from "../shared/HolderAvatar";
import { useTopHolders } from "@/hooks/useTopHolders";
import { formatAddress } from "@/utils/polymarketTrading";
import type { TopHolder } from "@/types/polymarketTrading";

type TopHoldersProps = {
  conditionId: string | null;
};

/** Top Yes / No holders (styles: market-venues-a.css .mk-tophold). */
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

  const columns = [
    { key: "yes", label: "Yes holders", empty: "No Yes holders", holders: topHolders.yesHolders },
    { key: "no", label: "No holders", empty: "No No holders", holders: topHolders.noHolders },
  ] as const;

  return (
    <div className="mk-tophold">
      {columns.map((col) => (
        <div key={col.key} className={`mk-tophold__col mk-tophold__col--${col.key}`}>
          <div className="mk-tophold__head">
            <b>{col.label}</b>
            <span>Shares</span>
          </div>
          {isLoadingTopHolders ? (
            <div className="mk-msg" role="status">
              Loading...
            </div>
          ) : col.holders.length > 0 ? (
            col.holders.map((holder, idx) => (
              <div
                key={`${col.key}-${holder.address}-${idx}`}
                className="mk-tophold__row"
              >
                <HolderAvatar
                  profileImage={holder.profileImage}
                  name={holder.name || holder.pseudonym || holder.address}
                  tone="gold"
                />
                <span
                  className="mk-tophold__name"
                  title={holder.name || holder.pseudonym || holder.address}
                >
                  {holder.name ||
                    holder.pseudonym ||
                    formatAddress(holder.address)}
                </span>
                <span className="mk-tophold__val">
                  {(holder.amount || holder.shares).toLocaleString(
                    undefined,
                    { maximumFractionDigits: 0 }
                  )}
                </span>
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
