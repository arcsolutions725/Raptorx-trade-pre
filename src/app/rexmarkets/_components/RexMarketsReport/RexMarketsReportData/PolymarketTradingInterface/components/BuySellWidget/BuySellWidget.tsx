"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useId } from "react";
import { formatShares, formatCurrency } from "@/utils/format";
import { calculateTotalCost, convertCentsToPrice } from "@/utils/order";
import {
  isValidDecimalInput,
  isValidCentsInput,
  isValidSize,
  isValidPriceCents,
  MIN_ORDER_SIZE,
} from "@/utils/validation";
import { Select, SelectOption } from "@/components/ui/Select";
import {
  AmountField,
  PriceWell,
  RegionBlockedNotice,
  SideSeg,
  TicketHead,
  YesNoPair,
} from "../../../shared/marketUi";
import { useTrading } from "@/providers/TradingProvder";
import useClobOrder, { type OrderParams } from "@/hooks/useClobOrder";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import useUserPositions from "@/hooks/useUserPosition";
import type { MarketOutcome } from "@/hooks/useMarketDetails";
import { formatPrice } from "@/utils/polymarketTrading";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import LoginModal from "@/components/ui/modal/LoginModal";
import {
  showSuccessNotification,
  showErrorNotification,
} from "@/components/ui/notification";

type BuySellWidgetProps = {
  currentYesPrice: number;
  currentNoPrice: number;
  onBuyClick: (outcome: "Yes" | "No") => void;
  onSellClick: (outcome: "Yes" | "No") => void;
  symbolImageUrl?: string;
  marketTitle?: string;
  availableMarkets?: Array<{
    condition_id?: string;
    ticker?: string;
    groupItemTitle?: string;
    subtitle?: string;
    clob_token_id?: string;
    clob_no_token_id?: string;
    yes_price?: number;
    no_price?: number;
  }>;
  marketsForOrderBook?: Array<{
    clobTokenId: string;
    clobNoTokenId: string | null;
    marketTitle: string;
    ticker?: string;
    conditionId: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
  }>;
  selectedMarketIndex?: number;
  onMarketIndexChange?: (index: number) => void;
  initialOutcome?: "Yes" | "No";
};

export default function BuySellWidget({
  currentYesPrice,
  currentNoPrice,
  onBuyClick,
  onSellClick,
  symbolImageUrl,
  marketTitle,
  availableMarkets = [],
  marketsForOrderBook = [],
  selectedMarketIndex = 0,
  onMarketIndexChange,
  initialOutcome,
}: BuySellWidgetProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [selectedOutcome, setSelectedOutcome] = useState<"Yes" | "No" | null>(
    initialOutcome || null
  );
  const [size, setSize] = useState(""); // Size in shares (for sell) or amount in dollars (for buy)
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState(""); // Limit price in cents (1-99)
  const [isInitializing, setIsInitializing] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const lastErrorRef = useRef<string | null>(null);

  // Authentication hooks
  const { authenticated: privyAuthenticated } = usePrivy();
  const { isAuthenticated: phantomAuthenticated } = usePhantomConnect();
  const authenticated = privyAuthenticated || phantomAuthenticated;

  // Trading hooks
  const {
    clobClient,
    eoaAddress,
    safeAddress,
    isTradingSessionComplete,
    initializeTradingSession,
    currentStep,
    sessionError,
    isGeoblocked,
    geoblockStatus,
  } = useTrading();

  const {
    submitOrder,
    isSubmitting,
    error: orderError,
  } = useClobOrder(clobClient, eoaAddress);

  const { usdcBalance, formattedUsdcBalance } = usePolygonBalances(safeAddress);

  // Get user positions to show available shares for selling
  const { data: userPositions } = useUserPositions(
    safeAddress as string | undefined
  );

  // Show order errors as notifications
  useEffect(() => {
    if (orderError) {
      showErrorNotification(
        "Order failed",
        orderError.message || "An error occurred",
      );
    }
  }, [orderError]);

  // Show session errors as notifications (dedupe to avoid repeated toasts)
  useEffect(() => {
    if (sessionError) {
      const errorMessage = sessionError.message;
      if (lastErrorRef.current !== errorMessage) {
        lastErrorRef.current = errorMessage;
        showErrorNotification("Error", errorMessage);
      }
    } else {
      lastErrorRef.current = null;
    }
  }, [sessionError]);

  // Set initial outcome when prop changes
  useEffect(() => {
    if (initialOutcome) {
      setSelectedOutcome(initialOutcome);
    }
  }, [initialOutcome]);

  // Get selected market from marketsForOrderBook based on selectedMarketIndex
  const selectedMarketFromOrderBook = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex >= 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex];
    }
    return null;
  }, [marketsForOrderBook, selectedMarketIndex]);

  // Get selected market data - prioritize marketsForOrderBook, fallback to availableMarkets
  const selectedMarketData = useMemo(() => {
    // If we have a selected market from order book, find it in availableMarkets
    if (selectedMarketFromOrderBook) {
      return availableMarkets.find(
        (market) =>
          market.condition_id === selectedMarketFromOrderBook.conditionId ||
          market.ticker === selectedMarketFromOrderBook.ticker ||
          market.clob_token_id === selectedMarketFromOrderBook.clobTokenId
      );
    }
    // Fallback to first available market
    if (availableMarkets.length > 0) {
      return availableMarkets[0];
    }
    return undefined;
  }, [selectedMarketFromOrderBook, availableMarkets]);

  // Get token ID for selected outcome
  const getTokenId = useCallback(
    (outcome: "Yes" | "No"): string | null => {
      if (!selectedMarketData) {
        // Fallback to first market if no selection
        const fallbackMarket = availableMarkets[0];
        if (!fallbackMarket) return null;

        // For Yes, use clob_token_id (Yes token ID)
        // For No, use clob_no_token_id (No token ID)
        if (outcome === "Yes") {
          return (
            fallbackMarket.clob_token_id ||
            fallbackMarket.condition_id ||
            fallbackMarket.ticker ||
            null
          );
        } else {
          return fallbackMarket.clob_no_token_id || null;
        }
      }

      // For Yes outcome, use clob_token_id (Yes token ID)
      // For No outcome, use clob_no_token_id (No token ID)
      if (outcome === "Yes") {
        return (
          selectedMarketData.clob_token_id ||
          selectedMarketData.condition_id ||
          selectedMarketData.ticker ||
          null
        );
      } else {
        return selectedMarketData.clob_no_token_id || null;
      }
    },
    [selectedMarketData, availableMarkets]
  );

  // Calculate available shares for Yes outcome
  const availableSharesYes = useMemo(() => {
    if (!userPositions || userPositions.length === 0) {
      return 0;
    }

    const tokenId = getTokenId("Yes");
    if (!tokenId) return 0;

    const position = userPositions.find((pos) => pos.asset === tokenId);
    return position ? position.size : 0;
  }, [userPositions, getTokenId]);

  // Calculate available shares for No outcome
  const availableSharesNo = useMemo(() => {
    if (!userPositions || userPositions.length === 0) {
      return 0;
    }

    const tokenId = getTokenId("No");
    if (!tokenId) return 0;

    const position = userPositions.find((pos) => pos.asset === tokenId);
    return position ? position.size : 0;
  }, [userPositions, getTokenId]);

  // Calculate available shares for the selected outcome (or total if none selected)
  const availableShares = useMemo(() => {
    if (selectedOutcome) {
      return selectedOutcome === "Yes" ? availableSharesYes : availableSharesNo;
    }
    // If no outcome selected, return total of both
    return availableSharesYes + availableSharesNo;
  }, [selectedOutcome, availableSharesYes, availableSharesNo]);

  // Get user's position for profit/loss calculation
  const userPosition = useMemo(() => {
    if (!selectedOutcome || !userPositions || userPositions.length === 0) {
      return null;
    }

    const tokenId = getTokenId(selectedOutcome);
    if (!tokenId) return null;

    return userPositions.find((pos) => pos.asset === tokenId) || null;
  }, [selectedOutcome, userPositions, getTokenId]);

  // Calculate profit/loss if user sells now
  const profitLoss = useMemo(() => {
    if (!userPosition || !selectedOutcome) return null;

    const currentPrice =
      selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice;
    
    // Profit/Loss = (currentPrice - avgPrice) * shares
    // Or use cashPnl from position if available
    if (userPosition.cashPnl !== undefined) {
      return userPosition.cashPnl;
    }
    
    // Calculate manually: (current price - avg price) * shares
    const pnl = (currentPrice - userPosition.avgPrice) * userPosition.size;
    return pnl;
  }, [userPosition, selectedOutcome, currentYesPrice, currentNoPrice]);

  // Prepare market options for Select component - use marketsForOrderBook if available
  const marketOptions: SelectOption[] = useMemo(() => {
    if (marketsForOrderBook.length > 0) {
      // Map marketsForOrderBook to options with index as value
      return marketsForOrderBook.map((market, index) => ({
        value: index.toString(),
        label: market.marketTitle,
      }));
    }

    // Fallback to availableMarkets
    return [
      { value: "all", label: "Market" },
      ...availableMarkets.map((market) => ({
        value: market.condition_id || market.ticker || "",
        label:
          market.groupItemTitle || market.subtitle || market.ticker || "Market",
      })),
    ];
  }, [marketsForOrderBook, availableMarkets]);

  // Get current selected market value for the dropdown
  const selectedMarketValue = useMemo(() => {
    if (marketsForOrderBook.length > 0) {
      return selectedMarketIndex.toString();
    }
    // Fallback: find the current market in availableMarkets
    if (selectedMarketFromOrderBook) {
      const found = availableMarkets.find(
        (market) =>
          market.condition_id === selectedMarketFromOrderBook.conditionId ||
          market.ticker === selectedMarketFromOrderBook.ticker
      );
      return found?.condition_id || found?.ticker || "all";
    }
    return "all";
  }, [
    marketsForOrderBook,
    selectedMarketIndex,
    selectedMarketFromOrderBook,
    availableMarkets,
  ]);

  // Handle market selection change
  const handleMarketChange = (value: string) => {
    if (marketsForOrderBook.length > 0 && onMarketIndexChange) {
      // If using marketsForOrderBook, value is the index as string
      const index = parseInt(value, 10);
      if (!isNaN(index) && index >= 0 && index < marketsForOrderBook.length) {
        onMarketIndexChange(index);
      }
    }
  };

  const handleOutcomeSelect = (outcome: "Yes" | "No") => {
    setSelectedOutcome(outcome);
  };

  const handleSizeChange = (value: string) => {
    if (isValidDecimalInput(value)) {
      setSize(value);
    }
  };

  const handleLimitPriceChange = (value: string) => {
    if (isValidCentsInput(value)) {
      setLimitPrice(value);
    }
  };

  // 25%, 50%, 75%, Max: for buy use % of USDC balance ($), for sell use % of available shares
  const handlePercentClick = useCallback(
    (percent: 25 | 50 | 75 | 100) => {
      const pct = percent / 100;
      if (activeTab === "buy") {
        const walletDollars = usdcBalance ?? 0;
        const amount = Math.max(0, pct * walletDollars);
        setSize(amount.toFixed(2));
      } else {
        const maxShares = availableShares;
        const shares = Math.max(0, pct * maxShares);
        setSize(shares >= 0 ? String(Math.round(shares * 100) / 100) : "0");
      }
    },
    [activeTab, usdcBalance, availableShares],
  );

  const handleTrade = useCallback(async () => {
    // Check authentication first - show LoginModal (Privy option)
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }

    // If trading session is not initialized, handle initialization separately
    // This doesn't require order fields (outcome, size, etc.)
    // Let initializeTradingSession handle wallet connection check internally
    if (!isTradingSessionComplete) {
      setIsInitializing(true);

      try {
        await initializeTradingSession();
        setIsInitializing(false);
        showSuccessNotification(
          "Trading session initialized",
          "Trading session initialized successfully!",
        );
        // Don't continue to place order - let user click again after initialization
        return;
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : "Failed to initialize trading session";
        showErrorNotification("Initialization failed", errorMsg);
        setIsInitializing(false);
        return;
      }
    }

    // From here on, we're placing an order - validate order fields
    const inputValue = parseFloat(size) || 0;

    if (!selectedOutcome) {
      showErrorNotification("Error", "Please select an outcome");
      return;
    }

    // For buy orders, convert amount (dollars) to shares
    // For sell orders, use size directly (shares)
    let sizeNum: number;
    if (activeTab === "buy") {
      const currentPrice =
        selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice;
      let effectivePrice: number;

      if (orderType === "limit") {
        const limitPriceNum = limitPrice ? parseInt(limitPrice) : 0;
        if (isNaN(limitPriceNum) || limitPriceNum === 0) {
          effectivePrice = 0;
        } else {
          effectivePrice = convertCentsToPrice(limitPriceNum);
        }
      } else {
        effectivePrice = currentPrice;
      }

      if (effectivePrice <= 0) {
        showErrorNotification("Error", "Invalid price. Please try again.");
        return;
      }

      // Convert dollar amount to shares: shares = amount / price
      sizeNum = inputValue / effectivePrice;

      if (!isValidSize(sizeNum)) {
        showErrorNotification(
          "Error",
          `Amount must result in shares greater than ${MIN_ORDER_SIZE}`,
        );
        return;
      }
    } else {
      // For sell orders, inputValue is already in shares
      sizeNum = inputValue;
      if (!isValidSize(sizeNum)) {
        showErrorNotification(
          "Error",
          `Size must be greater than ${MIN_ORDER_SIZE}`,
        );
        return;
      }

      // Validate that user has enough shares to sell
      if (availableShares > 0 && sizeNum > availableShares) {
        showErrorNotification(
          "Insufficient shares",
          `Available: ${formatShares(availableShares)}`,
        );
        return;
      }
    }

    if (orderType === "limit") {
      if (!limitPrice) {
        showErrorNotification("Error", "Limit price is required");
        return;
      }

      const cents = parseInt(limitPrice);
      if (!isValidPriceCents(cents)) {
        showErrorNotification(
          "Error",
          "Price must be between 1 and 99 (0.01 to 0.99)",
        );
        return;
      }
    }

    // Additional checks before placing order
    if (!eoaAddress) {
      showErrorNotification("Error", "Please connect your wallet first");
      return;
    }

    if (isGeoblocked) {
      showErrorNotification(
        "Error",
        "Trading is not available in your region",
      );
      return;
    }

    if (!clobClient) {
      showErrorNotification(
        "Error",
        "Trading client not available. Please try again.",
      );
      return;
    }

    const tokenId = getTokenId(selectedOutcome);
    if (!tokenId) {
      if (selectedOutcome === "No" && !selectedMarketData?.clob_no_token_id) {
        showErrorNotification(
          "Error",
          "No token ID not available for this market. Please try selecting a different market or outcome.",
        );
      } else {
        showErrorNotification(
          "Error",
          "Could not determine token ID for selected market",
        );
      }
      return;
    }

    // Calculate total cost to check balance
    const currentPrice =
      selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice;
    let effectivePrice: number;

    if (orderType === "limit") {
      const limitPriceNum = limitPrice ? parseInt(limitPrice) : 0;
      if (isNaN(limitPriceNum) || limitPriceNum === 0) {
        effectivePrice = 0;
      } else {
        effectivePrice = convertCentsToPrice(limitPriceNum);
      }
    } else {
      effectivePrice = currentPrice;
    }

    // For buy orders, total cost is the input amount (already in dollars)
    // For sell orders, calculate total cost from shares and price
    const totalCost =
      activeTab === "buy"
        ? inputValue
        : effectivePrice > 0
        ? calculateTotalCost(sizeNum, effectivePrice)
        : 0;

    // For buying, we need to check if user has enough USDC
    if (activeTab === "buy" && usdcBalance < totalCost) {
      showErrorNotification(
        "Insufficient USDC",
        `Available: $${formattedUsdcBalance}`,
      );
      return;
    }

    try {
      // For sell orders, use position's negRisk if available
      // For buy orders, negRisk is not needed
      const negRisk = activeTab === "sell" && userPosition 
        ? userPosition.negativeRisk 
        : undefined;

      // For sell orders, always use market orders (following GitHub example pattern)
      // For buy orders, respect the user's order type selection
      const isMarketOrder = activeTab === "sell" 
        ? true 
        : orderType === "market";

      // Build order params - price only for limit buy orders
      // Sell orders never have price parameter (always market orders)
      const orderParams: OrderParams = {
        tokenId,
        size: sizeNum,
        side: activeTab === "buy" ? "BUY" : "SELL",
        negRisk,
        isMarketOrder,
      };

      // Only add price parameter for limit buy orders
      if (activeTab === "buy" && orderType === "limit") {
        orderParams.price = effectivePrice;
      }

      if (activeTab === "buy" && orderType === "market") {
        orderParams.price = undefined;
      }

      // Submit the order
      const result = await submitOrder(orderParams);

      if (result.success) {
        setSize(""); // Clear size after successful order
        setLimitPrice(""); // Clear limit price

        showSuccessNotification(
          "Order Submitted Successfully.",
          `Your Order Id: ${result.orderId}`,
        );

        // Call the parent callbacks for UI updates
        if (activeTab === "buy") {
          onBuyClick(selectedOutcome);
        } else {
          onSellClick(selectedOutcome);
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to submit order";
      showErrorNotification("Order failed", errorMsg);
      console.error("Trade error:", err);
    }
  }, [
    selectedOutcome,
    size,
    orderType,
    limitPrice,
    isTradingSessionComplete,
    isGeoblocked,
    clobClient,
    getTokenId,
    activeTab,
    usdcBalance,
    formattedUsdcBalance,
    currentYesPrice,
    currentNoPrice,
    submitOrder,
    initializeTradingSession,
    onBuyClick,
    onSellClick,
    authenticated,
    eoaAddress,
    userPosition,
  ]);

  // Calculate sizeNum based on tab - for buy it's calculated from amount, for sell it's direct
  const inputValue = parseFloat(size) || 0;
  const currentPriceForCalc =
    selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice;
  let effectivePriceForCalc: number;

  if (orderType === "limit" && limitPrice) {
    const limitPriceNum = parseInt(limitPrice);
    if (!isNaN(limitPriceNum) && limitPriceNum > 0) {
      effectivePriceForCalc = convertCentsToPrice(limitPriceNum);
    } else {
      effectivePriceForCalc = currentPriceForCalc;
    }
  } else {
    effectivePriceForCalc = currentPriceForCalc;
  }

  const sizeNum =
    activeTab === "buy" && effectivePriceForCalc > 0
      ? inputValue / effectivePriceForCalc
      : inputValue;

  // Button should be enabled if:
  // 1. User is not authenticated (so they can click to open login modal) - only disable during loading
  // 2. Trading session is not initialized (so they can click to initialize) - only disable during loading
  // 3. User is authenticated, session is initialized, and all validations pass
  const isTradeDisabled = !authenticated
    ? // When not authenticated, only disable during loading states (not geoblocked - let them see login modal)
      isSubmitting || isInitializing
    : authenticated && isTradingSessionComplete
    ? // When authenticated and session complete, check validations
      !selectedOutcome ||
      !isValidSize(sizeNum) ||
      (orderType === "limit" &&
        (!limitPrice || !isValidPriceCents(parseInt(limitPrice)))) ||
      isSubmitting ||
      isInitializing ||
      isGeoblocked
    : // When authenticated but session not complete, only disable during active initialization
      // Allow clicking to initialize (geoblock check happens during initialization)
      isSubmitting ||
      isInitializing ||
      (currentStep !== "idle" && !isTradingSessionComplete);

  // Get the reason why the trade button is disabled
  const getDisableReason = (): string | null => {
    // Don't show reason during active loading states
    if (
      isSubmitting ||
      isInitializing ||
      (currentStep !== "idle" && !isTradingSessionComplete)
    ) {
      return null;
    }

    // Show geoblock reason for all authenticated states (but don't disable button for initialization)
    // The geoblock check will happen during initialization and show an error
    if (authenticated && isGeoblocked && isTradingSessionComplete) {
      return "Trading not available in your region";
    }

    // Show validation reasons only when session is complete
    if (authenticated && isTradingSessionComplete) {
      if (!selectedOutcome) {
        return "Select Yes or No";
      }
      if (!isValidSize(sizeNum)) {
        return `Size must be greater than ${MIN_ORDER_SIZE}`;
      }
      if (orderType === "limit") {
        if (!limitPrice) {
          return "Enter limit price";
        }
        if (!isValidPriceCents(parseInt(limitPrice))) {
          return "Price must be between 1-99¢";
        }
      }
    }

    return null;
  };

  const disableReason = getDisableReason();
  const fieldUid = useId().replace(/:/g, "");
  const amountId = `pm-amount-${fieldUid}`;
  const limitId = `pm-limit-${fieldUid}`;

  return (
    <div className="mk-ticket">
      {/* Mini market head */}
      <TicketHead imageUrl={symbolImageUrl} title={marketTitle || "Market"} sub="No change" />

      {/* Buy / Sell and the outcome picker */}
      <div className="mk-ticket__row">
        <SideSeg
          value={activeTab}
          onChange={(side) => {
            setActiveTab(side);
            setSelectedOutcome(null);
          }}
        />
        <Select
          value={selectedMarketValue}
          onChange={handleMarketChange}
          options={marketOptions}
          placeholder="Market"
          className="mk-select"
          searchable
          searchPlaceholder="Search options..."
        />
      </div>

      {/* Yes / No */}
      <YesNoPair
        selected={selectedOutcome}
        yesPrice={formatPrice(currentYesPrice)}
        noPrice={formatPrice(currentNoPrice)}
        onSelect={handleOutcomeSelect}
      />

      {/* Order type */}
      <div className="mk-otype">
        <span className="rx-label">Order type</span>
        <div className="rx-seg" role="group" aria-label="Order type">
          <button
            type="button"
            onClick={() => setOrderType("market")}
            className={`rx-seg__item${orderType === "market" ? " is-active" : ""}`}
            aria-pressed={orderType === "market"}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => setOrderType("limit")}
            className={`rx-seg__item${orderType === "limit" ? " is-active" : ""}`}
            aria-pressed={orderType === "limit"}
          >
            Limit
          </button>
        </div>
      </div>

      <PriceWell
        label="Current market price"
        value={formatPrice(
          selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice
        )}
      />

      {/* Size/Amount Input */}
      <AmountField
        id={amountId}
        label={activeTab === "buy" ? "Amount ($)" : "Size (shares)"}
        aside={
          isTradingSessionComplete ? (
            activeTab === "buy" ? (
              <>Available: <b>{formatCurrency(usdcBalance ?? 0)}</b></>
            ) : selectedOutcome ? (
              <>Available shares: <b>{formatShares(availableShares)}</b></>
            ) : (
              <>
                Available: Yes <b>{formatShares(availableSharesYes)}</b>, No{" "}
                <b>{formatShares(availableSharesNo)}</b>
              </>
            )
          ) : undefined
        }
        prefix={activeTab === "buy" ? "$" : undefined}
        value={size}
        onChange={handleSizeChange}
        disabled={isSubmitting}
        pcts={
          isTradingSessionComplete
            ? ([25, 50, 75, 100] as const).map((pct) => ({
                label: pct === 100 ? "Max" : `${pct}%`,
                onClick: () => handlePercentClick(pct),
                disabled:
                  isSubmitting ||
                  (activeTab === "buy"
                    ? (usdcBalance ?? 0) <= 0
                    : availableShares <= 0),
              }))
            : undefined
        }
      />

      {/* Limit Price Input */}
      {orderType === "limit" && (
        <div className="rx-field mk-amount">
          <div className="mk-amount__top">
            <label className="rx-label" htmlFor={limitId}>
              Limit price (¢)
            </label>
          </div>
          <div className="rx-input">
            <input
              id={limitId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={limitPrice}
              onChange={(e) => handleLimitPriceChange(e.target.value)}
              placeholder="0"
              maxLength={2}
              disabled={isSubmitting}
            />
            <span className="rx-num mk-amount__suf" aria-hidden="true">¢</span>
          </div>
          <p className="rx-help">Enter 1-99 (e.g., 55 = $0.55 or 55¢)</p>
        </div>
      )}

      {/* Order Summary / To Win - Shows when size/amount and outcome are selected */}
      {selectedOutcome &&
        (() => {
          const inputAmount = parseFloat(size) || 0;
          if (inputAmount <= 0) return null;

          const currentPrice =
            selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice;
          let effectivePrice: number;

          if (orderType === "limit") {
            const limitPriceNum = limitPrice ? parseInt(limitPrice) : 0;
            if (isNaN(limitPriceNum) || limitPriceNum === 0) {
              effectivePrice = 0;
            } else {
              effectivePrice = convertCentsToPrice(limitPriceNum);
            }
          } else {
            effectivePrice = currentPrice;
          }

          // For buy orders, show "To win" section
          if (activeTab === "buy" && effectivePrice > 0) {
            // Potential win = amount / price (e.g., $1 / $0.008 = $125)
            const potentialWin = inputAmount / effectivePrice;

            return (
              <div className="rx-well mk-win">
                <span className="mk-win__label">
                  To win
                  <span>Avg. price {formatPrice(effectivePrice)}</span>
                </span>
                <span className="mk-win__value">
                  {formatCurrency(potentialWin)}
                </span>
              </div>
            );
          }

          // For sell orders, show "You'll receive" section
          // For sell orders, inputAmount is already in shares
          // Amount you'll receive = shares * sell_price (e.g., 125 shares * $0.007 = $0.88)
          if (activeTab === "sell" && effectivePrice > 0) {
            const sharesForSell = inputAmount;
            const amountYoullReceive = sharesForSell * effectivePrice;

            return (
              <div className="rx-well mk-win">
                <span className="mk-win__label">
                  You&apos;ll receive
                  <span>Avg. price {formatPrice(effectivePrice)}</span>
                </span>
                <span className="mk-win__value">
                  {formatCurrency(amountYoullReceive)}
                </span>
              </div>
            );
          }

          return null;
        })()}

      {/* Profit/Loss Display - Only show on Sell tab when user has a position */}
      {activeTab === "sell" &&
        isTradingSessionComplete &&
        profitLoss !== null &&
        userPosition &&
        availableShares > 0 && (
          <div className="rx-well mk-pnl">
            <span>Profit / loss if you sell now</span>
            <b className={profitLoss >= 0 ? "is-up" : "is-down"}>
              {profitLoss >= 0
                ? `+${formatCurrency(profitLoss)}`
                : `-${formatCurrency(Math.abs(profitLoss))}`}
            </b>
          </div>
        )}

      {/* USDC Balance Display */}
      {isTradingSessionComplete && (
        <p className="mk-balance">
          USDC balance <b>${formattedUsdcBalance}</b>
        </p>
      )}

      {/* Region-blocked notice (design/blocked.html, compact) */}
      {isGeoblocked && <RegionBlockedNotice country={geoblockStatus?.country} />}

      {/* Combined Trade/Initialize Button */}
      <button
        type="button"
        onClick={handleTrade}
        disabled={isTradeDisabled}
        className="rx-btn rx-btn--primary rx-btn--l rx-btn--block mk-ticket__cta"
      >
        {isSubmitting
          ? "Submitting..."
          : !authenticated
          ? activeTab === "buy"
            ? "Place order"
            : "Sell"
          : isInitializing ||
            (currentStep !== "idle" && !isTradingSessionComplete)
          ? "Initializing..."
          : !isTradingSessionComplete
          ? "Initialize trading"
          : disableReason
          ? disableReason
          : activeTab === "buy"
          ? "Place order"
          : "Sell"}
      </button>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}
