"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
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
import { useTrading } from "@/providers/TradingProvder";
import useClobOrder, { type OrderParams } from "@/hooks/useClobOrder";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import useUserPositions from "@/hooks/useUserPosition";
import type { MarketOutcome } from "@/hooks/useMarketDetails";
import { formatPrice } from "@/utils/polymarketTrading";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import LoginModal from "@/components/ui/modal/LoginModal";
import { showSuccessNotification } from "@/components/ui/notification";

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Refs to track timers for auto-hide
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  // Sync orderError from hook to local error state for auto-hide
  useEffect(() => {
    if (orderError) {
      setError(orderError.message || "An error occurred");
    }
  }, [orderError]);

  // Clear success/error messages after a delay
  useEffect(() => {
    // Clear any existing timer
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    
    if (success) {
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
        successTimerRef.current = null;
      }, 5000);
    }
    
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, [success]);

  useEffect(() => {
    // Clear any existing timer
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    
    if (error) {
      errorTimerRef.current = setTimeout(() => {
        setError(null);
        lastErrorRef.current = null;
        errorTimerRef.current = null;
      }, 5000);
    } else {
      lastErrorRef.current = null;
    }
    
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [error]);

  // Display session errors when they occur
  useEffect(() => {
    if (sessionError) {
      const errorMessage = sessionError.message;
      // Only set error if it's different from the last error to avoid resetting timer
      if (lastErrorRef.current !== errorMessage) {
        lastErrorRef.current = errorMessage;
        setError(errorMessage);
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
    setError(null);
  };

  const handleSizeChange = (value: string) => {
    if (isValidDecimalInput(value)) {
      setSize(value);
      setError(null);
    }
  };

  const handleLimitPriceChange = (value: string) => {
    if (isValidCentsInput(value)) {
      setLimitPrice(value);
      setError(null);
    }
  };

  const handleTrade = useCallback(async () => {
    // Check authentication first
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }

    // If trading session is not initialized, handle initialization separately
    // This doesn't require order fields (outcome, size, etc.)
    // Let initializeTradingSession handle wallet connection check internally
    if (!isTradingSessionComplete) {
      setIsInitializing(true);
      setError(null);
      setSuccess(null);

      try {
        await initializeTradingSession();
        setIsInitializing(false);
        setSuccess("Trading session initialized successfully!");
        // Don't continue to place order - let user click again after initialization
        return;
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : "Failed to initialize trading session";
        setError(errorMsg);
        setIsInitializing(false);
        return;
      }
    }

    // From here on, we're placing an order - validate order fields
    const inputValue = parseFloat(size) || 0;

    if (!selectedOutcome) {
      setError("Please select an outcome");
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
        setError("Invalid price. Please try again.");
        return;
      }

      // Convert dollar amount to shares: shares = amount / price
      sizeNum = inputValue / effectivePrice;

      if (!isValidSize(sizeNum)) {
        setError(`Amount must result in shares greater than ${MIN_ORDER_SIZE}`);
        return;
      }
    } else {
      // For sell orders, inputValue is already in shares
      sizeNum = inputValue;
      if (!isValidSize(sizeNum)) {
        setError(`Size must be greater than ${MIN_ORDER_SIZE}`);
        return;
      }

      // Validate that user has enough shares to sell
      if (availableShares > 0 && sizeNum > availableShares) {
        setError(
          `Insufficient shares. Available: ${formatShares(availableShares)}`
        );
        return;
      }
    }

    if (orderType === "limit") {
      if (!limitPrice) {
        setError("Limit price is required");
        return;
      }

      const cents = parseInt(limitPrice);
      if (!isValidPriceCents(cents)) {
        setError("Price must be between 1 and 99 (0.01 to 0.99)");
        return;
      }
    }

    // Additional checks before placing order
    if (!eoaAddress) {
      setError("Please connect your wallet first");
      return;
    }

    if (isGeoblocked) {
      setError("Trading is not available in your region");
      return;
    }

    if (!clobClient) {
      setError("Trading client not available. Please try again.");
      return;
    }

    const tokenId = getTokenId(selectedOutcome);
    if (!tokenId) {
      if (selectedOutcome === "No" && !selectedMarketData?.clob_no_token_id) {
        setError(
          "No token ID not available for this market. Please try selecting a different market or outcome."
        );
      } else {
        setError("Could not determine token ID for selected market");
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
      setError(
        `Insufficient USDC balance. Available: $${formattedUsdcBalance}`
      );
      return;
    }

    setError(null);
    setSuccess(null);

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
        setSuccess("Order submitted successfully.");
        setSize(""); // Clear size after successful order
        setLimitPrice(""); // Clear limit price

        // Show toast notification with order ID
        showSuccessNotification(
          "Order Submitted Successfully.",
          `Your Order Id: ${result.orderId}`
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
      setError(errorMsg);
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

  return (
    <div className="flex flex-col border border-white/10 rounded-lg overflow-hidden">
      {/* Profile Section */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        {symbolImageUrl ? (
          <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            <Image
              src={symbolImageUrl}
              alt={marketTitle || "Market"}
              width={40}
              height={40}
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white/60 text-xs">?</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">
            {marketTitle || "Market"}
          </div>
          <div className="text-xs text-white/60">No change</div>
        </div>
      </div>

      {/* Buy/Sell Tabs and Market Dropdown */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setActiveTab("buy");
              setSelectedOutcome(null);
            }}
            className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${
              activeTab === "buy"
                ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => {
              setActiveTab("sell");
              setSelectedOutcome(null);
            }}
            className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${
              activeTab === "sell"
                ? "text-[#ffc000] border-b-2 border-[#ffc000] bg-[#0a0a0a]"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Sell
          </button>
        </div>
        <div className="w-32">
          <Select
            value={selectedMarketValue}
            onChange={handleMarketChange}
            options={marketOptions}
            placeholder="Market"
            className="w-full"
          />
        </div>
      </div>

      {/* Yes/No Selection Buttons */}
      <div className="p-4 flex gap-3 bg-[#0a0a0a]">
        <button
          onClick={() => handleOutcomeSelect("Yes")}
          className={`flex-1 py-2 px-2 rounded-lg font-semibold text-white transition-all relative ${
            selectedOutcome === "Yes"
              ? "bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20"
              : "bg-gray-600 hover:bg-gray-500 active:scale-[0.98]"
          }`}
        >
          <div className="flex flex-row items-center justify-center gap-2">
            {selectedOutcome === "Yes" && (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            <span className="text-sm">Yes</span>
            <span className="text-sm font-bold">
              {formatPrice(currentYesPrice)}
            </span>
          </div>
        </button>
        <button
          onClick={() => handleOutcomeSelect("No")}
          className={`flex-1 py-2 px-2 rounded-lg font-semibold text-white transition-all relative ${
            selectedOutcome === "No"
              ? "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20"
              : "bg-gray-600 hover:bg-gray-500 active:scale-[0.98]"
          }`}
        >
          <div className="flex flex-row items-center justify-center gap-2">
            {selectedOutcome === "No" && (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            <span className="text-sm">No</span>
            <span className="text-sm font-bold">
              {formatPrice(currentNoPrice)}
            </span>
          </div>
        </button>
      </div>

      {/* Order Type Toggle */}
      <div className="px-4 py-3 border-t border-white/10">
        <label className="block text-xs text-white/60 mb-2">Order Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setOrderType("market");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              orderType === "market"
                ? "bg-[#ffc000] text-black"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            Market
          </button>
          <button
            onClick={() => {
              setOrderType("limit");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              orderType === "limit"
                ? "bg-[#ffc000] text-black"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            Limit
          </button>
        </div>
      </div>

      {/* Size Input Section */}
      <div className="px-4 py-4 border-t border-white/10">
        {/* Current Market Price */}
        <div className="mb-3 bg-white/5 rounded-lg p-3">
          <p className="text-xs text-white/60 mb-1">Current Market Price</p>
          <p className="text-lg font-bold text-white">
            {formatPrice(
              selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice
            )}
          </p>
        </div>

        {/* Size/Amount Input */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-white/80">
              {activeTab === "buy" ? "Amount" : "Size (shares)"}
            </label>
            {activeTab === "sell" && isTradingSessionComplete && (
              <span className="text-sm text-white/80">
                {selectedOutcome ? (
                  <>Available shares: {formatShares(availableShares)}</>
                ) : (
                  <>
                    Available: Yes {formatShares(availableSharesYes)}, No {formatShares(availableSharesNo)}
                  </>
                )}
              </span>
            )}
          </div>
          <div className="relative">
            {activeTab === "buy" && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-sm pointer-events-none">
                $
              </span>
            )}
            <input
              type="text"
              value={size}
              onChange={(e) => handleSizeChange(e.target.value)}
              placeholder="0"
              className={`w-full py-2 bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-[#ffc000] text-white text-sm placeholder-white/30 ${
                activeTab === "buy" ? "pl-6" : "px-3"
              }`}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Limit Price Input */}
        {orderType === "limit" && (
          <div className="mb-3">
            <label className="block text-sm text-white/80 mb-2">
              Limit Price (¢)
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={limitPrice}
                onChange={(e) => handleLimitPriceChange(e.target.value)}
                placeholder="0"
                maxLength={2}
                className="w-full px-3 py-2 bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-[#ffc000] text-white text-sm placeholder-white/30"
                disabled={isSubmitting}
              />
            </div>
            <p className="text-xs text-white/60 mt-1">
              Enter 1-99 (e.g., 55 = $0.55 or 55¢)
            </p>
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
                <div className="mt-4 bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-sm text-white/60">To win</span>
                        <svg
                          className="w-4 h-4 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-white/60">
                          Avg. Price
                        </span>
                        <span className="text-xs text-white/60">
                          {formatPrice(effectivePrice)}
                        </span>
                        <svg
                          className="w-3 h-3 text-white/40"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-green-500">
                      {formatCurrency(potentialWin)}
                    </span>
                  </div>
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
                <div className="mt-4 bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-sm text-white">
                          You'll receive
                        </span>
                        <svg
                          className="w-4 h-4 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-white/60">
                          Avg. Price
                        </span>
                        <span className="text-xs text-white/60">
                          {formatPrice(effectivePrice)}
                        </span>
                        <svg
                          className="w-3 h-3 text-white/40"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-green-500">
                      {formatCurrency(amountYoullReceive)}
                    </span>
                  </div>
                </div>
              );
            }

            return null;
          })()}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="px-4 py-2 border-t border-white/10">
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {error}
          </div>
        </div>
      )}

      {success && (
        <div className="px-4 py-2 border-t border-white/10">
          <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
            {success}
          </div>
        </div>
      )}

      {/* Profit/Loss Display - Only show on Sell tab when user has a position */}
      {activeTab === "sell" &&
        isTradingSessionComplete &&
        profitLoss !== null &&
        userPosition &&
        availableShares > 0 && (
          <div className="px-4 py-2 border-t border-white/10">
            <div className="text-sm text-white">
              <span className="text-green-500">Profit</span>
              <span className="text-white">/</span>
              <span className="text-red-500">Loss</span>
              <span className="text-white"> if you sell now: </span>
              <span
                className={`font-medium ${
                  profitLoss >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {profitLoss >= 0
                  ? `+${formatCurrency(profitLoss)}`
                  : `-${formatCurrency(Math.abs(profitLoss))}`}
              </span>
            </div>
          </div>
        )}

      {/* USDC Balance Display */}
      {isTradingSessionComplete && (
        <div className="px-4 py-2 border-t border-white/10">
          <div className="text-xs text-white/60">
            USDC Balance:{" "}
            <span className="text-white font-medium">
              ${formattedUsdcBalance}
            </span>
          </div>
        </div>
      )}

      {/* Combined Trade/Initialize Button */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleTrade}
          disabled={isTradeDisabled}
          className={`w-full py-2.5 px-4 rounded-lg font-bold text-base transition-all ${
            isTradeDisabled
              ? "bg-[#ffc000]/30 cursor-not-allowed opacity-50 text-white/70"
              : "bg-[#ffc000] hover:bg-[#ffd000] shadow-lg shadow-[#ffc000]/20 hover:shadow-[#ffc000]/30 active:scale-[0.98] text-black"
          }`}
        >
          {isSubmitting
            ? "Submitting..."
            : !authenticated
            ? activeTab === "buy"
              ? "Place Order"
              : "Sell"
            : isInitializing ||
              (currentStep !== "idle" && !isTradingSessionComplete)
            ? "Initializing..."
            : !isTradingSessionComplete
            ? "Initialize Trading"
            : disableReason
            ? disableReason
            : activeTab === "buy"
            ? "Place Order"
            : "Sell"}
        </button>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}
