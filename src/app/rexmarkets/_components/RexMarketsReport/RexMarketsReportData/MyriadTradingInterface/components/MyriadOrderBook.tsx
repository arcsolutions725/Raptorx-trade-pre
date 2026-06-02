"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/utils/polymarketTrading";
import { calculateTotalCost } from "@/utils/order";
import { useMyriadOrderBook } from "@/hooks/useMyriadOrderBook";

type OutcomeOpt = { index: number; title: string; price: number };

type MyriadOrderBookProps = {
  marketId: number | null;
  networkId: number | null;
  /** When false (AMM / executionMode 0), depth is hidden — CLOB exists only for order-book markets. */
  orderBookEnabled?: boolean;
  outcomeOptions: OutcomeOpt[];
  selectedOutcomeIndex: number;
  onSelectOutcome: (idx: number) => void;
  onDepthExpandedChange?: (expanded: boolean) => void;
  showDepthToggle?: boolean;
};

export default function MyriadOrderBook({
  marketId,
  networkId,
  orderBookEnabled = true,
  outcomeOptions,
  selectedOutcomeIndex,
  onSelectOutcome,
  onDepthExpandedChange,
  showDepthToggle = true,
}: MyriadOrderBookProps) {
  const [depthExpanded, setDepthExpanded] = useState(true);
  const effectiveExpanded = showDepthToggle ? depthExpanded : true;

  const toggleDepth = () => {
    setDepthExpanded((prev) => {
      const next = !prev;
      onDepthExpandedChange?.(next);
      return next;
    });
  };

  const queryEnabled =
    orderBookEnabled && marketId != null && marketId > 0 && networkId != null && networkId > 0;

  const {
    data: raw,
    isLoading,
    isError,
  } = useMyriadOrderBook(marketId, networkId, selectedOutcomeIndex, queryEnabled);

  const orderBook = useMemo(() => {
    const bids = raw?.bids ?? [];
    const asks = raw?.asks ?? [];
    let askRunningTotal = 0;
    const asksWithTotals = [...asks]
      .sort((a, b) => a.price - b.price)
      .map((ask) => {
        const levelUsd = calculateTotalCost(ask.size, ask.price);
        askRunningTotal += levelUsd;
        return { ...ask, total: askRunningTotal };
      });
    const sortedAsks = asksWithTotals.reverse();
    let bidRunningTotal = 0;
    const bidsWithTotals = [...bids]
      .sort((a, b) => a.price - b.price)
      .map((bid) => {
        const levelUsd = calculateTotalCost(bid.size, bid.price);
        bidRunningTotal += levelUsd;
        return { ...bid, total: bidRunningTotal };
      });
    const sortedBids = bidsWithTotals.reverse();
    return { bids: sortedBids, asks: sortedAsks };
  }, [raw]);

  const spread = useMemo(() => {
    if (orderBook.asks.length === 0 || orderBook.bids.length === 0) return 0;
    const bestAsk = orderBook.asks[orderBook.asks.length - 1]?.price ?? 0;
    const bestBid = orderBook.bids[0]?.price ?? 0;
    return bestAsk - bestBid;
  }, [orderBook]);

  const formatPriceCents = (price: number) => {
    const cents = price * 100;
    if (cents < 1) return `${cents.toFixed(1)}¢`;
    return `${cents.toFixed(2)}¢`;
  };

  const formatCurrency = (value: number, decimals = 2) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

  const selected = outcomeOptions.find((o) => o.index === selectedOutcomeIndex);
  const outcomeLabel = selected?.title ?? "Outcome";

  const errMsg = raw?.error;

  return (
    <div
      className={`w-full flex-shrink-0 flex flex-col min-h-0 ${
        effectiveExpanded ? "h-full" : "h-auto"
      }`}
    >
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
        {outcomeOptions.length <= 2 ? (
          <div className="hidden lg:flex gap-2">
            {outcomeOptions.map((o) => (
              <button
                key={o.index}
                type="button"
                onClick={() => onSelectOutcome(o.index)}
                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all ${
                  selectedOutcomeIndex === o.index
                    ? "bg-[#ffc000] text-black"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {o.title} {formatPriceCents(o.price)}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-white/50 uppercase tracking-wide">Order book outcome</label>
            <select
              value={selectedOutcomeIndex}
              onChange={(e) => onSelectOutcome(Number(e.target.value))}
              className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-xs text-white"
            >
              {outcomeOptions.map((o) => (
                <option key={o.index} value={o.index}>
                  {o.title} ({formatPriceCents(o.price)})
                </option>
              ))}
            </select>
          </div>
        )}
        {showDepthToggle ? (
          <div className="flex justify-center mt-3">
            <button
              type="button"
              onClick={toggleDepth}
              aria-expanded={depthExpanded}
              className="text-xs font-medium text-[#ffc000] hover:text-[#ffc000]/85 border border-white/20 rounded-md px-3 py-1.5 transition-colors"
            >
              {depthExpanded ? "Minimize" : "Show order book"}
            </button>
          </div>
        ) : null}
      </div>

      {effectiveExpanded ? (
        <div className="flex-1 overflow-y-auto min-h-0 rexmarkets-scroll-pane-y">
          <div className="px-2 py-2">
            {!orderBookEnabled ? (
              <div className="text-xs text-white/50 px-2 py-4 leading-relaxed">
                This market uses the <span className="text-white/70">AMM</span> (liquidity pool). Order book depth is
                only available for <span className="text-white/70">order-book</span> markets (executionMode 1). Use Buy
                / Sell to trade via quoted pool execution.
              </div>
            ) : null}
            {orderBookEnabled &&
            errMsg &&
            !isLoading &&
            orderBook.bids.length === 0 &&
            orderBook.asks.length === 0 ? (
              <div className="text-xs text-white/50 px-2 py-3 leading-relaxed">
                Order book unavailable for this market or outcome ({outcomeLabel}).{" "}
                <span className="text-white/40">Only order-book venues expose depth; you can still trade on Myriad.</span>
              </div>
            ) : null}
            {!orderBookEnabled ? null : (
              <>
            <div className="text-xs text-white/60 mb-2 px-2 flex justify-between">
              <span>Price (¢)</span>
              <span>Shares</span>
              <span>Total (USD)</span>
            </div>

            <div className="space-y-0.5 mb-4">
              <div className="text-xs font-semibold text-red-400 px-2 mb-1">Asks</div>
              {isLoading ? (
                <div className="text-xs text-white/60 px-2 py-1">Loading...</div>
              ) : isError ? (
                <div className="text-xs text-red-400 px-2 py-1">Error loading orders</div>
              ) : orderBook.asks.length > 0 ? (
                orderBook.asks.map((ask, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between text-xs px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20"
                  >
                    <span className="text-red-400 font-medium">{formatPrice(ask.price)}</span>
                    <span className="text-white/80">
                      {ask.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-white/60">{formatCurrency(ask.total)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-white/60 px-2 py-1">No asks</div>
              )}
            </div>

            {orderBook.bids.length > 0 && orderBook.asks.length > 0 && (
              <div className="text-xs text-center py-2 border-y border-white/10 flex flex-row items-center gap-1 justify-center">
                <div className="text-white/60">Spread</div>
                <div className="text-[#ffc000] font-semibold">{formatPrice(spread)}</div>
              </div>
            )}

            <div className="space-y-0.5 mt-4">
              <div className="text-xs font-semibold text-green-400 px-2 mb-1">Bids</div>
              {isLoading ? (
                <div className="text-xs text-white/60 px-2 py-1">Loading...</div>
              ) : isError ? (
                <div className="text-xs text-red-400 px-2 py-1">Error loading orders</div>
              ) : orderBook.bids.length > 0 ? (
                orderBook.bids.map((bid, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between text-xs px-2 py-0.5 bg-green-500/10 hover:bg-green-500/20"
                  >
                    <span className="text-green-400 font-medium">{formatPrice(bid.price)}</span>
                    <span className="text-white/80">
                      {bid.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-white/60">{formatCurrency(bid.total)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-white/60 px-2 py-1">No bids</div>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
