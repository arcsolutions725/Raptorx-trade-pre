"use client";

import { useMemo } from "react";
import { formatPrice } from "@/utils/polymarketTrading";
import { calculateTotalCost } from "@/utils/order";
import { useKalshiOrderBook } from "@/hooks/useKalshiOrderBook";
import type { OrderBookEntry } from "@/types/polymarketTrading";

type KalshiOrderBookProps = {
  marketTicker: string | null;
  yesPrice: number;
  noPrice: number;
  onBuyClick?: (outcome: "Yes" | "No") => void;
  selectedOutcome?: "Yes" | "No";
};

export default function KalshiOrderBook({
  marketTicker,
  yesPrice,
  noPrice,
  onBuyClick,
  selectedOutcome = "Yes",
}: KalshiOrderBookProps) {
  const {
    data: orderBookData,
    isLoading: isLoadingOrderBook,
    error: orderBookError,
  } = useKalshiOrderBook(marketTicker, selectedOutcome);

  const orderBook: { bids: OrderBookEntry[]; asks: OrderBookEntry[] } =
    useMemo(() => {
      if (!orderBookData) {
        return { bids: [], asks: [] };
      }

      // ----- ASKS (Sell YES) -----
      // Sort asks from lowest to highest, calculate cumulative totals upward,
      // then reverse to display highest to lowest
      let askRunningTotal = 0;
      const asksWithTotals = [...(orderBookData.asks || [])]
        .sort((a, b) => a.price - b.price)
        .map((ask) => {
          const levelUsd = calculateTotalCost(ask.size, ask.price);
          askRunningTotal += levelUsd;
          return {
            ...ask,
            total: askRunningTotal,
          };
        });
      const sortedAsks = asksWithTotals.reverse();

      // ----- BIDS (Buy YES) -----
      // Sort bids from lowest to highest, calculate cumulative totals upward,
      // then reverse to display highest to lowest
      let bidRunningTotal = 0;
      const bidsWithTotals = [...(orderBookData.bids || [])]
        .sort((a, b) => a.price - b.price)
        .map((bid) => {
          const levelUsd = calculateTotalCost(bid.size, bid.price);
          bidRunningTotal += levelUsd;
          return {
            ...bid,
            total: bidRunningTotal,
          };
        });
      const sortedBids = bidsWithTotals.reverse();

      return {
        bids: sortedBids,
        asks: sortedAsks,
      };
    }, [orderBookData]);

  // Format price for display (in cents)
  const formatPriceCents = (price: number): string => {
    const cents = price * 100;
    if (cents < 1) {
      return `${cents.toFixed(1)}¢`;
    }
    return `${cents.toFixed(2)}¢`;
  };

  // Format currency with commas
  const formatCurrencyWithCommas = (value: number, decimals = 2): string => {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  };

  // Calculate spread
  const spread = useMemo(() => {
    if (orderBook.asks.length === 0 || orderBook.bids.length === 0) {
      return 0;
    }
    const bestAsk = orderBook.asks[orderBook.asks.length - 1]?.price || 0;
    const bestBid = orderBook.bids[0]?.price || 0;
    return bestAsk - bestBid;
  }, [orderBook]);

  return (
    <div className="w-full flex-shrink-0 flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
        {/* Outcome Buttons Header */}
        <div className="flex gap-2">
          <button
            onClick={() => onBuyClick?.("Yes")}
            className={`flex-1 py-1.5 px-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded transition-all text-xs ${
              selectedOutcome === "Yes" ? "opacity-100" : "opacity-50"
            }`}
          >
            Buy Yes {formatPriceCents(yesPrice)}
          </button>
          <button
            onClick={() => onBuyClick?.("No")}
            className={`flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded transition-all text-xs ${
              selectedOutcome === "No" ? "opacity-100" : "opacity-50"
            }`}
          >
            Buy No {formatPriceCents(noPrice)}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-select-scrollbar">
        <div className="px-2 py-2">
          <div className="text-xs text-white/60 mb-2 px-2 flex justify-between">
            <span>Price (¢)</span>
            <span>Shares</span>
            <span>Total (USD)</span>
          </div>

          {/* Asks (Sell Orders) - Top */}
          <div className="space-y-0.5 mb-4">
            <div className="text-xs font-semibold text-red-400 px-2 mb-1">
              Asks {selectedOutcome === "Yes" ? "(Sell Yes)" : "(Sell No)"}
            </div>
            {isLoadingOrderBook ? (
              <div className="text-xs text-white/60 px-2 py-1">Loading...</div>
            ) : orderBookError ? (
              <div className="text-xs text-red-400 px-2 py-1">
                Error loading orders
              </div>
            ) : orderBook.asks.length > 0 ? (
              orderBook.asks.map((ask, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-xs px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 cursor-pointer"
                >
                  <span className="text-red-400 font-medium">
                    {formatPrice(ask.price)}
                  </span>
                  <span className="text-white/80">
                    {ask.size.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-white/60">
                    {formatCurrencyWithCommas(ask.total)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-white/60 px-2 py-1">No asks</div>
            )}
          </div>

          {/* Spread */}
          {orderBook.bids.length > 0 && orderBook.asks.length > 0 && (
            <div className="text-xs text-center py-2 border-y border-white/10 flex flex-row items-center gap-1 justify-center">
              <div className="text-white/60">Spread</div>
              <div className="text-[#ffc000] font-semibold">
                {formatPrice(spread)}
              </div>
            </div>
          )}

          {/* Bids (Buy Orders) - Bottom */}
          <div className="space-y-0.5 mt-4">
            <div className="text-xs font-semibold text-green-400 px-2 mb-1">
              Bids {selectedOutcome === "Yes" ? "(Buy Yes)" : "(Buy No)"}
            </div>
            {isLoadingOrderBook ? (
              <div className="text-xs text-white/60 px-2 py-1">Loading...</div>
            ) : orderBookError ? (
              <div className="text-xs text-red-400 px-2 py-1">
                Error loading orders
              </div>
            ) : orderBook.bids.length > 0 ? (
              orderBook.bids.map((bid, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-xs px-2 py-0.5 bg-green-500/10 hover:bg-green-500/20 cursor-pointer"
                >
                  <span className="text-green-400 font-medium">
                    {formatPrice(bid.price)}
                  </span>
                  <span className="text-white/80">
                    {bid.size.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-white/60">
                    {formatCurrencyWithCommas(bid.total)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-white/60 px-2 py-1">No bids</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
