"use client";

import { useEffect, useRef, useContext, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { TradingContext } from "@/providers/TradingProvder";
import useTrades, { PolymarketTrade } from "@/hooks/useTrades";
import { useMarketTitles } from "@/hooks/useMarketTitle";
import { useWallet } from "@/contexts/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import useUserPositions, { PolymarketPosition } from "@/hooks/useUserPosition";
import useRedeemPosition from "@/hooks/useRedeemPosition";
import useClobOrder from "@/hooks/useClobOrder";
import { formatCurrency, formatShares, formatPercentage } from "@/utils/format";
import { DUST_THRESHOLD } from "@/utils/validation";
import { POLLING_DURATION, POLLING_INTERVAL } from "@/constants/query";
import { createPollingInterval } from "@/utils/polling";
import { Checkbox } from "@/components/ui/checkbox";
import { showErrorNotification, showSuccessNotification } from "@/components/ui/notification";

interface PolymarketInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (timestamp: number | string) => {
  // Handle both number and string timestamps
  const ts =
    typeof timestamp === "string" ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(ts) || ts === 0) {
    return "N/A";
  }
  return new Date(ts * 1000).toLocaleString();
};

const formatPrice = (price: string) => {
  return parseFloat(price).toFixed(4);
};

const formatSize = (size: string) => {
  return parseFloat(size).toFixed(2);
};

export default function PolymarketInfoModal({
  isOpen,
  onClose,
}: PolymarketInfoModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const tradingContext = useContext(TradingContext);
  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  const safeAddress = derivedSafeAddressFromEoa;
  const clobClient = tradingContext?.clobClient || null;
  const relayClient = tradingContext?.relayClient || null;
  const isTradingSessionComplete = tradingContext?.isTradingSessionComplete;
  const currentStep = tradingContext?.currentStep || "idle";
  const sessionError = tradingContext?.sessionError;
  const initializeTradingSession = tradingContext?.initializeTradingSession;
  const [isInitializing, setIsInitializing] = useState(false);
  const [loadingMarketId, setLoadingMarketId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"trades" | "positions">("trades");
  const [hideDust, setHideDust] = useState(true);
  const [redeemingAsset, setRedeemingAsset] = useState<string | null>(null);
  const [sellingAsset, setSellingAsset] = useState<string | null>(null);
  const [successfulSale, setSuccessfulSale] = useState<string | null>(null);
  const [successfulRedeem, setSuccessfulRedeem] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState<
    Map<string, number>
  >(new Map());
  const queryClient = useQueryClient();

  // Handle market click - search for event by condition ID and navigate to rexmarkets
  const handleMarketClick = async (
    conditionId: string,
    marketTitle: string
  ) => {
    if (!conditionId) return;

    // Set loading state for this market
    setLoadingMarketId(conditionId);

    try {
      // Search for the event that contains this condition ID
      // We'll search Polymarket events and find which one has this condition ID in its markets
      const searchResponse = await fetch(
        `/api/polymarket/markets?limit=100&active=true&closed=false&archived=false`
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const markets = searchData.markets || [];

        // Find the event that contains this condition ID
        let foundEvent = null;
        for (const market of markets) {
          // Check if any of the markets in this event match the condition ID
          if (market.markets && Array.isArray(market.markets)) {
            for (const m of market.markets) {
              // Check various fields where condition ID might be stored
              const marketConditionId =
                m.conditionId || m.condition_id || m.ticker || m.id;
              if (marketConditionId === conditionId) {
                foundEvent = market;
                break;
              }
            }
          }
          if (foundEvent) break;
        }

        if (foundEvent) {
          // Use the event's slug (preferred) or ticker as fallback
          const routeParam = foundEvent.slug || foundEvent.ticker || foundEvent.event_ticker || conditionId;

          // Close the modal and navigate to dedicated route
          onClose();
          router.push(`/rexmarkets/polymarket/${routeParam}`);
          // Clear loading state after a short delay to allow navigation to start
          setTimeout(() => setLoadingMarketId(null), 500);
          return;
        }
      }

      // Fallback: try to use condition ID directly with event_id if we can get it from getMarket
      if (clobClient) {
        try {
          const clobClientAny = clobClient as any;
          const market = await clobClientAny.getMarket(conditionId);
          // The market response might have event information
          if (market?.eventId || market?.event_id) {
            // Use slug if available, otherwise use ticker
            const routeParam = market.slug || market.ticker || market.eventTicker || conditionId;

            onClose();
            router.push(`/rexmarkets/polymarket/${routeParam}`);
            setTimeout(() => setLoadingMarketId(null), 500);
            return;
          }
        } catch (error) {
          console.warn("getMarket failed:", error);
        }
      }

      // Final fallback: use condition ID as event ticker (might cause 404 but better than nothing)
      console.warn(
        "Could not find event for condition ID, using as fallback:",
        conditionId
      );
      onClose();
      router.push(`/rexmarkets/polymarket/${conditionId}`);
      setTimeout(() => setLoadingMarketId(null), 500);
    } catch (error) {
      console.error("Error searching for event:", error);
      // Final fallback
      onClose();
      router.push(`/rexmarkets/polymarket/${conditionId}`);
      setTimeout(() => setLoadingMarketId(null), 500);
    }
  };

  // Fetch trades
  const {
    data: trades = [],
    isLoading: isLoadingTrades,
    error: tradesError,
    refetch: refetchTrades,
  } = useTrades(clobClient, safeAddress as `0x${string}` | undefined, 50);

  // Fetch positions
  const {
    data: positions = [],
    isLoading: isLoadingPositions,
    error: positionsError,
  } = useUserPositions(safeAddress);

  // Position actions
  const { redeemPosition, isRedeeming } = useRedeemPosition();
  const { submitOrder, isSubmitting } = useClobOrder(clobClient, eoaAddress);

  // Extract unique market IDs (condition IDs) from trades
  const marketIds = useMemo(() => {
    const uniqueIds = [
      ...new Set(trades.map((trade) => trade.market).filter(Boolean)),
    ];
    return uniqueIds;
  }, [trades]);

  // Fetch market titles for all unique markets
  const { data: marketTitlesMap = new Map() } = useMarketTitles(
    clobClient,
    marketIds
  );

  // Enrich trades with market titles
  const tradesWithTitles = useMemo(() => {
    return trades.map((trade) => ({
      ...trade,
      marketTitle:
        marketTitlesMap.get(trade.market) || trade.market || "Unknown Market",
    }));
  }, [trades, marketTitlesMap]);

  // Filter positions based on dust threshold
  const activePositions = useMemo(() => {
    if (!positions) return [];

    let filtered = positions.filter((p) => p.size >= DUST_THRESHOLD);

    if (hideDust) {
      filtered = filtered.filter((p) => p.currentValue >= DUST_THRESHOLD);
    }

    return filtered;
  }, [positions, hideDust]);

  // Handle pending verification for positions
  useEffect(() => {
    if (!positions || pendingVerification.size === 0) return;

    const stillPending = new Map<string, number>();

    pendingVerification.forEach((originalSize, asset) => {
      const currentPosition = positions.find((p) => p.asset === asset);
      const currentSize = currentPosition?.size || 0;
      const sizeChanged = currentSize < originalSize;

      if (!sizeChanged) {
        stillPending.set(asset, originalSize);
      }
    });

    if (stillPending.size !== pendingVerification.size) {
      setPendingVerification(stillPending);
    }
  }, [positions, pendingVerification]);

  // Helper function to format error message for better UX
  const formatErrorMessage = (message: string): string => {
    // Capitalize first letter
    let formatted = message.charAt(0).toUpperCase() + message.slice(1);
    
    // Fix common patterns
    formatted = formatted.replace(/not enough balance \/ allowance/gi, "Not enough balance or allowance");
    formatted = formatted.replace(/not enough balance\/allowance/gi, "Not enough balance or allowance");
    formatted = formatted.replace(/not enough balance or allowance/gi, "Not enough balance or allowance");
    
    // Ensure it ends with a period if it doesn't already
    if (formatted && !formatted.match(/[.!?]$/)) {
      formatted += ".";
    }
    
    return formatted;
  };

  // Helper function to extract and format error message
  const getErrorMessage = (err: unknown): string => {
    let errorMessage = "An unexpected error occurred";
    
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === "string") {
      errorMessage = err;
    } else if (err && typeof err === "object") {
      const errorObj = err as any;
      if (errorObj.message) {
        errorMessage = errorObj.message;
      } else if (errorObj.error) {
        errorMessage = typeof errorObj.error === "string"
          ? errorObj.error
          : JSON.stringify(errorObj.error);
      } else if (errorObj.response?.data?.error) {
        errorMessage = typeof errorObj.response.data.error === "string"
          ? errorObj.response.data.error
          : JSON.stringify(errorObj.response.data.error);
      } else if (errorObj.response?.data?.message) {
        errorMessage = errorObj.response.data.message;
      }
    }
    
    return formatErrorMessage(errorMessage);
  };

  // Handle market sell
  const handleMarketSell = async (position: PolymarketPosition) => {
    setSellingAsset(position.asset);
    setSuccessfulSale(null);
    try {
      await submitOrder({
        tokenId: position.asset,
        size: position.size,
        side: "SELL",
        negRisk: position.negativeRisk,
        isMarketOrder: true,
      });

      // Show success message after order is submitted
      setSuccessfulSale(position.asset);
      setSellingAsset(null);

      // Show success notification
      showSuccessNotification("Sell Order", "Transaction Success", {
        position: "top-right",
      });

      setPendingVerification((prev) =>
        new Map(prev).set(position.asset, position.size)
      );

      queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });

      createPollingInterval(
        () => {
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
        },
        POLLING_INTERVAL,
        POLLING_DURATION
      );

      setTimeout(() => {
        setPendingVerification((prev) => {
          const next = new Map(prev);
          next.delete(position.asset);
          return next;
        });
      }, POLLING_DURATION);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessfulSale(null);
      }, 3000);
    } catch (err) {
      console.error("Failed to sell position:", err);
      const errorMessage = getErrorMessage(err);
      showErrorNotification("Sell Order", errorMessage, {
        position: "top-right",
      });
      setSellingAsset(null);
      setSuccessfulSale(null);
    }
  };

  // Handle redeem
  const handleRedeem = async (position: PolymarketPosition) => {
    if (!relayClient) {
      showErrorNotification("Redeem Failed", "Relay client not initialized", {
        position: "top-right",
      });
      return;
    }

    setRedeemingAsset(position.asset);
    setSuccessfulRedeem(null);
    try {
      await redeemPosition(relayClient, {
        conditionId: position.conditionId,
        outcomeIndex: position.outcomeIndex,
        negativeRisk: position.negativeRisk,
        size: position.size,
      });

      // Show success message after redemption is submitted
      setSuccessfulRedeem(position.asset);
      setRedeemingAsset(null);

      // Show success notification
      showSuccessNotification("Redeem Position", "Transaction Success", {
        position: "top-right",
      });

      queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
      queryClient.invalidateQueries({ queryKey: ["polygon-balances"] });

      createPollingInterval(
        () => {
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
          queryClient.invalidateQueries({ queryKey: ["polygon-balances"] });
        },
        POLLING_INTERVAL,
        POLLING_DURATION
      );

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessfulRedeem(null);
      }, 3000);
    } catch (err) {
      console.error("Failed to redeem position:", err);
      const errorMessage = getErrorMessage(err);
      showErrorNotification("Redeem Position Failed", errorMessage, {
        position: "top-right",
      });
      setRedeemingAsset(null);
      setSuccessfulRedeem(null);
    }
  };

  // Refetch data when modal opens
  useEffect(() => {
    if (isOpen && clobClient && safeAddress) {
      if (activeTab === "trades") {
        refetchTrades();
      }
      // Positions are auto-refetched via useUserPositions hook
    }
  }, [isOpen, clobClient, safeAddress, refetchTrades, activeTab]);

  // Handle click outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          ref={modalRef}
          className="w-[90%] max-w-4xl bg-[#0D0D0D] rounded-xl shadow-2xl border border-white/10 pointer-events-auto max-h-[85vh] overflow-y-auto custom-sidebar-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 sticky top-0 bg-[#0D0D0D] z-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Polymarket Trading
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-400 hover:text-white"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            {!tradingContext ? (
              <div className="text-center py-8">
                <p className="text-gray-400">
                  Trading provider not available. Please navigate to the trading
                  page to view data.
                </p>
              </div>
            ) : !clobClient || !safeAddress || !isTradingSessionComplete ? (
              <div className="text-center py-8 space-y-4">
                <p className="text-gray-400">
                  {!eoaAddress
                    ? "Please connect your wallet to view trading data."
                    : "Please initialize trading session to view data."}
                </p>
                {eoaAddress && initializeTradingSession && (
                  <div className="space-y-3">
                    <button
                      onClick={async () => {
                        if (!initializeTradingSession) return;
                        setIsInitializing(true);
                        try {
                          await initializeTradingSession();
                        } catch (error) {
                          console.error("Failed to initialize trading:", error);
                        } finally {
                          setIsInitializing(false);
                        }
                      }}
                      disabled={
                        isInitializing ||
                        currentStep !== "idle" ||
                        isTradingSessionComplete
                      }
                      className="px-6 py-3 bg-[#ffc000] text-black font-semibold rounded-lg hover:bg-[#ffd633] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#ffc000]"
                    >
                      {isInitializing || currentStep !== "idle" ? (
                        <span className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                          {currentStep === "checking"
                            ? "Checking..."
                            : currentStep === "deploying"
                            ? "Deploying Safe..."
                            : currentStep === "credentials"
                            ? "Setting up credentials..."
                            : currentStep === "approvals"
                            ? "Setting approvals..."
                            : "Initializing..."}
                        </span>
                      ) : (
                        "Initialize Trading"
                      )}
                    </button>
                    {sessionError && (
                      <p className="text-red-400 text-sm mt-2">
                        {sessionError.message ||
                          "Failed to initialize trading session"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div className="flex border-b border-white/10 sticky top-[73px] bg-[#0D0D0D] z-10 -mx-4 sm:-mx-6 px-4 sm:px-6">
                  <button
                    onClick={() => setActiveTab("trades")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                      activeTab === "trades"
                        ? "border-[#ffc000] text-[#ffc000]"
                        : "border-transparent text-gray-400 hover:text-white"
                    }`}
                  >
                    Trades
                  </button>
                  <button
                    onClick={() => setActiveTab("positions")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                      activeTab === "positions"
                        ? "border-[#ffc000] text-[#ffc000]"
                        : "border-transparent text-gray-400 hover:text-white"
                    }`}
                  >
                    Positions
                  </button>
                </div>

                {/* Trades Tab */}
                {activeTab === "trades" && (
                  <>
                    {isLoadingTrades ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc000]"></div>
                      </div>
                    ) : tradesError ? (
                      <div className="text-center py-8">
                        <p className="text-red-400">
                          Failed to load trades. Please try again later.
                        </p>
                      </div>
                    ) : trades.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">
                          No trades found.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Market{" "}
                                <span className="text-gray-500 text-xs font-normal">
                                  (Click to view)
                                </span>
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Side
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Price
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Size
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Role
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Status
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Time
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tradesWithTitles.map(
                              (
                                trade: PolymarketTrade & {
                                  marketTitle?: string;
                                }
                              ) => {
                                const isMaker =
                                  (trade.maker_address || "").toLowerCase() ===
                                  (safeAddress || "").toLowerCase();
                                const role =
                                  trade.trader_side ||
                                  (isMaker ? "MAKER" : "TAKER");

                                return (
                                  <tr
                                    key={trade.id}
                                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                  >
                                    <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                      <button
                                        onClick={() =>
                                          handleMarketClick(
                                            trade.market ||
                                              trade.asset_id ||
                                              "",
                                            trade.marketTitle ||
                                              trade.market ||
                                              trade.asset_id ||
                                              "N/A"
                                          )
                                        }
                                        disabled={
                                          loadingMarketId ===
                                          (trade.market || trade.asset_id || "")
                                        }
                                        className="max-w-[200px] truncate text-left hover:text-[#ffc000] transition-colors cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
                                        title={`Click to view ${
                                          trade.marketTitle ||
                                          trade.market ||
                                          trade.asset_id ||
                                          "N/A"
                                        }`}
                                      >
                                        {loadingMarketId ===
                                        (trade.market ||
                                          trade.asset_id ||
                                          "") ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#ffc000] flex-shrink-0"></div>
                                            <span className="truncate">
                                              {trade.marketTitle ||
                                                trade.market ||
                                                trade.asset_id ||
                                                "N/A"}
                                            </span>
                                          </>
                                        ) : (
                                          trade.marketTitle ||
                                          trade.market ||
                                          trade.asset_id ||
                                          "N/A"
                                        )}
                                      </button>
                                    </td>
                                    <td className="py-3 px-2 sm:px-4">
                                      <span
                                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                          trade.side === "BUY"
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-red-500/20 text-red-400"
                                        }`}
                                      >
                                        {trade.side}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                      {formatPrice(trade.price)}
                                    </td>
                                    <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                      {formatSize(trade.size)}
                                    </td>
                                    <td className="py-3 px-2 sm:px-4">
                                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                                        {role}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2 sm:px-4">
                                      <span
                                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                          trade.status === "CONFIRMED"
                                            ? "bg-green-500/20 text-green-400"
                                            : trade.status === "PENDING"
                                            ? "bg-yellow-500/20 text-yellow-400"
                                            : "bg-gray-500/20 text-gray-400"
                                        }`}
                                      >
                                        {trade.status || "N/A"}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2 sm:px-4 text-gray-400 text-xs">
                                      {formatDate(trade.match_time)}
                                    </td>
                                  </tr>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* Positions Tab */}
                {activeTab === "positions" && (
                  <>
                    {/* Position Filters with Dust Warning */}
                    <div className="flex items-center justify-between gap-3 mb-4 mt-4">
                      {hideDust &&
                        positions &&
                        positions.length > activePositions.length && (
                          <span className="text-yellow-300 text-sm">
                            Hiding {positions.length - activePositions.length}{" "}
                            dust position(s) (value &lt; $
                            {DUST_THRESHOLD.toFixed(2)})
                          </span>
                        )}
                      <div className="ml-auto">
                        <Checkbox
                          checked={!hideDust}
                          onChange={(checked) => setHideDust(!checked)}
                          label="Show All"
                        />
                      </div>
                    </div>

                    {isLoadingPositions ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc000]"></div>
                      </div>
                    ) : positionsError ? (
                      <div className="text-center py-8">
                        <p className="text-red-400">
                          Failed to load positions. Please try again later.
                        </p>
                      </div>
                    ) : activePositions.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">
                          No open positions found.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Market{" "}
                                <span className="text-gray-500 text-xs font-normal">
                                  (Click to view)
                                </span>
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Outcome
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Size
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Avg Price
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Current Price
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Current Value
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                P&L
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {activePositions.map((position) => {
                              const isPending = pendingVerification.has(
                                position.asset
                              );
                              const isSelling = sellingAsset === position.asset;
                              const isRedeemingPos =
                                redeemingAsset === position.asset;
                              const isSuccessful = successfulSale === position.asset;
                              const isSuccessfulRedeem = successfulRedeem === position.asset;

                              return (
                                <tr
                                  key={`${position.conditionId}-${position.outcomeIndex}`}
                                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                >
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    <button
                                      onClick={() =>
                                        handleMarketClick(
                                          position.conditionId,
                                          position.title
                                        )
                                      }
                                      disabled={
                                        loadingMarketId === position.conditionId
                                      }
                                      className="max-w-[200px] truncate text-left hover:text-[#ffc000] transition-colors cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
                                      title={`Click to view ${position.title}`}
                                    >
                                      {loadingMarketId ===
                                      position.conditionId ? (
                                        <>
                                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#ffc000] flex-shrink-0"></div>
                                          <span className="truncate">
                                            {position.title}
                                          </span>
                                        </>
                                      ) : (
                                        position.title
                                      )}
                                    </button>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {position.outcome}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {formatShares(position.size)} shares
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {formatCurrency(position.avgPrice, 3)}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {formatCurrency(position.curPrice, 3)}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {formatCurrency(position.currentValue)}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span
                                      className={`text-xs sm:text-sm font-medium ${
                                        position.cashPnl >= 0
                                          ? "text-green-400"
                                          : "text-red-400"
                                      }`}
                                    >
                                      {formatCurrency(position.cashPnl)} (
                                      {formatPercentage(position.percentPnl)})
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    {position.redeemable ? (
                                      <div className="flex flex-col items-end gap-1">
                                        <button
                                          onClick={() => handleRedeem(position)}
                                          disabled={
                                            isRedeemingPos ||
                                            !relayClient ||
                                            isSuccessfulRedeem
                                          }
                                          className={`min-w-[80px] px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                            isSuccessfulRedeem
                                              ? "bg-green-600/70 cursor-default text-white"
                                              : isRedeemingPos
                                              ? "bg-yellow-600/70 cursor-wait text-white"
                                              : "bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white"
                                          }`}
                                        >
                                          {isSuccessfulRedeem ? (
                                            <span className="flex items-center gap-1.5">
                                              <svg
                                                className="w-3 h-3"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M5 13l4 4L19 7"
                                                />
                                              </svg>
                                              Success
                                            </span>
                                          ) : isRedeemingPos ? (
                                            <span className="flex items-center gap-1.5">
                                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                              Signing...
                                            </span>
                                          ) : (
                                            "Redeem"
                                          )}
                                        </button>
                                        {isSuccessfulRedeem && (
                                          <span className="text-green-400 text-xs font-medium animate-pulse">
                                            Transaction Success
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-end gap-1">
                                        <button
                                          onClick={() =>
                                            handleMarketSell(position)
                                          }
                                          disabled={
                                            isSelling ||
                                            isSubmitting ||
                                            !clobClient ||
                                            isPending ||
                                            isSuccessful
                                          }
                                          className={`min-w-[80px] px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                            isSuccessful
                                              ? "bg-green-600/70 cursor-default text-white"
                                              : isSelling || isPending
                                              ? "bg-yellow-600/70 cursor-wait text-white"
                                              : "bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white"
                                          }`}
                                        >
                                          {isSuccessful ? (
                                            <span className="flex items-center gap-1.5">
                                              <svg
                                                className="w-3 h-3"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M5 13l4 4L19 7"
                                                />
                                              </svg>
                                              Success
                                            </span>
                                          ) : isSelling ? (
                                            <span className="flex items-center gap-1.5">
                                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                              Signing...
                                            </span>
                                          ) : isPending ? (
                                            "Processing..."
                                          ) : (
                                            "Sell"
                                          )}
                                        </button>
                                        {isSuccessful && (
                                          <span className="text-green-400 text-xs font-medium animate-pulse">
                                            Transaction Success
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
