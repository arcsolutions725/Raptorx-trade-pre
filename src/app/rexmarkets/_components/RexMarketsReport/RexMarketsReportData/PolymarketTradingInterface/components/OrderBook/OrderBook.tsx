"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/utils/polymarketTrading";
import { calculateTotalCost } from "@/utils/order";
import { useOrderBook } from "@/hooks/useOrderBook";
import type { OrderBookEntry } from "@/types/polymarketTrading";

type OrderBookProps = {
  clobTokenId: string | null;
  yesPrice: number;
  noPrice: number;
  onBuyClick?: (outcome: "Yes" | "No") => void;
  selectedOutcome?: "Yes" | "No";
  /** When provided, called whenever the bid/ask depth table is expanded or collapsed (mobile layout uses this to drop min-height). */
  onDepthExpandedChange?: (expanded: boolean) => void;
  /** Mobile-only: show Minimize / Show order book. Desktop order books should pass false. */
  showDepthToggle?: boolean;
};

export default function OrderBook({
  clobTokenId,
  yesPrice,
  noPrice,
  onBuyClick,
  selectedOutcome = "Yes",
  onDepthExpandedChange,
  showDepthToggle = true,
}: OrderBookProps) {
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
    data: orderBookData,
    isLoading: isLoadingOrderBook,
    error: orderBookError,
  } = useOrderBook(clobTokenId);

  const orderBook: { bids: OrderBookEntry[]; asks: OrderBookEntry[] } =
    useMemo(() => {
      if (!orderBookData) {
        return { bids: [], asks: [] };
      }

      // ----- ASKS (Sell YES) -----
      // Sort asks from lowest to highest, calculate cumulative totals upward,
      // then reverse to display highest to lowest (99.9¢, 99.8¢, ... 0.6¢)
      // Each row's total = cumulative from that price level downward
      let askRunningTotal = 0;
      const asksWithTotals = [...(orderBookData.asks || [])]
        .sort((a, b) => a.price - b.price) // sort lowest to highest first
        .map((ask) => {
          const levelUsd = calculateTotalCost(ask.size, ask.price);
          askRunningTotal += levelUsd;
          return {
            ...ask,
            total: askRunningTotal,
          };
        });
      // Reverse to show highest price first, but totals now represent cumulative downward
      const sortedAsks = asksWithTotals.reverse();

      // ----- BIDS (Buy YES) -----
      // Sort bids from lowest to highest, calculate cumulative totals upward,
      // then reverse to display highest to lowest
      // Each row's total = cumulative from that price level downward
      let bidRunningTotal = 0;
      const bidsWithTotals = [...(orderBookData.bids || [])]
        .sort((a, b) => a.price - b.price) // sort lowest to highest first
        .map((bid) => {
          const levelUsd = calculateTotalCost(bid.size, bid.price);
          bidRunningTotal += levelUsd;
          return {
            ...bid,
            total: bidRunningTotal,
          };
        });
      // Reverse to show highest price first, but totals now represent cumulative downward
      const sortedBids = bidsWithTotals.reverse();

      return {
        bids: sortedBids,
        asks: sortedAsks,
      };
    }, [orderBookData]);

  // Calculate percentages
  const yesPercentage = useMemo(() => {
    if (orderBook.bids.length === 0) return 0;
    const totalBids = orderBook.bids.reduce((sum, b) => sum + b.size, 0);
    const totalAsks = orderBook.asks.reduce((sum, a) => sum + a.size, 0);
    const total = totalBids + totalAsks;
    return total > 0 ? Math.round((totalBids / total) * 100) : 0;
  }, [orderBook]);

  const noPercentage = useMemo(() => {
    if (orderBook.asks.length === 0) return 0;
    const totalBids = orderBook.bids.reduce((sum, b) => sum + b.size, 0);
    const totalAsks = orderBook.asks.reduce((sum, a) => sum + a.size, 0);
    const total = totalBids + totalAsks;
    return total > 0 ? Math.round((totalAsks / total) * 100) : 0;
  }, [orderBook]);

  // Calculate chance percentages from prices
  const yesChance = useMemo(() => {
    return Math.round(yesPrice * 100);
  }, [yesPrice]);

  const noChance = useMemo(() => {
    return Math.round(noPrice * 100);
  }, [noPrice]);

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

  return (
    <div className={`mk-ob${effectiveExpanded ? " mk-ob--full" : ""}`}>
      <div className="mk-ob__top">
        {/* Outcome Buttons Header — desktop only (mobile uses Buy/Sell widget) */}
        <div className="mk-ob__buy">
          <button
            type="button"
            onClick={() => onBuyClick?.("Yes")}
            className={`rx-yes${selectedOutcome === "Yes" ? " is-selected" : ""}`}
            aria-pressed={selectedOutcome === "Yes"}
          >
            Buy Yes <span className="rx-num">{formatPriceCents(yesPrice)}</span>
          </button>
          <button
            type="button"
            onClick={() => onBuyClick?.("No")}
            className={`rx-no${selectedOutcome === "No" ? " is-selected" : ""}`}
            aria-pressed={selectedOutcome === "No"}
          >
            Buy No <span className="rx-num">{formatPriceCents(noPrice)}</span>
          </button>
        </div>
        {showDepthToggle ? (
          <button
            type="button"
            onClick={toggleDepth}
            aria-expanded={depthExpanded}
            className="rx-btn rx-btn--secondary rx-btn--s mk-ob__toggle"
          >
            {depthExpanded ? "Minimize" : "Show order book"}
          </button>
        ) : null}
      </div>

      {effectiveExpanded ? (
      <div className="mk-ob__body">
        <div className="mk-ob__cols" aria-hidden="true">
          <span>Price (¢)</span>
          <span>Shares</span>
          <span>Total (USD)</span>
        </div>

        {/* Asks (Sell Orders) - Top */}
        <div className="mk-ob__group mk-ob__group--ask">
          <div className="mk-ob__label">
            Asks {selectedOutcome === "Yes" ? "(Sell Yes)" : "(Sell No)"}
          </div>
          {isLoadingOrderBook ? (
            <div className="mk-ob__msg">Loading...</div>
          ) : orderBookError ? (
            <div className="mk-ob__msg mk-ob__msg--error">
              Error loading orders
            </div>
          ) : orderBook.asks.length > 0 ? (
            orderBook.asks.map((ask, idx) => (
              <div key={idx} className="mk-ob__row">
                <span>{formatPrice(ask.price)}</span>
                <span>
                  {ask.size.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span>{formatCurrencyWithCommas(ask.total)}</span>
              </div>
            ))
          ) : (
            <div className="mk-ob__msg">No asks</div>
          )}
        </div>

        {/* Spread */}
        {orderBook.bids.length > 0 &&
        orderBook.asks.length > 0 &&
        orderBookData ? (
          <div className="mk-ob__spread">
            Spread <b>{formatPrice(orderBookData.spread || 0)}</b>
            {orderBookData.spreadPercent ? (
              <span className="rx-num">
                ({orderBookData.spreadPercent.toFixed(2)}%)
              </span>
            ) : null}
          </div>
        ) : (
          <div className="mk-ob__spread" aria-hidden="true" />
        )}

        {/* Bids (Buy Orders) - Bottom */}
        <div className="mk-ob__group mk-ob__group--bid">
          <div className="mk-ob__label">
            Bids {selectedOutcome === "Yes" ? "(Buy Yes)" : "(Buy No)"}
          </div>
          {isLoadingOrderBook ? (
            <div className="mk-ob__msg">Loading...</div>
          ) : orderBookError ? (
            <div className="mk-ob__msg mk-ob__msg--error">
              Error loading orders
            </div>
          ) : orderBook.bids.length > 0 ? (
            orderBook.bids.map((bid, idx) => (
              <div key={idx} className="mk-ob__row">
                <span>{formatPrice(bid.price)}</span>
                <span>
                  {bid.size.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span>{formatCurrencyWithCommas(bid.total)}</span>
              </div>
            ))
          ) : (
            <div className="mk-ob__msg">No bids</div>
          )}
        </div>
      </div>
      ) : null}
    </div>
  );
}
