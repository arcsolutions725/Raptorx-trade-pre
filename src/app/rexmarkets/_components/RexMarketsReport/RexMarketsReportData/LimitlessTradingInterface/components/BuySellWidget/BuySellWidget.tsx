"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "@/utils/polymarketTrading";
import { formatShares, formatCurrency } from "@/utils/format";
import { isValidSize, MIN_ORDER_SIZE, LIMITLESS_MIN_ORDER_USD } from "@/utils/validation";
import { isValidPriceCents } from "@/utils/validation";
import { useWallet } from "@/contexts/WalletContext";
import { useLimitlessAuth } from "@/hooks/useLimitlessAuth";
import { useLimitlessOrder } from "@/hooks/useLimitlessOrder";
import { useLimitlessUsdcApproval } from "@/hooks/useLimitlessUsdcApproval";
import {
  showSuccessNotification,
  showErrorNotification,
} from "@/components/ui/notification";
import LoginModal from "@/components/ui/modal/LoginModal";
import { Select, type SelectOption } from "@/components/ui/Select";

const LIMITLESS_ACCENT = "#ffc000";

export type LimitlessVenue = { exchange: string; adapter?: string };

/** One market option when event has multiple markets (for dropdown) */
export type LimitlessMarketOption = {
  slug: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  venue: LimitlessVenue | null;
  positionIds: string[] | null;
};

type BuySellWidgetProps = {
  currentYesPrice: number;
  currentNoPrice: number;
  onBuyClick?: (outcome: "Yes" | "No") => void;
  onSellClick?: (outcome: "Yes" | "No") => void;
  symbolImageUrl?: string;
  marketTitle?: string;
  marketSlug?: string;
  venue?: LimitlessVenue | null;
  positionIds?: string[] | null;
  /** List of markets for dropdown (when event has multiple markets). When length > 1, market Select is shown. */
  marketsForTrading?: LimitlessMarketOption[];
  /** Index of selected market in marketsForTrading. */
  selectedMarketIndex?: number;
  /** Called when user selects a different market in the dropdown. */
  onMarketIndexChange?: (index: number) => void;
  /** Available shares for sell (per selected outcome). When Sell is selected, shown as "Available shares: X.XX" */
  availableShares?: number;
  /** Available Yes shares for this market (from positions). When provided, Sell tab shows Yes price only if > 0. */
  availableYesShares?: number;
  /** Available No shares for this market (from positions). When provided, Sell tab shows No price only if > 0. */
  availableNoShares?: number;
  /** USDC balance (numeric) for 25%/50%/75%/Max on Buy. Optional. */
  usdcBalance?: number;
  /** Formatted USDC string for display (e.g. "1.00"). Optional. */
  usdcBalanceFormatted?: string;
  /** Formatted native balance on Base for display (e.g. "0.05"). Optional. */
  nativeBalanceFormatted?: string;
  /** Label for native balance, e.g. "Base". Shown as (X.XX Base). Optional. */
  nativeLabel?: string;
  /** When opening in a modal, pre-select this outcome (e.g. from order book click). */
  initialOutcome?: "Yes" | "No";
};

export default function BuySellWidget({
  currentYesPrice,
  currentNoPrice,
  onBuyClick,
  onSellClick,
  symbolImageUrl,
  marketTitle,
  marketSlug,
  venue,
  positionIds,
  marketsForTrading = [],
  selectedMarketIndex = 0,
  onMarketIndexChange,
  availableShares: availableSharesProp = 0,
  availableYesShares = 0,
  availableNoShares = 0,
  usdcBalance = 0,
  usdcBalanceFormatted = "0.00",
  nativeBalanceFormatted = "0",
  nativeLabel = "Base",
  initialOutcome,
}: BuySellWidgetProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [selectedOutcome, setSelectedOutcome] = useState<"Yes" | "No" | null>(initialOutcome ?? null);
  const [size, setSize] = useState("");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (initialOutcome) setSelectedOutcome(initialOutcome);
  }, [initialOutcome]);

  const marketOptions: SelectOption[] = useMemo(() => {
    if (marketsForTrading.length > 0) {
      return marketsForTrading.map((m, index) => ({
        value: String(index),
        label: m.title,
      }));
    }
    return [];
  }, [marketsForTrading]);

  const selectedMarketValue = useMemo(() => {
    if (marketsForTrading.length > 0) {
      const idx = Math.max(0, Math.min(selectedMarketIndex, marketsForTrading.length - 1));
      return String(idx);
    }
    return "0";
  }, [marketsForTrading.length, selectedMarketIndex]);

  const handleMarketChange = useCallback(
    (value: string) => {
      if (marketsForTrading.length > 0 && onMarketIndexChange) {
        const index = parseInt(value, 10);
        if (!isNaN(index) && index >= 0 && index < marketsForTrading.length) {
          onMarketIndexChange(index);
        }
      }
    },
    [marketsForTrading.length, onMarketIndexChange],
  );

  const queryClient = useQueryClient();
  const { ethersSigner, authenticated, eoaAddress } = useWallet();
  const { ownerId, user, login, isLoading: isAuthLoading, error: authError } = useLimitlessAuth(ethersSigner);
  const orderCostUsd = activeTab === "buy" && selectedOutcome
    ? (parseFloat(size) || 0)
    : 0;
  const { hasEnoughAllowance, approve: ensureUsdcApproval, isApproving: isUsdcApproving } = useLimitlessUsdcApproval(
    eoaAddress ?? undefined,
    venue?.exchange ?? null,
    orderCostUsd
  );
  const { submitOrder, isSubmitting } = useLimitlessOrder(
    ethersSigner,
    venue ?? null,
    positionIds ?? null,
    ownerId,
    user?.rank?.feeRateBps ?? 0
  );

  const canTrade = !!marketSlug && !!venue?.exchange && !!positionIds?.length;

  // Sell tab: show Yes/No prices only for outcomes with available contracts; otherwise 0 (Limitless-style). Buy tab: use market prices.
  const sellYesPrice = (availableYesShares ?? 0) > 0 ? currentYesPrice : 0;
  const sellNoPrice = (availableNoShares ?? 0) > 0 ? currentNoPrice : 0;
  const displayYesPrice = activeTab === "sell" ? sellYesPrice : currentYesPrice;
  const displayNoPrice = activeTab === "sell" ? sellNoPrice : currentNoPrice;

  const currentPrice = selectedOutcome === "Yes" ? (activeTab === "sell" ? sellYesPrice : currentYesPrice) : (activeTab === "sell" ? sellNoPrice : currentNoPrice);
  const priceDisplay = typeof currentPrice === "number" ? formatPrice(currentPrice) : "—";

  // For sell tab, available shares = selected outcome's shares (or 0 if none selected)
  const availableShares =
    activeTab === "sell" && (availableYesShares !== undefined || availableNoShares !== undefined)
      ? selectedOutcome === "Yes"
        ? (availableYesShares ?? 0)
        : selectedOutcome === "No"
          ? (availableNoShares ?? 0)
          : 0
      : availableSharesProp;

  const handleOutcomeSelect = useCallback((outcome: "Yes" | "No") => {
    setSelectedOutcome(outcome);
  }, []);

  // 25%, 50%, 75%, Max: for buy use % of USDC balance ($), for sell use % of available shares
  const handlePercentClick = useCallback(
    (percent: 25 | 50 | 75 | 100) => {
      const pct = percent / 100;
      if (activeTab === "buy") {
        const amount = Math.max(0, pct * usdcBalance);
        setSize(amount.toFixed(2));
      } else {
        const shares = Math.max(0, pct * availableShares);
        setSize(shares >= 0 ? String(Math.round(shares * 100) / 100) : "0");
      }
    },
    [activeTab, usdcBalance, availableShares],
  );

  const handleTradeClick = useCallback(async () => {
    if (!selectedOutcome || !size) return;

    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }

    if (!canTrade) {
      showErrorNotification("Trading unavailable", "Market data not ready for trading.");
      return;
    }

    const sizeNum = parseFloat(size) || 0;
    const price =
      orderType === "market"
        ? currentPrice
        : (parseInt(limitPrice, 10) || 0) / 100;

    if (orderType === "limit") {
      const cents = parseInt(limitPrice, 10);
      if (!limitPrice || !isValidPriceCents(cents)) {
        showErrorNotification("Invalid price", "Limit price must be 1–99¢");
        return;
      }
    }

    if (activeTab === "sell" && price <= 0) {
      showErrorNotification("No shares to sell", "You have no contracts for this outcome.");
      return;
    }

    let amountShares: number;
    if (activeTab === "buy") {
      if (price <= 0) {
        showErrorNotification("Invalid price", "Price must be greater than 0");
        return;
      }
      if (sizeNum < LIMITLESS_MIN_ORDER_USD) {
        showErrorNotification(
          "Minimum order",
          `Min. amount is $${LIMITLESS_MIN_ORDER_USD} USDC. Set amount to at least $${LIMITLESS_MIN_ORDER_USD}.`
        );
        return;
      }
      if (usdcBalance < sizeNum) {
        showErrorNotification(
          "Insufficient balance",
          "Add funds to buy. Deposit USDC on Base to place this order."
        );
        return;
      }
      amountShares = sizeNum / price;
    } else {
      amountShares = sizeNum;
    }

    if (!isValidSize(amountShares)) {
      showErrorNotification("Invalid size", `Size must be greater than ${MIN_ORDER_SIZE}`);
      return;
    }

    let effectiveOwnerId: string | null = ownerId != null ? String(ownerId) : null;
    let effectiveAccount: string | undefined = typeof user?.account === "string" ? user.account : undefined;
    let effectiveSessionCookie: string | undefined = typeof user?.sessionCookie === "string" ? user.sessionCookie : undefined;
    if (!effectiveOwnerId || !effectiveSessionCookie) {
      const loggedIn = await login();
      if (!loggedIn) {
        showErrorNotification("Sign in failed", authError?.message ?? "Please sign in to Limitless to trade.");
        return;
      }
      effectiveOwnerId = loggedIn.id != null ? String(loggedIn.id) : null;
      if (typeof loggedIn.account === "string") effectiveAccount = loggedIn.account;
      if (typeof loggedIn.sessionCookie === "string") effectiveSessionCookie = loggedIn.sessionCookie;
    }
    if (!effectiveSessionCookie) {
      showErrorNotification(
        "Session required",
        "Please sign in to Limitless (Initialize Trading) to place an order."
      );
      return;
    }

    const slug = (marketSlug ?? "").trim();
    if (!slug) {
      showErrorNotification("Invalid market", "Market slug is required.");
      return;
    }

    const result = await submitOrder(
      {
        side: activeTab === "buy" ? "BUY" : "SELL",
        outcome: selectedOutcome,
        price,
        amountShares,
        feeRateBps: user?.rank?.feeRateBps,
      },
      slug,
      orderType === "market" ? "GTC" : "GTC",
      effectiveOwnerId,
      effectiveAccount,
      effectiveSessionCookie
    );

    if (result.success) {
      const matched = result.matched === true;
      const title = matched ? "Order filled" : "Order placed on book";
      const detail = matched
        ? result.orderId
          ? `Order ID: ${result.orderId}. Your trade is complete.`
          : "Your order was matched. Check Trades and Positions for updates."
        : result.orderId
          ? `Order ID: ${result.orderId}. It will fill when someone matches it. Check Trades when filled.`
          : "Your order is on the book. It will fill when matched. Check Trades and Positions for updates.";
      showSuccessNotification(title, detail);
      setSize("");
      setLimitPrice("");
      if (activeTab === "buy" && onBuyClick) onBuyClick(selectedOutcome);
      if (activeTab === "sell" && onSellClick) onSellClick(selectedOutcome);
      queryClient.invalidateQueries({ queryKey: ["limitless-portfolio-trades"] });
      queryClient.invalidateQueries({ queryKey: ["limitless-portfolio-positions"] });
      if (slug) {
        queryClient.invalidateQueries({ queryKey: ["limitless-orderbook", slug] });
      }
    } else {
      const errMsg = result.error ?? "Your order could not be placed. Please try again.";
      const isResolved = /already been resolved/i.test(errMsg);
      showErrorNotification(
        isResolved ? "Market closed" : "Order failed",
        errMsg
      );
    }
  }, [
    selectedOutcome,
    size,
    activeTab,
    orderType,
    limitPrice,
    currentPrice,
    authenticated,
    canTrade,
    marketSlug,
    venue?.exchange,
    hasEnoughAllowance,
    ensureUsdcApproval,
    usdcBalance,
    ownerId,
    login,
    user,
    submitOrder,
    queryClient,
    eoaAddress,
    onBuyClick,
    onSellClick,
    authError,
  ]);

  // When not signed in to Limitless, primary action is "Init Trade" (no form validation). Otherwise validate order fields.
  const needsLimitlessSignIn = !!ethersSigner && !user;
  const buyAmount = parseFloat(size) || 0;
  const isBelowMinBuy = activeTab === "buy" && buyAmount < LIMITLESS_MIN_ORDER_USD;
  const isTradeDisabled = isSubmitting || isUsdcApproving
    ? true
    : !authenticated
      ? false
      : needsLimitlessSignIn
        ? isAuthLoading
        : isBelowMinBuy
          ? true
          : !selectedOutcome ||
            !size ||
            !canTrade ||
            (activeTab === "buy" && usdcBalance < buyAmount) ||
            (activeTab === "sell" && availableShares <= 0) ||
            (orderType === "limit" && (!limitPrice || !isValidPriceCents(parseInt(limitPrice, 10))));

  const handlePrimaryAction = useCallback(async () => {
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }
    if (needsLimitlessSignIn) {
      await login();
      return;
    }
    await handleTradeClick();
  }, [authenticated, needsLimitlessSignIn, login, handleTradeClick]);

  const primaryButtonLabel = isSubmitting
    ? "Submitting…"
    : isUsdcApproving
      ? "Approve USDC…"
      : isAuthLoading
      ? "Signing in…"
      : activeTab === "buy" && buyAmount < LIMITLESS_MIN_ORDER_USD
        ? `Minimum: $${LIMITLESS_MIN_ORDER_USD} USDC`
        : !authenticated
          ? activeTab === "buy"
            ? "Place Order"
            : "Sell"
          : needsLimitlessSignIn
            ? "Initialize Trading"
            : activeTab === "buy"
              ? `Buy ${selectedOutcome || ""}`
              : `Sell ${selectedOutcome || ""}`;

  return (
    <div className="flex flex-col border border-white/10 rounded-lg overflow-hidden h-full min-h-100">
      <div className="flex items-center gap-3 px-4 py-3 pr-12 lg:pr-4 border-b border-white/10">
        {symbolImageUrl ? (
          <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
            <Image src={symbolImageUrl} alt={marketTitle || "Market"} width={40} height={40} className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white/60 text-xs">?</span>
          </div>
        )}
        <div className="flex-1 min-w-0 max-w-[65%] lg:max-w-none">
          <div className="text-sm font-medium text-white truncate">{marketTitle || "Market"}</div>
          <div className="text-xs text-white/60">Limitless</div>
        </div>
      </div>

      {/* Buy/Sell Tabs and Market Dropdown (same layout as Polymarket/Kalshi) */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setActiveTab("buy"); setSelectedOutcome(null); }}
            className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${activeTab === "buy" ? "text-white border-b-2" : "text-white/60 hover:text-white/80"}`}
            style={activeTab === "buy" ? { borderBottomColor: LIMITLESS_ACCENT, color: "#fff" } : undefined}
          >
            Buy
          </button>
          <button
            onClick={() => { setActiveTab("sell"); setSelectedOutcome(null); }}
            className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${activeTab === "sell" ? "text-white border-b-2 bg-[#0a0a0a]" : "text-white/60 hover:text-white/80"}`}
            style={activeTab === "sell" ? { borderBottomColor: LIMITLESS_ACCENT, color: "#fff" } : undefined}
          >
            Sell
          </button>
        </div>
        {marketsForTrading.length > 1 && (
          <div className="min-w-[140px] max-w-[200px] flex-1">
            <Select
              value={selectedMarketValue}
              onChange={handleMarketChange}
              options={marketOptions}
              placeholder="Market"
              className="w-full"
              searchable
              searchPlaceholder="Search options..."
            />
          </div>
        )}
      </div>

      <div className="p-4 flex gap-3 bg-[#0a0a0a]">
        <button
          onClick={() => handleOutcomeSelect("Yes")}
          className={`flex-1 py-2 px-2 rounded-lg font-semibold text-white transition-all ${selectedOutcome === "Yes" ? "bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20" : "bg-gray-600 hover:bg-gray-500"}`}
        >
          <div className="flex flex-row items-center justify-center gap-2">
            {selectedOutcome === "Yes" && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="text-sm">Yes</span>
            <span className="text-sm font-bold">{formatPrice(displayYesPrice)}</span>
          </div>
        </button>
        <button
          onClick={() => handleOutcomeSelect("No")}
          className={`flex-1 py-2 px-2 rounded-lg font-semibold text-white transition-all ${selectedOutcome === "No" ? "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20" : "bg-gray-600 hover:bg-gray-500"}`}
        >
          <div className="flex flex-row items-center justify-center gap-2">
            {selectedOutcome === "No" && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="text-sm">No</span>
            <span className="text-sm font-bold">{formatPrice(displayNoPrice)}</span>
          </div>
        </button>
      </div>

      <div className="px-4 py-3 border-t border-white/10">
        <label className="block text-xs text-white/60 mb-2">Order Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setOrderType("market")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${orderType === "market" ? "text-black" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
            style={orderType === "market" ? { backgroundColor: LIMITLESS_ACCENT } : undefined}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType("limit")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${orderType === "limit" ? "text-black" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
            style={orderType === "limit" ? { backgroundColor: LIMITLESS_ACCENT } : undefined}
          >
            Limit
          </button>
        </div>
      </div>

      <div className="px-4 py-4 border-t border-white/10 flex-1 flex flex-col">
        <div className="mb-3 bg-white/5 rounded-lg p-3">
          <p className="text-xs text-white/60 mb-1">Current Market Price</p>
          <p className="text-lg font-bold text-white">{selectedOutcome ? priceDisplay : "—"}</p>
        </div>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-white/80">
              {activeTab === "buy" ? "Amount ($)" : "Size (shares)"}
            </label>
            <div className="flex flex-col items-end">
              <span className="text-sm text-white/80">
                {activeTab === "buy" ? (
                  <>Available: {formatCurrency(usdcBalance)}</>
                ) : (
                  <>Available: Yes {formatShares(availableYesShares)}, No {formatShares(availableNoShares)}</>
                )}
              </span>
              <div className="flex gap-1 mt-1.5">
                {([25, 50, 75, 100] as const).map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handlePercentClick(pct)}
                    disabled={
                      isSubmitting ||
                      (activeTab === "buy" ? usdcBalance <= 0 : availableShares <= 0)
                    }
                    className="py-1 px-2 rounded border border-green-500/50 bg-white/5 text-white/90 text-[10px] font-medium hover:bg-white/10 hover:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5 transition-colors"
                  >
                    {pct === 100 ? "Max" : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="relative">
            {activeTab === "buy" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-sm pointer-events-none">$</span>}
            <input
              type="text"
              value={size}
              onChange={(e) => setSize(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className={`w-full py-2 bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-[#ffc000] text-white text-sm placeholder-white/30 ${activeTab === "buy" ? "pl-6" : "px-3"}`}
            />
          </div>
          {activeTab === "buy" && (
            <p className="mt-1.5 text-xs text-white/50">Min. amount is ${LIMITLESS_MIN_ORDER_USD}</p>
          )}
        </div>
        <div className="mb-3 shrink-0">
          <div className="text-xs text-white/60 space-y-1">
            <div>
              USDC Balance:{" "}
              <span className="text-white font-medium">${usdcBalanceFormatted}</span>
              {" ("}
              <span className="text-white font-medium">{nativeBalanceFormatted} {nativeLabel}</span>
              {")"}
            </div>
          </div>
        </div>
        {orderType === "limit" && (
          <div className="mb-3">
            <label className="block text-sm text-white/80 mb-2">Limit Price (¢)</label>
            <input
              type="text"
              inputMode="numeric"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="1-99"
              className="w-full px-3 py-2 bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-[#ffc000] text-white text-sm placeholder-white/30"
            />
          </div>
        )}
        {needsLimitlessSignIn && authError && (
          <p className="text-sm text-red-400 mb-2">{authError.message}</p>
        )}
        <button
          onClick={handlePrimaryAction}
          disabled={isTradeDisabled}
          className="w-full py-3 rounded-lg font-semibold text-black transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-auto"
          style={{ backgroundColor: LIMITLESS_ACCENT }}
        >
          {primaryButtonLabel}
        </button>
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={() => setShowLoginModal(false)}
      />
    </div>
  );
}
