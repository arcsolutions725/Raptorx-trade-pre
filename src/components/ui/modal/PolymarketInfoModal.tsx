"use client";

import { useEffect, useRef, useContext, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, CircleAlert, List, Wallet } from "lucide-react";
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
import {
  AcctEmpty,
  AcctLoading,
  AcctModal,
  AcctModalHead,
  AcctTabs,
} from "@/components/ui/modal/accountUi";

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

  const initBusy = isInitializing || currentStep !== "idle";

  return (
    <AcctModal labelledBy="pm-info-title" variant="orders" modalRef={modalRef}>
      <AcctModalHead
        id="pm-info-title"
        title="Polymarket trading"
        onClose={onClose}
        closeLabel="Close Polymarket trading"
      />

      {tradingContext && clobClient && safeAddress && isTradingSessionComplete ? (
        <div className="o-bar">
          <AcctTabs
            tabs={[
              ["trades", "Trades"],
              ["positions", "Positions"],
            ]}
            active={activeTab}
            onChange={setActiveTab}
            label="Polymarket trading"
            idPrefix="pm-info"
          />
        </div>
      ) : null}

      <div className="acct-modal__body">
        {!tradingContext ? (
          <AcctEmpty icon={<CircleAlert className="size-5" />} title="Trading provider not available">
            Please navigate to the trading page to view data.
          </AcctEmpty>
        ) : !clobClient || !safeAddress || !isTradingSessionComplete ? (
          <AcctEmpty
            icon={<Wallet className="size-5" />}
            title={!eoaAddress ? "Connect your wallet" : "Start a trading session"}
            action={
              eoaAddress && initializeTradingSession ? (
                <>
                  <button
                    type="button"
                    className="rx-btn rx-btn--primary"
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
                    aria-busy={initBusy || undefined}
                  >
                    {initBusy ? (
                      <>
                        <span className="rx-spin" aria-hidden="true" />
                        {currentStep === "checking"
                          ? "Checking…"
                          : currentStep === "deploying"
                            ? "Deploying Safe…"
                            : currentStep === "credentials"
                              ? "Setting up credentials…"
                              : currentStep === "approvals"
                                ? "Setting approvals…"
                                : "Initializing…"}
                      </>
                    ) : (
                      "Initialize trading"
                    )}
                  </button>
                  {sessionError && (
                    <p className="rx-help rx-help--error">
                      {sessionError.message ||
                        "Failed to initialize trading session"}
                    </p>
                  )}
                </>
              ) : undefined
            }
          >
            {!eoaAddress
              ? "Please connect your wallet to view trading data."
              : "Please initialize trading session to view data."}
          </AcctEmpty>
        ) : activeTab === "trades" ? (
          isLoadingTrades ? (
            <AcctLoading label="Loading trades" />
          ) : tradesError ? (
            <AcctEmpty
              tone="error"
              icon={<CircleAlert className="size-5" />}
              title="Failed to load trades"
            >
              Please try again later.
            </AcctEmpty>
          ) : trades.length === 0 ? (
            <AcctEmpty icon={<List className="size-5" />} title="No trades found" />
          ) : (
            <div className="pm-scroll">
              <table className="o-table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Size</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesWithTitles.map(
                    (
                      trade: PolymarketTrade & {
                        marketTitle?: string;
                      },
                    ) => {
                      const isMaker =
                        (trade.maker_address || "").toLowerCase() ===
                        (safeAddress || "").toLowerCase();
                      const role =
                        trade.trader_side || (isMaker ? "MAKER" : "TAKER");
                      const marketId = trade.market || trade.asset_id || "";
                      const name =
                        trade.marketTitle ||
                        trade.market ||
                        trade.asset_id ||
                        "N/A";

                      return (
                        <tr key={trade.id}>
                          <td>
                            <button
                              type="button"
                              className="o-name"
                              onClick={() => handleMarketClick(marketId, name)}
                              disabled={loadingMarketId === marketId}
                              title={`Click to view ${name}`}
                            >
                              {loadingMarketId === marketId ? (
                                <span className="rx-spin" aria-hidden="true" />
                              ) : null}
                              <span>
                                <b>{name}</b>
                              </span>
                            </button>
                          </td>
                          <td>
                            <span
                              className={clsx(
                                "rx-badge",
                                trade.side === "BUY" ? "rx-badge--up" : "rx-badge--down",
                              )}
                            >
                              {trade.side}
                            </span>
                          </td>
                          <td className="rx-num">{formatPrice(trade.price)}</td>
                          <td className="rx-num">{formatSize(trade.size)}</td>
                          <td>
                            <span className="rx-badge rx-badge--neutral">{role}</span>
                          </td>
                          <td>
                            <span
                              className={clsx(
                                "rx-badge",
                                trade.status === "CONFIRMED"
                                  ? "rx-badge--up"
                                  : trade.status === "PENDING"
                                    ? "rx-badge--gold"
                                    : "rx-badge--neutral",
                              )}
                            >
                              {trade.status || "N/A"}
                            </span>
                          </td>
                          <td className="o-muted rx-num">
                            {formatDate(trade.match_time)}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <>
            {/* Position filters with the dust note */}
            <div className="o-tools">
              {hideDust && positions && positions.length > activePositions.length ? (
                <span className="o-hint">
                  Hiding {positions.length - activePositions.length} dust
                  position(s) (value &lt; ${DUST_THRESHOLD.toFixed(2)})
                </span>
              ) : (
                <span />
              )}
              <div className="ml-auto">
                <Checkbox
                  checked={!hideDust}
                  onChange={(checked) => setHideDust(!checked)}
                  label="Show all"
                />
              </div>
            </div>

            {isLoadingPositions ? (
              <AcctLoading label="Loading positions" />
            ) : positionsError ? (
              <AcctEmpty
                tone="error"
                icon={<CircleAlert className="size-5" />}
                title="Failed to load positions"
              >
                Please try again later.
              </AcctEmpty>
            ) : activePositions.length === 0 ? (
              <AcctEmpty icon={<List className="size-5" />} title="No open positions found" />
            ) : (
              <div className="pm-scroll">
                <table className="o-table">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Outcome</th>
                      <th>Size</th>
                      <th>Avg price</th>
                      <th>Current price</th>
                      <th>Current value</th>
                      <th>P&amp;L</th>
                      <th className="o-act">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePositions.map((position) => {
                      const isPending = pendingVerification.has(position.asset);
                      const isSelling = sellingAsset === position.asset;
                      const isRedeemingPos = redeemingAsset === position.asset;
                      const isSuccessful = successfulSale === position.asset;
                      const isSuccessfulRedeem = successfulRedeem === position.asset;

                      return (
                        <tr key={`${position.conditionId}-${position.outcomeIndex}`}>
                          <td>
                            <button
                              type="button"
                              className="o-name"
                              onClick={() =>
                                handleMarketClick(position.conditionId, position.title)
                              }
                              disabled={loadingMarketId === position.conditionId}
                              title={`Click to view ${position.title}`}
                            >
                              {loadingMarketId === position.conditionId ? (
                                <span className="rx-spin" aria-hidden="true" />
                              ) : null}
                              <span>
                                <b>{position.title}</b>
                              </span>
                            </button>
                          </td>
                          <td>
                            <span className="o-side gold">{position.outcome}</span>
                          </td>
                          <td className="rx-num">{formatShares(position.size)} shares</td>
                          <td className="rx-num">{formatCurrency(position.avgPrice, 3)}</td>
                          <td className="rx-num">{formatCurrency(position.curPrice, 3)}</td>
                          <td className="rx-num">{formatCurrency(position.currentValue)}</td>
                          <td className={clsx("rx-num", position.cashPnl >= 0 ? "up" : "down")}>
                            {formatCurrency(position.cashPnl)} (
                            {formatPercentage(position.percentPnl)})
                          </td>
                          <td className="o-act">
                            <span className="o-act__in">
                              {position.redeemable ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRedeem(position)}
                                    disabled={
                                      isRedeemingPos || !relayClient || isSuccessfulRedeem
                                    }
                                    aria-busy={isRedeemingPos || undefined}
                                    className={clsx(
                                      "rx-btn rx-btn--s",
                                      isSuccessfulRedeem ? "o-btn-ok" : "rx-btn--primary",
                                    )}
                                  >
                                    {isSuccessfulRedeem ? (
                                      <>
                                        <Check className="size-3" aria-hidden="true" />
                                        Success
                                      </>
                                    ) : isRedeemingPos ? (
                                      <>
                                        <span className="rx-spin" aria-hidden="true" />
                                        Signing…
                                      </>
                                    ) : (
                                      "Redeem"
                                    )}
                                  </button>
                                  {isSuccessfulRedeem && (
                                    <span className="o-ok">Transaction success</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleMarketSell(position)}
                                    disabled={
                                      isSelling ||
                                      isSubmitting ||
                                      !clobClient ||
                                      isPending ||
                                      isSuccessful
                                    }
                                    aria-busy={isSelling || isPending || undefined}
                                    className={clsx(
                                      "rx-btn rx-btn--s",
                                      isSuccessful ? "o-btn-ok" : "rx-btn--danger",
                                    )}
                                  >
                                    {isSuccessful ? (
                                      <>
                                        <Check className="size-3" aria-hidden="true" />
                                        Success
                                      </>
                                    ) : isSelling ? (
                                      <>
                                        <span className="rx-spin" aria-hidden="true" />
                                        Signing…
                                      </>
                                    ) : isPending ? (
                                      "Processing…"
                                    ) : (
                                      "Sell"
                                    )}
                                  </button>
                                  {isSuccessful && (
                                    <span className="o-ok">Transaction success</span>
                                  )}
                                </>
                              )}
                            </span>
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
      </div>
    </AcctModal>
  );
}
