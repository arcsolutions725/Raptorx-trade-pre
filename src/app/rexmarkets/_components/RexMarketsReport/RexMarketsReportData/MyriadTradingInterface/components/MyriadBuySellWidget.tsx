"use client";

import { useState, useCallback, useMemo, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { formatPrice } from "@/utils/polymarketTrading";
import { formatCurrency, formatShares, toNumber } from "@/utils/format";
import { isValidSize, MIN_ORDER_SIZE } from "@/utils/validation";
import { useWallet } from "@/contexts/WalletContext";
import { useMyriadOrder } from "@/hooks/useMyriadOrder";
import { useMyriadAmmTrade } from "@/hooks/useMyriadAmmTrade";
import { useMyriadOrderBook } from "@/hooks/useMyriadOrderBook";
import { useMyriadCollateralBalance } from "@/hooks/useMyriadCollateralBalance";
import { useMyriadPortfolioShares } from "@/hooks/useMyriadPortfolioShares";
import {
  showSuccessNotification,
  showErrorNotification,
} from "@/components/ui/notification";
import LoginModal from "@/components/ui/modal/LoginModal";
import { Select, type SelectOption } from "@/components/ui/Select";
import { AmountField, PriceWell, SideSeg, TicketHead } from "../../shared/marketUi";
import "@/styles/pages/market-venues-b.css";
import {
  myriadBuyShareAmountWeiFromUsd,
  myriadPriceToWeiString,
  myriadSharesToWeiString,
} from "@/lib/myriad/orderBookEip712";

/** Buy tab: user enters collateral notional (USD); shares = amount / price. */
const MIN_BUY_USD = 0.01;

type OutcomeOpt = { index: number; title: string; price: number };

type MyriadBuySellWidgetProps = {
  /** executionMode === 1: CLOB signed orders; else AMM via POST /markets/quote + tx. */
  isOrderBook: boolean;
  tradeMarketId: number;
  networkId: number;
  /** Root GET /markets id for AMM quotes (`market_id` + `network_id`); avoids slug-only edge cases. */
  rootMyriadMarketId?: number;
  /** Market collateral ERC20 (`token.address` from Myriad) — enables auto-approve on AMM buys. */
  collateralTokenAddress?: string;
  collateralDecimals?: number;
  /** Collateral symbol from market details (e.g. USD1) — informational. */
  collateralSymbol?: string;
  outcomeOptions: OutcomeOpt[];
  selectedOutcomeIndex: number;
  onOutcomeIndexChange?: (idx: number) => void;
  marketTitle?: string;
  marketSlug: string;
  symbolImageUrl?: string;
};

export default function MyriadBuySellWidget({
  isOrderBook,
  tradeMarketId,
  networkId,
  rootMyriadMarketId,
  collateralTokenAddress,
  collateralDecimals = 18,
  collateralSymbol,
  outcomeOptions,
  selectedOutcomeIndex,
  onOutcomeIndexChange,
  marketTitle,
  marketSlug,
  symbolImageUrl,
}: MyriadBuySellWidgetProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("");
  const [multiSide, setMultiSide] = useState<0 | 1>(0);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { authenticated, ready } = usePrivy();
  const { ethersSigner } = useWallet();
  const { placeOrder, isSubmitting: isClobSubmitting } = useMyriadOrder(ethersSigner);
  const { executeAmmTrade, isSubmitting: isAmmSubmitting } = useMyriadAmmTrade(ethersSigner);
  const isSubmitting = isClobSubmitting || isAmmSubmitting;
  const amountId = `myriad-amount-${useId().replace(/:/g, "")}`;
  const queryClient = useQueryClient();

  const binaryMode = outcomeOptions.length <= 2;

  /** Label for “Available (…)” — matches market collateral symbol from API when present. */
  const buyBalanceLabel = collateralSymbol?.trim() || "collateral";

  const orderOutcomeId: 0 | 1 = useMemo(() => {
    if (binaryMode && outcomeOptions.length >= 2) {
      const second = outcomeOptions[1];
      if (second && selectedOutcomeIndex === second.index) return 1;
      return 0;
    }
    if (binaryMode && outcomeOptions.length === 1) return 0;
    return multiSide;
  }, [binaryMode, outcomeOptions, selectedOutcomeIndex, multiSide]);

  /** POST /markets/quote `outcome_id`: API outcome id (may differ from CLOB’s 0=Yes/1=No). */
  const ammOutcomeId = useMemo(() => {
    if (!binaryMode) return selectedOutcomeIndex;
    const first = outcomeOptions[0];
    const second = outcomeOptions[1];
    if (outcomeOptions.length >= 2 && second && selectedOutcomeIndex === second.index) {
      return second.index;
    }
    return first?.index ?? 0;
  }, [binaryMode, outcomeOptions, selectedOutcomeIndex]);

  const canShow =
    marketSlug.trim().length > 0 && networkId > 0 && (isOrderBook ? tradeMarketId > 0 : true);

  const collateralBalEnabled = Boolean(authenticated && canShow && collateralTokenAddress);
  const { data: collateralBalanceRaw, isLoading: collateralBalLoading } = useMyriadCollateralBalance(
    collateralTokenAddress,
    collateralDecimals,
    collateralBalEnabled
  );
  /** Always a finite number — avoids `data: null` skipping default `= 0` and string/cache quirks breaking `.toFixed` on Max. */
  const collateralBalance = toNumber(collateralBalanceRaw) ?? 0;

  const portfolioEnabled = Boolean(authenticated && canShow && marketSlug.trim());
  const { data: portfolioShares, isLoading: portfolioLoading } = useMyriadPortfolioShares(
    marketSlug,
    networkId,
    portfolioEnabled
  );

  const outcomeIdFirst = outcomeOptions[0]?.index;
  const outcomeIdSecond = outcomeOptions[1]?.index;
  const byOut = portfolioShares?.byOutcomeId ?? new Map<number, number>();
  const availableYesShares =
    typeof outcomeIdFirst === "number"
      ? (byOut.get(outcomeIdFirst) ?? 0)
      : (portfolioShares?.yes ?? 0);
  const availableNoShares =
    typeof outcomeIdSecond === "number"
      ? (byOut.get(outcomeIdSecond) ?? 0)
      : (portfolioShares?.no ?? 0);
  const sellAvailableShares = orderOutcomeId === 0 ? availableYesShares : availableNoShares;

  const isMyriadBuyButtonDisabled = useMemo(() => {
    if (activeTab !== "buy") return false;
    const n = parseFloat(size);
    if (size.trim() === "" || !Number.isFinite(n)) return true;
    if (n < MIN_BUY_USD) return true;
    if (authenticated && collateralTokenAddress && n > collateralBalance + 1e-9) return true;
    return false;
  }, [activeTab, size, authenticated, collateralTokenAddress, collateralBalance]);

  const isMyriadSellButtonDisabled = useMemo(() => {
    if (activeTab !== "sell") return false;
    const n = parseFloat(size);
    if (portfolioLoading) return true;
    if (sellAvailableShares <= 0) return true;
    if (size.trim() === "" || !Number.isFinite(n)) return true;
    if (n <= 0) return true;
    if (n > sellAvailableShares + 1e-9) return true;
    if (!isValidSize(n)) return true;
    return false;
  }, [activeTab, size, portfolioLoading, sellAvailableShares]);

  const handlePercentClick = useCallback(
    (percent: 25 | 50 | 75 | 100) => {
      if (activeTab === "buy") {
        const pct = percent / 100;
        const amount = Math.max(0, pct * collateralBalance);
        setSize(amount > 0 ? amount.toFixed(2) : "");
        return;
      }
      if (percent === 100) {
        setSize(
          sellAvailableShares > 0 ? String(Math.round(sellAvailableShares * 100) / 100) : ""
        );
        return;
      }
      const shares = Math.max(0, (percent / 100) * sellAvailableShares);
      setSize(shares > 0 ? String(Math.round(shares * 100) / 100) : "");
    },
    [activeTab, collateralBalance, sellAvailableShares]
  );

  const { data: obData } = useMyriadOrderBook(
    tradeMarketId > 0 ? tradeMarketId : null,
    networkId > 0 ? networkId : null,
    orderOutcomeId,
    isOrderBook && tradeMarketId > 0 && networkId > 0
  );

  const bestBid = useMemo(() => {
    const bids = obData?.bids ?? [];
    if (bids.length === 0) return null;
    return Math.max(...bids.map((b) => b.price));
  }, [obData?.bids]);

  const bestAsk = useMemo(() => {
    const asks = obData?.asks ?? [];
    if (asks.length === 0) return null;
    return Math.min(...asks.map((a) => a.price));
  }, [obData?.asks]);

  const refPrice = useMemo(() => {
    if (binaryMode) {
      if (orderOutcomeId === 1 && outcomeOptions.length >= 2) {
        return outcomeOptions[1]?.price ?? 0.5;
      }
      return outcomeOptions[0]?.price ?? 0.5;
    }
    const selected = outcomeOptions.find((o) => o.index === selectedOutcomeIndex);
    const p = selected?.price ?? 0.5;
    return multiSide === 0 ? p : Math.max(0.01, Math.min(0.99, 1 - p));
  }, [binaryMode, orderOutcomeId, outcomeOptions, multiSide, selectedOutcomeIndex]);

  const selectedTitle =
    outcomeOptions.find((o) => o.index === selectedOutcomeIndex)?.title ?? "Outcome";

  const handleTrade = useCallback(async () => {
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }
    if (!ready || networkId <= 0 || !marketSlug.trim()) {
      showErrorNotification("Trading unavailable", "Market is not ready to trade.");
      return;
    }
    if (isOrderBook && tradeMarketId <= 0) {
      showErrorNotification("Trading unavailable", "Missing on-chain market id for order-book trading.");
      return;
    }

    const sizeInput = parseFloat(size) || 0;

    /**
     * GTC (good-til-cancelled): order rests on the book until filled or you cancel it.
     * FAK would cancel any size that does not match immediately — those orders show as
     * CANCELLED in Open Orders with no taker role, which users read as the trade “closing”.
     * @see https://docs.myriad.markets/builders/myriad-order-book/order-book-api
     */
    const tif: "GTC" = "GTC";
    let price: number;
    let priceWei: string;

    if (activeTab === "buy") {
      const base = bestAsk ?? refPrice;
      price = Math.min(0.99, Math.max(0.01, base * 1.02));
    } else {
      const base = bestBid ?? refPrice;
      price = Math.max(0.01, Math.min(0.99, base * 0.98));
    }
    priceWei = myriadPriceToWeiString(price);

    if (priceWei === "0" || !Number.isFinite(price) || price <= 0 || price >= 1) {
      showErrorNotification("Invalid price", "Could not determine a valid price.");
      return;
    }

    let shares: number;
    let amountWei: string;

    if (activeTab === "buy") {
      if (sizeInput < MIN_BUY_USD) {
        showErrorNotification(
          "Invalid amount",
          `Minimum buy is $${MIN_BUY_USD} (collateral notional). For example enter 1 for about one dollar.`
        );
        return;
      }
      amountWei = myriadBuyShareAmountWeiFromUsd(priceWei, sizeInput);
      shares = sizeInput / price;
    } else {
      shares = sizeInput;
      if (!isValidSize(shares)) {
        showErrorNotification("Invalid size", `Size must be greater than ${MIN_ORDER_SIZE} shares.`);
        return;
      }
      amountWei = myriadSharesToWeiString(shares);
    }

    if (amountWei === "0") {
      showErrorNotification("Invalid size", "Amount too small after rounding.");
      return;
    }

    if (activeTab === "buy" && !isValidSize(shares)) {
      showErrorNotification(
        "Invalid size",
        `That amount yields fewer than ${MIN_ORDER_SIZE} shares at this price — increase the USD amount or price.`
      );
      return;
    }

    if (isOrderBook) {
      const side: 0 | 1 = activeTab === "buy" ? 0 : 1;
      const result = await placeOrder({
        marketId: tradeMarketId,
        outcomeId: orderOutcomeId,
        side,
        shares,
        price,
        priceWei,
        amountWei,
        timeInForce: tif,
        collateralTokenAddress: collateralTokenAddress?.trim(),
      });

      if (result.success) {
        const hashBit = result.orderHash ? `${result.orderHash.slice(0, 10)}… ` : "";
        showSuccessNotification(
          "Order submitted",
          `${hashBit}Limit order is on the book (GTC) until it fills or you cancel it.`
        );
        queryClient.invalidateQueries({ queryKey: ["myriad-orderbook"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-erc20-balance"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-user-portfolio"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-user-markets-modal"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-user-events"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-orders-history"] });
        setSize("");
      } else if (result.error) {
        showErrorNotification("Order failed", result.error);
      }
      return;
    }

    const useIdPath =
      typeof rootMyriadMarketId === "number" &&
      rootMyriadMarketId > 0 &&
      networkId > 0;
    const ammResult = await executeAmmTrade({
      marketSlug: marketSlug.trim(),
      marketId: useIdPath ? rootMyriadMarketId : undefined,
      networkId: useIdPath ? networkId : undefined,
      outcomeId: ammOutcomeId,
      action: activeTab === "buy" ? "buy" : "sell",
      value: activeTab === "buy" ? sizeInput : undefined,
      shares: activeTab === "sell" ? sizeInput : undefined,
      collateralTokenAddress,
      collateralDecimals,
      availableSharesCeiling: activeTab === "sell" ? sellAvailableShares : undefined,
    });
    if (ammResult.success) {
      showSuccessNotification(
        "Trade submitted",
        ammResult.txHash ? `Tx ${ammResult.txHash.slice(0, 10)}…` : "Transaction sent."
      );
      queryClient.invalidateQueries({ queryKey: ["myriad-erc20-balance"] });
      queryClient.invalidateQueries({ queryKey: ["myriad-user-portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["myriad-user-markets-modal"] });
      queryClient.invalidateQueries({ queryKey: ["myriad-user-events"] });
      queryClient.invalidateQueries({ queryKey: ["myriad-orders-history"] });
      setSize("");
    } else if (ammResult.error) {
      showErrorNotification("Trade failed", ammResult.error);
    }
  }, [
    authenticated,
    ready,
    isOrderBook,
    tradeMarketId,
    networkId,
    marketSlug,
    size,
    activeTab,
    bestAsk,
    bestBid,
    refPrice,
    orderOutcomeId,
    placeOrder,
    executeAmmTrade,
    queryClient,
    rootMyriadMarketId,
    ammOutcomeId,
    outcomeOptions,
    sellAvailableShares,
    collateralTokenAddress,
    collateralDecimals,
  ]);

  const buyCtaLabel = (() => {
    if (!binaryMode) return multiSide === 1 ? "No" : "Yes";
    const t = outcomeOptions[orderOutcomeId]?.title?.trim();
    if (t) return t.length > 20 ? `${t.slice(0, 20)}…` : t;
    return orderOutcomeId === 1 ? "No" : "Yes";
  })();

  /** Multi-outcome markets: outcome picker in the ticket row (same handler as the order book's picker). */
  const outcomeSelectOptions: SelectOption[] = outcomeOptions.map((o) => ({
    value: String(o.index),
    label: o.title,
  }));

  const pctDisabled =
    isSubmitting ||
    !authenticated ||
    (activeTab === "buy"
      ? !collateralTokenAddress || collateralBalance <= 0
      : sellAvailableShares <= 0 || portfolioLoading);

  return (
    <>
      <div className="mk-ticket">
        {/* Mini market head */}
        {marketTitle ? (
          <TicketHead
            imageUrl={symbolImageUrl || "/images/myriad.webp"}
            title={marketTitle}
            sub="Myriad"
          />
        ) : null}

        {/* Buy / Sell (and the outcome picker on multi-outcome markets) */}
        <div className="mk-ticket__row">
          <SideSeg value={activeTab} onChange={setActiveTab} />
          {!binaryMode ? (
            <Select
              value={String(selectedOutcomeIndex)}
              onChange={(v) => onOutcomeIndexChange?.(Number(v))}
              options={outcomeSelectOptions}
              placeholder="Outcome"
              className="mk-select"
              searchable
              searchPlaceholder="Search outcomes..."
            />
          ) : null}
        </div>

        {/* Outcome buttons: the two outcomes (binary) or Yes / No on the picked outcome */}
        {binaryMode ? (
          <div className="mk-yn" role="group" aria-label="Outcome">
            {outcomeOptions.map((o, idx) => {
              const selected = selectedOutcomeIndex === o.index;
              const label = o.title.length > 22 ? `${o.title.slice(0, 22)}…` : o.title;
              const tone = outcomeOptions.length === 2 && idx === 1 ? "rx-no" : "rx-yes";
              return (
                <button
                  key={o.index}
                  type="button"
                  onClick={() => onOutcomeIndexChange?.(o.index)}
                  className={`${tone} ${tone}--l${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  title={o.title}
                >
                  <span className="mkb-yn__name">{label}</span>{" "}
                  <span className="rx-num">{formatPrice(o.price)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mk-yn" role="group" aria-label={`Outcome: ${selectedTitle}`}>
            {(
              [
                { side: 0 as const, label: "Yes" },
                { side: 1 as const, label: "No" },
              ] as const
            ).map(({ side, label }) => {
              const selected = multiSide === side;
              const tone = side === 0 ? "rx-yes" : "rx-no";
              const selectedOpt = outcomeOptions.find((o) => o.index === selectedOutcomeIndex);
              const p = selectedOpt?.price ?? 0.5;
              const pNo = Math.max(0.01, Math.min(0.99, 1 - p));
              const px = side === 0 ? p : pNo;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => setMultiSide(side)}
                  className={`${tone} ${tone}--l${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                >
                  {label} <span className="rx-num">{formatPrice(px)}</span>
                </button>
              );
            })}
          </div>
        )}

        {!canShow ? (
          <p className="mkb-note">
            {networkId <= 0
              ? "Missing Myriad network id for this market."
              : !marketSlug.trim()
                ? "Missing market slug."
                : isOrderBook
                  ? "Could not resolve the on-chain market id for order-book orders."
                  : "Market is not ready to trade."}
          </p>
        ) : (
          <>
            <div className="mkb-stack">
              <PriceWell label="Current market price" value={formatPrice(refPrice)} />
              <p className="rx-help">
                {isOrderBook
                  ? "Order book (CLOB)"
                  : "AMM pool — trade uses quoted on-chain execution."}
              </p>
            </div>

            <div className="mkb-stack">
              <AmountField
                id={amountId}
                label={activeTab === "buy" ? "Amount ($)" : "Size (shares)"}
                aside={
                  activeTab === "buy" ? (
                    <>
                      Available ({buyBalanceLabel}):{" "}
                      <b>
                        {!authenticated
                          ? "—"
                          : collateralBalLoading
                            ? "…"
                            : collateralTokenAddress
                              ? formatCurrency(collateralBalance)
                              : "—"}
                      </b>
                    </>
                  ) : (
                    <>
                      Available: Yes <b>{formatShares(availableYesShares)}</b>, No{" "}
                      <b>{formatShares(availableNoShares)}</b>
                      {portfolioLoading ? " …" : null}
                    </>
                  )
                }
                prefix={activeTab === "buy" ? "$" : undefined}
                value={size}
                onChange={(v) => setSize(v.replace(/[^0-9.]/g, ""))}
                placeholder={activeTab === "buy" ? "0" : `Min ${MIN_ORDER_SIZE}`}
                pcts={([25, 50, 75, 100] as const).map((pct) => ({
                  label: pct === 100 ? "Max" : `${pct}%`,
                  onClick: () => handlePercentClick(pct),
                  disabled: pctDisabled,
                }))}
              />
              {activeTab === "buy" ? (
                <p className="rx-help">
                  Collateral notional ({buyBalanceLabel}). Shares ≈ amount ÷ price.
                </p>
              ) : null}
            </div>

            {bestBid != null || bestAsk != null ? (
              <dl className="mkb-kv">
                {bestBid != null && (
                  <div>
                    <dt>Best bid</dt>
                    <dd className="rx-num">{formatPrice(bestBid)}</dd>
                  </div>
                )}
                {bestAsk != null && (
                  <div>
                    <dt>Best ask</dt>
                    <dd className="rx-num">{formatPrice(bestAsk)}</dd>
                  </div>
                )}
              </dl>
            ) : null}

            <button
              type="button"
              disabled={
                isSubmitting ||
                !canShow ||
                isMyriadBuyButtonDisabled ||
                isMyriadSellButtonDisabled
              }
              onClick={() => void handleTrade()}
              className="rx-btn rx-btn--primary rx-btn--l rx-btn--block mk-ticket__cta"
            >
              {isSubmitting
                ? isOrderBook
                  ? "Signing…"
                  : "Confirm…"
                : activeTab === "buy"
                  ? `Buy ${buyCtaLabel}`
                  : "Sell"}
            </button>
          </>
        )}
      </div>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}
