"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/utils/polymarketTrading";
import { usePredictFunOrderBook } from "@/hooks/usePredictFunOrderBook";

type PredictFunOrderBookProps = {
  marketId: string | null;
  yesPrice?: number;
  noPrice?: number;
  firstOutcomeLabel?: string;
  secondOutcomeLabel?: string;
  onDepthExpandedChange?: (expanded: boolean) => void;
  showDepthToggle?: boolean;
};

export default function PredictFunOrderBook({
  marketId,
  yesPrice = 0,
  noPrice = 0,
  firstOutcomeLabel = "Yes",
  secondOutcomeLabel = "No",
  onDepthExpandedChange,
  showDepthToggle = true,
}: PredictFunOrderBookProps) {
  const [depthExpanded, setDepthExpanded] = useState(true);
  const effectiveExpanded = showDepthToggle ? depthExpanded : true;
  const { orderbook, isLoading, isError } = usePredictFunOrderBook(marketId);

  const { asks, bids, spread } = useMemo(() => {
    const rawAsks = orderbook?.asks ?? [];
    const rawBids = orderbook?.bids ?? [];
    let askTotal = 0;
    const asksWithTotals = rawAsks
      .map(([price, size]) => ({ price, size, total: (askTotal += price * size) }))
      .sort((a, b) => a.price - b.price)
      .reverse();
    let bidTotal = 0;
    const bidsWithTotals = rawBids
      .map(([price, size]) => ({ price, size, total: (bidTotal += price * size) }))
      .sort((a, b) => b.price - a.price);
    const bestAsk = asksWithTotals[asksWithTotals.length - 1]?.price;
    const bestBid = bidsWithTotals[0]?.price;
    const spreadVal =
      bestAsk != null && bestBid != null ? Math.max(0, bestAsk - bestBid) : 0;
    return { asks: asksWithTotals, bids: bidsWithTotals, spread: spreadVal };
  }, [orderbook]);

  const formatCents = (p: number) => `${(p * 100).toFixed(2)}¢`;
  const formatUsd = (v: number) =>
    `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const toggleDepth = () => {
    setDepthExpanded((prev) => {
      const next = !prev;
      onDepthExpandedChange?.(next);
      return next;
    });
  };

  return (
    <div
      className={`w-full flex-shrink-0 flex flex-col min-h-0 ${
        effectiveExpanded ? "h-full" : "h-auto"
      }`}
    >
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
        <div className="flex gap-2 text-xs">
          <span className="flex-1 py-1.5 px-2 rounded bg-[#A855F7]/20 text-[#e9d5ff] font-medium text-center">
            {firstOutcomeLabel} {formatPrice(yesPrice)}
          </span>
          <span className="flex-1 py-1.5 px-2 rounded bg-white/10 text-white/70 font-medium text-center">
            {secondOutcomeLabel} {formatPrice(noPrice)}
          </span>
        </div>
      </div>

      {showDepthToggle && (
        <button
          type="button"
          onClick={toggleDepth}
          className="px-4 py-2 text-xs text-white/60 hover:text-white border-b border-white/10 text-left"
        >
          {effectiveExpanded ? "Hide depth" : "Show depth"}
        </button>
      )}

      {effectiveExpanded && (
        <div className="flex-1 min-h-0 overflow-y-auto rexmarkets-scroll-pane-y px-4 py-2 text-xs">
          {isLoading ? (
            <div className="text-white/50 py-4 text-center">Loading orderbook…</div>
          ) : isError ? (
            <div className="text-white/50 py-4 text-center">Could not load orderbook</div>
          ) : (
            <>
              <div className="text-white/50 mb-2 flex justify-between">
                <span>Spread</span>
                <span className="text-white">{formatCents(spread)}</span>
              </div>
              <div className="text-red-400/90 font-medium mb-1">Asks</div>
              {asks.length === 0 ? (
                <div className="text-white/40 py-2">No asks</div>
              ) : (
                asks.map((row, i) => (
                  <div key={`a-${i}`} className="grid grid-cols-3 gap-2 py-0.5 text-red-300/90">
                    <span>{formatCents(row.price)}</span>
                    <span className="text-right">{row.size.toLocaleString()}</span>
                    <span className="text-right text-white/40">{formatUsd(row.total)}</span>
                  </div>
                ))
              )}
              <div className="text-green-400/90 font-medium mt-3 mb-1">Bids</div>
              {bids.length === 0 ? (
                <div className="text-white/40 py-2">No bids</div>
              ) : (
                bids.map((row, i) => (
                  <div key={`b-${i}`} className="grid grid-cols-3 gap-2 py-0.5 text-green-300/90">
                    <span>{formatCents(row.price)}</span>
                    <span className="text-right">{row.size.toLocaleString()}</span>
                    <span className="text-right text-white/40">{formatUsd(row.total)}</span>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
