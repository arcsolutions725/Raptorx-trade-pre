"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
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
import {
  myriadBuyShareAmountWeiFromUsd,
  myriadPriceToWeiString,
  myriadSharesToWeiString,
} from "@/lib/myriad/orderBookEip712";

function OutcomeCheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}
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

  const outcomeSlot = (idx: number) => {
    if (outcomeOptions.length === 2) return idx === 0 ? "yes" : "no";
    return "neutral";
  };

  const outcomePillClass = (slot: "yes" | "no" | "neutral", selected: boolean) => {
    if (!selected) {
      return "bg-gray-600 text-white hover:bg-gray-500 active:scale-[0.98]";
    }
    if (slot === "no") {
      return "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20";
    }
    return "bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-500/20";
  };

  const buyCtaLabel = (() => {
    if (!binaryMode) return multiSide === 1 ? "No" : "Yes";
    const t = outcomeOptions[orderOutcomeId]?.title?.trim();
    if (t) return t.length > 20 ? `${t.slice(0, 20)}…` : t;
    return orderOutcomeId === 1 ? "No" : "Yes";
  })();

  return (
    <>
      <div className="flex flex-col bg-[#050608]">
        {marketTitle ? (
          <div className="flex items-center gap-2 px-3 pt-3">
            {symbolImageUrl ? (
              <Image
                src={symbolImageUrl}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full object-cover p-0"
              />
            ) : (
              <Image
                src="/images/myriad.webp"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-lg object-cover p-0 opacity-90"
              />
            )}
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-white line-clamp-2">{marketTitle}</p>
          </div>
        ) : null}

        <div className={`flex border-b border-white/10 px-3 ${marketTitle ? "mt-2" : "pt-3"}`}>
          <button
            type="button"
            onClick={() => setActiveTab("buy")}
            className={`flex-1 px-2 py-2.5 text-sm font-semibold transition-colors rounded-t ${
              activeTab === "buy"
                ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sell")}
            className={`flex-1 px-2 py-2.5 text-sm font-semibold transition-colors rounded-t ${
              activeTab === "sell"
                ? "text-[#ffc000] border-b-2 border-[#ffc000] bg-black/30"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Sell
          </button>
        </div>

        {binaryMode ? (
          <div className="flex gap-3 bg-[#0a0a0a] p-3">
            {outcomeOptions.map((o, idx) => {
              const selected = selectedOutcomeIndex === o.index;
              const slot = outcomeSlot(idx);
              const label = o.title.length > 22 ? `${o.title.slice(0, 22)}…` : o.title;
              return (
                <button
                  key={o.index}
                  type="button"
                  onClick={() => onOutcomeIndexChange?.(o.index)}
                  className={`relative flex-1 rounded-lg px-2 py-2 font-semibold transition-all ${outcomePillClass(slot, selected)}`}
                >
                  <div className="flex flex-row items-center justify-center gap-2">
                    {selected ? <OutcomeCheckIcon /> : null}
                    <span className="min-w-0 truncate text-sm">{label}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{formatPrice(o.price)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 bg-[#0a0a0a] p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/40">Outcome</p>
            <div className="flex gap-3">
              {(
                [
                  { side: 0 as const, label: "Yes" },
                  { side: 1 as const, label: "No" },
                ] as const
              ).map(({ side, label }) => {
                const selected = multiSide === side;
                const slot = side === 0 ? "yes" : "no";
                const selectedOpt = outcomeOptions.find((o) => o.index === selectedOutcomeIndex);
                const p = selectedOpt?.price ?? 0.5;
                const pNo = Math.max(0.01, Math.min(0.99, 1 - p));
                const px = side === 0 ? p : pNo;
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setMultiSide(side)}
                    className={`relative flex-1 rounded-lg px-2 py-2 font-semibold transition-all ${outcomePillClass(slot, selected)}`}
                  >
                    <div className="flex flex-row items-center justify-center gap-2">
                      {selected ? <OutcomeCheckIcon /> : null}
                      <span className="text-sm">{label}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">{formatPrice(px)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-white/40">Market: {selectedTitle}</p>
          </div>
        )}

        <div className="p-3 space-y-3">
          {!canShow ? (
            <p className="text-xs text-white/50 leading-relaxed">
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
              <div className="rounded-lg bg-white/5 p-3">
                <p className="mb-1 text-xs text-white/60">Current Market Price</p>
                <p className="text-lg font-bold tabular-nums text-white">{formatPrice(refPrice)}</p>
                <p className="mt-1 text-[10px] text-white/35">
                  {isOrderBook ? "Order book (CLOB)" : "AMM pool — trade uses quoted on-chain execution."}
                </p>
              </div>

              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <label className="block text-sm text-white/80 shrink-0 pt-0.5">
                    {activeTab === "buy" ? "Amount ($)" : "Size (shares)"}
                  </label>
                  <div className="flex flex-col items-end min-w-0">
                    <span className="text-sm text-white/80 text-right">
                      {activeTab === "buy" ? (
                        <>
                          Available ({buyBalanceLabel}):{" "}
                          {!authenticated
                            ? "—"
                            : collateralBalLoading
                              ? "…"
                              : collateralTokenAddress
                                ? formatCurrency(collateralBalance)
                                : "—"}
                        </>
                      ) : (
                        <>
                          Available: Yes {formatShares(availableYesShares)}, No{" "}
                          {formatShares(availableNoShares)}
                          {portfolioLoading ? <span className="text-white/40"> …</span> : null}
                        </>
                      )}
                    </span>
                    <div className="flex flex-wrap justify-end gap-1 mt-1.5">
                      {([25, 50, 75, 100] as const).map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handlePercentClick(pct)}
                          disabled={
                            isSubmitting ||
                            !authenticated ||
                            (activeTab === "buy"
                              ? !collateralTokenAddress || collateralBalance <= 0
                              : sellAvailableShares <= 0 || portfolioLoading)
                          }
                          className="py-1 px-2 rounded border border-[#ffc000]/40 bg-white/5 text-white/90 text-[10px] font-medium hover:bg-white/10 hover:border-[#ffc000]/70 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-white/5 transition-colors"
                        >
                          {pct === 100 ? "Max" : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="relative">
                  {activeTab === "buy" ? (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 text-sm pointer-events-none">
                      $
                    </span>
                  ) : null}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={size}
                    onChange={(e) => setSize(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder={activeTab === "buy" ? "0" : `Min ${MIN_ORDER_SIZE}`}
                    className={`w-full rounded-xl border border-white/12 bg-[#0c0e12] py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#ffc000] focus:ring-1 focus:ring-[#ffc000]/25 ${
                      activeTab === "buy" ? "pl-7 pr-3" : "px-3"
                    }`}
                  />
                </div>
                {activeTab === "buy" ? (
                  <p className="mt-1 text-[10px] text-white/35">
                    Collateral notional ({buyBalanceLabel}). Shares ≈ amount ÷ price.
                  </p>
                ) : null}
              </div>

              <div className="space-y-0.5 text-[10px] text-white/40">
                {bestBid != null && (
                  <div className="flex justify-between">
                    <span>Best bid</span>
                    <span className="tabular-nums text-white/60">{formatPrice(bestBid)}</span>
                  </div>
                )}
                {bestAsk != null && (
                  <div className="flex justify-between">
                    <span>Best ask</span>
                    <span className="tabular-nums text-white/60">{formatPrice(bestAsk)}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={
                  isSubmitting ||
                  !canShow ||
                  isMyriadBuyButtonDisabled ||
                  isMyriadSellButtonDisabled
                }
                onClick={() => void handleTrade()}
                className={`w-full rounded-lg py-2.5 text-base font-bold transition-all active:scale-[0.98] disabled:pointer-events-none mt-10.5 ${
                  activeTab === "buy"
                    ? "bg-[#ffc000] text-black shadow-lg shadow-[#ffc000]/20 hover:bg-[#ffd000] hover:shadow-[#ffc000]/30 disabled:bg-[#ffc000]/30 disabled:text-white/70 disabled:opacity-50"
                    : "bg-red-600 text-white shadow-lg shadow-red-500/20 hover:bg-red-700 disabled:opacity-45"
                }`}
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
      </div>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}
