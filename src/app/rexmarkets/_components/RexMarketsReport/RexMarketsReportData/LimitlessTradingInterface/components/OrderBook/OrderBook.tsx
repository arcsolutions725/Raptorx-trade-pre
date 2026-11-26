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
    <div className={`mk-ob${effectiveExpanded ? " mk-ob--full" : ""}`}>
      <div className="mk-ob__top">
        {/* Outcome buttons — desktop only (mobile uses the Buy/Sell widget) */}
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

        <div className="mk-ob__group mk-ob__group--ask">
          <div className="mk-ob__label">
            Asks {selectedOutcome === "Yes" ? "(Sell Yes)" : "(Sell No)"}
          </div>
          {isLoadingOrderBook ? (
            <div className="mk-ob__msg">Loading...</div>
          ) : orderBookError ? (
            <div className="mk-ob__msg mk-ob__msg--error">Error loading orders</div>
          ) : orderBook.asks.length > 0 ? (
            orderBook.asks.map((ask, idx) => (
              <div key={idx} className="mk-ob__row">
                <span>{formatPrice(ask.price)}</span>
                <span>
                  {ask.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span>{formatCurrency(ask.total)}</span>
              </div>
            ))
          ) : (
            <div className="mk-ob__msg">No asks</div>
          )}
        </div>

        {orderBook.bids.length > 0 && orderBook.asks.length > 0 ? (
          <div className="mk-ob__spread">
            Spread <b>{formatPrice(spread)}</b>
          </div>
        ) : (
          <div className="mk-ob__spread" aria-hidden="true" />
        )}

        <div className="mk-ob__group mk-ob__group--bid">
          <div className="mk-ob__label">
            Bids {selectedOutcome === "Yes" ? "(Buy Yes)" : "(Buy No)"}
          </div>
          {isLoadingOrderBook ? (
            <div className="mk-ob__msg">Loading...</div>
          ) : orderBookError ? (
            <div className="mk-ob__msg mk-ob__msg--error">Error loading orders</div>
          ) : orderBook.bids.length > 0 ? (
            orderBook.bids.map((bid, idx) => (
              <div key={idx} className="mk-ob__row">
                <span>{formatPrice(bid.price)}</span>
                <span>
                  {bid.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span>{formatCurrency(bid.total)}</span>
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
