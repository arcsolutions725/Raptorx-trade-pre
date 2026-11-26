"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/utils/polymarketTrading";
import { calculateTotalCost } from "@/utils/order";
import { useMyriadOrderBook } from "@/hooks/useMyriadOrderBook";
import { OutcomeTabs } from "../../shared/marketUi";
import "@/styles/pages/market-venues-b.css";

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
    <div className={`mk-ob${effectiveExpanded ? " mk-ob--full" : ""}`}>
      {/* Multi-outcome markets: pick which outcome's book to show */}
      {outcomeOptions.length > 2 ? (
        <OutcomeTabs
          items={outcomeOptions.map((o) => ({
            key: String(o.index),
            label: `${o.title} ${formatPriceCents(o.price)}`,
          }))}
          selectedIndex={Math.max(
            0,
            outcomeOptions.findIndex((o) => o.index === selectedOutcomeIndex)
          )}
          onSelect={(i) => {
            const o = outcomeOptions[i];
            if (o) onSelectOutcome(o.index);
          }}
        />
      ) : null}

      <div className="mk-ob__top">
        {/* Binary markets: outcome picker — desktop only (phones use the trade ticket) */}
        {outcomeOptions.length <= 2 ? (
          <div className="mk-ob__buy" role="group" aria-label="Order book outcome">
            {outcomeOptions.map((o, i) => (
              <button
                key={o.index}
                type="button"
                onClick={() => onSelectOutcome(o.index)}
                className={`${i === 1 ? "rx-no" : "rx-yes"}${
                  selectedOutcomeIndex === o.index ? " is-selected" : ""
                }`}
                aria-pressed={selectedOutcomeIndex === o.index}
                title={o.title}
              >
                <span className="mkb-ob-name">{o.title}</span>{" "}
                <span className="rx-num">{formatPriceCents(o.price)}</span>
              </button>
            ))}
          </div>
        ) : null}
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
          {!orderBookEnabled ? (
            <p className="mk-ob__msg mkb-ob-note">
              This market uses the <b>AMM</b> (liquidity pool). Order book depth is only available for{" "}
              <b>order-book</b> markets (executionMode 1). Use Buy / Sell to trade via quoted pool
              execution.
            </p>
          ) : null}
          {orderBookEnabled &&
          errMsg &&
          !isLoading &&
          orderBook.bids.length === 0 &&
          orderBook.asks.length === 0 ? (
            <p className="mk-ob__msg mkb-ob-note">
              Order book unavailable for this market or outcome ({outcomeLabel}).{" "}
              <span>Only order-book venues expose depth; you can still trade on Myriad.</span>
            </p>
          ) : null}
          {!orderBookEnabled ? null : (
            <>
              <div className="mk-ob__cols" aria-hidden="true">
                <span>Price (¢)</span>
                <span>Shares</span>
                <span>Total (USD)</span>
              </div>

              {/* Asks (sell orders) - top */}
              <div className="mk-ob__group mk-ob__group--ask">
                <div className="mk-ob__label">Asks</div>
                {isLoading ? (
                  <div className="mk-ob__msg">Loading...</div>
                ) : isError ? (
                  <div className="mk-ob__msg mk-ob__msg--error">Error loading orders</div>
                ) : orderBook.asks.length > 0 ? (
                  orderBook.asks.map((ask, idx) => (
                    <div key={idx} className="mk-ob__row">
                      <span>{formatPrice(ask.price)}</span>
                      <span>{ask.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>{formatCurrency(ask.total)}</span>
                    </div>
                  ))
                ) : (
                  <div className="mk-ob__msg">No asks</div>
                )}
              </div>

              {/* Spread */}
              {orderBook.bids.length > 0 && orderBook.asks.length > 0 ? (
                <div className="mk-ob__spread">
                  Spread <b>{formatPrice(spread)}</b>
                </div>
              ) : (
                <div className="mk-ob__spread" aria-hidden="true" />
              )}

              {/* Bids (buy orders) - bottom */}
              <div className="mk-ob__group mk-ob__group--bid">
                <div className="mk-ob__label">Bids</div>
                {isLoading ? (
                  <div className="mk-ob__msg">Loading...</div>
                ) : isError ? (
                  <div className="mk-ob__msg mk-ob__msg--error">Error loading orders</div>
                ) : orderBook.bids.length > 0 ? (
                  orderBook.bids.map((bid, idx) => (
                    <div key={idx} className="mk-ob__row">
                      <span>{formatPrice(bid.price)}</span>
                      <span>{bid.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>{formatCurrency(bid.total)}</span>
                    </div>
                  ))
                ) : (
                  <div className="mk-ob__msg">No bids</div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
