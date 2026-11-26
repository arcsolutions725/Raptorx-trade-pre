"use client";

import { usePredictFunMarketMatches } from "@/hooks/usePredictFunMarketMatches";
import { usePredictFunOrderBook } from "@/hooks/usePredictFunOrderBook";
import { formatPrice } from "@/utils/polymarketTrading";
import "@/styles/pages/market-venues-b.css";

type PredictFunActivityProps = {
  marketId: string | null;
  categorySlug?: string | null;
};

export default function PredictFunActivity({
  marketId,
  categorySlug,
}: PredictFunActivityProps) {
  const {
    data: matches = [],
    isLoading: matchesLoading,
    isError: matchesError,
  } = usePredictFunMarketMatches(marketId, categorySlug ?? null);

  const { orderbook, isLoading: bookLoading } = usePredictFunOrderBook(marketId);

  const isLoading = matchesLoading || bookLoading;

  if (isLoading) {
    return (
      <div className="mk-msg" role="status">
        Loading activity…
      </div>
    );
  }

  if (matchesError && !orderbook?.lastOrderSettled) {
    return <div className="mk-msg">Could not load activity</div>;
  }

  const rows = [...matches];
  const last = orderbook?.lastOrderSettled;
  if (last && !rows.some((r) => r.key === `book-${last.id}`)) {
    const price = Number(last.price);
    rows.unshift({
      key: `book-${last.id}`,
      sideLabel: last.side,
      sideTone: last.side === "Bid" ? "buy" : "sell",
      outcome: last.outcome,
      priceDisplay: formatPrice(Number.isFinite(price) ? price : 0),
      sizeDisplay: "—",
      timeStr: "Latest on book",
      sortTime: Date.now(),
      marketTitle: "",
    });
  }

  if (rows.length === 0) {
    return <div className="mk-msg">No recent trades for this market</div>;
  }

  return (
    <div className="mk-acts-list">
      {rows.map((row) => {
        const sideClass =
          row.sideTone === "buy" ? "is-buy" : row.sideTone === "sell" ? "is-sell" : undefined;
        return (
          <div key={row.key} className="mk-act">
            <div className="mk-act__line">
              <span className={sideClass}>{row.sideLabel}</span> <b>{row.outcome}</b> @{" "}
              <span className="rx-num">{row.priceDisplay}</span>
              {row.sizeDisplay !== "—" ? (
                <>
                  {" "}
                  <span className="rx-num mkb-act__size">{row.sizeDisplay}</span>
                </>
              ) : null}
              {row.marketTitle ? <span className="mkb-act__sub">{row.marketTitle}</span> : null}
              <span className="mkb-act__sub mk-act__time">{row.timeStr}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
