"use client";

import { usePredictFunMarketMatches } from "@/hooks/usePredictFunMarketMatches";
import { usePredictFunOrderBook } from "@/hooks/usePredictFunOrderBook";
import { formatPrice } from "@/utils/polymarketTrading";

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
    return <div className="text-xs text-white/60 py-2 px-2">Loading activity…</div>;
  }

  if (matchesError && !orderbook?.lastOrderSettled) {
    return (
      <div className="text-xs text-white/60 py-4 px-2 text-center">
        Could not load activity
      </div>
    );
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
    return (
      <div className="text-xs text-white/60 py-4 px-2 text-center">
        No recent trades for this market
      </div>
    );
  }

  return (
    <div className="space-y-0 px-2">
      {rows.map((row) => {
        const sideClass =
          row.sideTone === "buy"
            ? "text-green-400"
            : row.sideTone === "sell"
              ? "text-red-400"
              : "text-white/70";
        return (
          <div
            key={row.key}
            className="flex items-start gap-3 py-3 border-b border-white/5 last:border-b-0"
          >
            <div className="flex-1 min-w-0 text-sm text-white/90">
              <span className={sideClass}>{row.sideLabel}</span>{" "}
              <span className="font-semibold text-white">{row.outcome}</span>{" "}
              <span className="text-white/70">@ {row.priceDisplay}</span>
              {row.sizeDisplay !== "—" ? (
                <span className="text-white/50 text-xs ml-2">{row.sizeDisplay}</span>
              ) : null}
              {row.marketTitle ? (
                <div className="text-xs text-white/50 mt-0.5 truncate">{row.marketTitle}</div>
              ) : null}
              <div className="text-xs text-white/40 mt-1">{row.timeStr}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
