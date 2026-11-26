"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/utils/polymarketTrading";
import { usePredictFunOrderBook } from "@/hooks/usePredictFunOrderBook";
import "@/styles/pages/market-venues-b.css";

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
    <div className={`mk-ob${effectiveExpanded ? " mk-ob--full" : ""}`}>
      <div className="mk-ob__top">
        {/* Current outcome prices */}
        <div className="mkb-ob-prices">
          <span className="is-yes">
            <span className="mkb-ob-name">{firstOutcomeLabel}</span>{" "}
            <span className="rx-num">{formatPrice(yesPrice)}</span>
          </span>
          <span className="is-no">
            <span className="mkb-ob-name">{secondOutcomeLabel}</span>{" "}
            <span className="rx-num">{formatPrice(noPrice)}</span>
          </span>
        </div>
        {showDepthToggle && (
          <button
            type="button"
            onClick={toggleDepth}
            aria-expanded={effectiveExpanded}
            className="rx-btn rx-btn--secondary rx-btn--s mk-ob__toggle"
          >
            {effectiveExpanded ? "Hide depth" : "Show depth"}
          </button>
        )}
      </div>

      {effectiveExpanded && (
        <div className="mk-ob__body">
          {isLoading ? (
            <div className="mk-ob__msg" role="status">
              Loading orderbook…
            </div>
          ) : isError ? (
            <div className="mk-ob__msg mk-ob__msg--error">Could not load orderbook</div>
          ) : (
            <>
              <div className="mk-ob__cols" aria-hidden="true">
                <span>Price (¢)</span>
                <span>Shares</span>
                <span>Total (USD)</span>
              </div>

              <div className="mk-ob__group mk-ob__group--ask">
                <div className="mk-ob__label">Asks</div>
                {asks.length === 0 ? (
                  <div className="mk-ob__msg">No asks</div>
                ) : (
                  asks.map((row, i) => (
                    <div key={`a-${i}`} className="mk-ob__row">
                      <span>{formatCents(row.price)}</span>
                      <span>{row.size.toLocaleString()}</span>
                      <span>{formatUsd(row.total)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="mk-ob__spread">
                Spread <b>{formatCents(spread)}</b>
              </div>

              <div className="mk-ob__group mk-ob__group--bid">
                <div className="mk-ob__label">Bids</div>
                {bids.length === 0 ? (
                  <div className="mk-ob__msg">No bids</div>
                ) : (
                  bids.map((row, i) => (
                    <div key={`b-${i}`} className="mk-ob__row">
                      <span>{formatCents(row.price)}</span>
                      <span>{row.size.toLocaleString()}</span>
                      <span>{formatUsd(row.total)}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
