"use client";

import { useMemo, useState } from "react";
import { useLimitlessOrderBook } from "@/hooks/useLimitlessOrderBook";
import { formatPrice } from "@/utils/polymarketTrading";

// Limitless API returns size in base units (e.g. minSize "100000000" = 1 share)
const SIZE_DIVISOR = 1e8;

type LimitlessOrderBookProps = {
  marketSlug: string | null;
  yesPrice: number;
  noPrice: number;
  onBuyClick?: (outcome: "Yes" | "No") => void;
  selectedOutcome?: "Yes" | "No";
  onDepthExpandedChange?: (expanded: boolean) => void;
  showDepthToggle?: boolean;
};

type OrderBookRow = { price: number; size: number; total: number };

export default function LimitlessOrderBook({
  marketSlug,
  yesPrice,
  noPrice,
  onBuyClick,
  selectedOutcome = "Yes",
  onDepthExpandedChange,
  showDepthToggle = true,
}: LimitlessOrderBookProps) {
  const [depthExpanded, setDepthExpanded] = useState(true);
  const effectiveExpanded = showDepthToggle ? depthExpanded : true;

  const toggleDepth = () => {
    setDepthExpanded((prev) => {
      const next = !prev;
      onDepthExpandedChange?.(next);
      return next;
    });
  };

  const {
    data: rawData,
    isLoading: isLoadingOrderBook,
    error: orderBookError,
  } = useLimitlessOrderBook(marketSlug);

  const orderBook: { bids: OrderBookRow[]; asks: OrderBookRow[] } = useMemo(() => {
    if (!rawData) return { bids: [], asks: [] };

    const toDisplaySize = (rawSize: number) => Number(rawSize) / SIZE_DIVISOR;
    const levelUsd = (size: number, price: number) => toDisplaySize(size) * price;

    let askRunningTotal = 0;
    const asksWithTotals = [...(rawData.asks || [])]
      .sort((a, b) => a.price - b.price)
      .map((ask) => {
        const usd = levelUsd(ask.size, ask.price);
        askRunningTotal += usd;
        return {
          price: ask.price,
          size: toDisplaySize(ask.size),
          total: askRunningTotal,
        };
      });
    const sortedAsks = asksWithTotals.reverse();

    let bidRunningTotal = 0;
    const bidsWithTotals = [...(rawData.bids || [])]
      .sort((a, b) => a.price - b.price)
      .map((bid) => {
        const usd = levelUsd(bid.size, bid.price);
        bidRunningTotal += usd;
        return {
          price: bid.price,
          size: toDisplaySize(bid.size),
          total: bidRunningTotal,
        };
      });
    const sortedBids = bidsWithTotals.reverse();

    return { bids: sortedBids, asks: sortedAsks };
  }, [rawData]);

  const formatPriceCents = (price: number): string => {
    const cents = price * 100;
    if (cents < 1) return `${cents.toFixed(1)}¢`;
    return `${cents.toFixed(2)}¢`;
  };

  const formatCurrency = (value: number, decimals = 2): string =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

  const spread = useMemo(() => {
    if (orderBook.asks.length === 0 || orderBook.bids.length === 0) return 0;
    const bestAsk = orderBook.asks[orderBook.asks.length - 1]?.price ?? 0;
    const bestBid = orderBook.bids[0]?.price ?? 0;
    return bestAsk - bestBid;
  }, [orderBook]);

  return (
    <div
      className={`w-full flex-shrink-0 flex flex-col min-h-0 ${
        effectiveExpanded ? "h-full" : "h-auto"
      }`}
    >
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
        <div className="hidden lg:flex gap-2">
          <button
            type="button"
            onClick={() => onBuyClick?.("Yes")}
            className={`flex-1 py-1.5 px-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded transition-all text-xs ${
              selectedOutcome === "Yes" ? "opacity-100" : "opacity-50"
            }`}
          >
            Buy Yes {formatPriceCents(yesPrice)}
          </button>
          <button
            type="button"
            onClick={() => onBuyClick?.("No")}
            className={`flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded transition-all text-xs ${
              selectedOutcome === "No" ? "opacity-100" : "opacity-50"
            }`}
          >
            Buy No {formatPriceCents(noPrice)}
          </button>
        </div>
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
          <div className="text-xs text-white/60 mb-2 px-2 flex justify-between">
            <span>Price (¢)</span>
            <span>Shares</span>
            <span>Total (USD)</span>
          </div>

          <div className="space-y-0.5 mb-4">
            <div className="text-xs font-semibold text-red-400 px-2 mb-1">
              Asks {selectedOutcome === "Yes" ? "(Sell Yes)" : "(Sell No)"}
            </div>
            {isLoadingOrderBook ? (
              <div className="text-xs text-white/60 px-2 py-1">Loading...</div>
            ) : orderBookError ? (
              <div className="text-xs text-red-400 px-2 py-1">Error loading orders</div>
            ) : orderBook.asks.length > 0 ? (
              orderBook.asks.map((ask, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-xs px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 cursor-pointer"
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
            <div className="text-xs font-semibold text-green-400 px-2 mb-1">
              Bids {selectedOutcome === "Yes" ? "(Buy Yes)" : "(Buy No)"}
            </div>
            {isLoadingOrderBook ? (
              <div className="text-xs text-white/60 px-2 py-1">Loading...</div>
            ) : orderBookError ? (
              <div className="text-xs text-red-400 px-2 py-1">Error loading orders</div>
            ) : orderBook.bids.length > 0 ? (
              orderBook.bids.map((bid, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-xs px-2 py-0.5 bg-green-500/10 hover:bg-green-500/20 cursor-pointer"
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
        </div>
      </div>
      ) : null}
    </div>
  );
}
