"use client";

import {
  useEffect,
  useRef,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { TradingContext } from "@/providers/TradingProvder";
import useTrades, { PolymarketTrade } from "@/hooks/useTrades";
import { useKalshiFills, type KalshiFill } from "@/hooks/useKalshiFills";
import { useMarketTitles } from "@/hooks/useMarketTitle";
import { useWallet } from "@/contexts/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import useUserPositions, { PolymarketPosition } from "@/hooks/useUserPosition";
import useRedeemPosition from "@/hooks/useRedeemPosition";
import useClobOrder from "@/hooks/useClobOrder";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import {
  useDflowPositions,
  type DFlowPosition,
  type DFlowEmptyOutcomeAccount,
} from "@/hooks/useDflowPositions";
import {
  useLimitlessPortfolioTrades,
  useLimitlessPortfolioPositions,
  type LimitlessTrade,
  type LimitlessPosition,
} from "@/hooks/useLimitlessPortfolio";
import { useLimitlessAuth } from "@/hooks/useLimitlessAuth";
import { useLimitlessRedeem } from "@/hooks/useLimitlessRedeem";
import { formatCurrency, formatShares, formatPercentage } from "@/utils/format";
import { DUST_THRESHOLD } from "@/utils/validation";
import { POLLING_DURATION, POLLING_INTERVAL } from "@/constants/query";
import { createPollingInterval } from "@/utils/polling";
import { Checkbox } from "@/components/ui/checkbox";
import {
  showErrorNotification,
  showSuccessNotification,
} from "@/components/ui/notification";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAccount,
  createBurnInstruction,
  createCloseAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

interface MarketInfoModalProps {
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

const formatKalshiDate = (timestamp: number | undefined) => {
  if (timestamp == null || timestamp === 0) return "—";
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
};

/** Kalshi fill price: API may return cents (0-100) or decimal; normalize for display */
const formatKalshiFillPrice = (price: number | undefined): string => {
  if (price == null || typeof price !== "number") return "—";
  const normalized = price > 1 ? price / 100 : price;
  return normalized.toFixed(4);
};

/** Parse Kalshi created_time (ISO or unix ms) for display */
const formatKalshiFillTime = (createdTime: string | undefined): string => {
  if (!createdTime) return "—";
  const date = new Date(createdTime);
  if (Number.isNaN(date.getTime())) return createdTime;
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};

export default function MarketInfoModal({
  isOpen,
  onClose,
}: MarketInfoModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const tradingContext = useContext(TradingContext);
  const { eoaAddress, ethersSigner } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  const {
    user: limitlessUser,
    login: limitlessLogin,
    isLoading: isLimitlessLoginLoading,
    error: limitlessAuthError,
  } = useLimitlessAuth(ethersSigner);
  const safeAddress = derivedSafeAddressFromEoa;
  const clobClient = tradingContext?.clobClient || null;
  const relayClient = tradingContext?.relayClient || null;
  const isTradingSessionComplete = tradingContext?.isTradingSessionComplete;
  const currentStep = tradingContext?.currentStep || "idle";
  const sessionError = tradingContext?.sessionError;
  const initializeTradingSession = tradingContext?.initializeTradingSession;
  const { solanaAddress, source: solanaSource } = useSolanaWalletAddress();
  const { authenticated: privyAuthenticated, user: privyUser } = usePrivy();
  const { isAuthenticated: phantomAuthenticated } = usePhantomConnect();
  const { signAndSendTransaction: privySignAndSend } =
    useSignAndSendTransaction();
  const { wallets: privySolanaWallets, ready: privyWalletsReady } =
    useWallets();
  const privySolanaWallet =
    solanaSource === "privy" && solanaAddress && privyWalletsReady
      ? (privySolanaWallets.find((w) => {
          const addr =
            (w as { address?: string }).address ??
            (w as { accounts?: { address: string }[] }).accounts?.[0]?.address;
          return addr?.toLowerCase() === solanaAddress.toLowerCase();
        }) ?? null)
      : null;
  const [isInitializing, setIsInitializing] = useState(false);
  const [loadingMarketId, setLoadingMarketId] = useState<string | null>(null);
  const [platformTab, setPlatformTab] = useState<
    "polymarket" | "kalshi" | "limitless"
  >("polymarket");
  const [activeTab, setActiveTab] = useState<"trades" | "positions">("trades");
  const [hideDust, setHideDust] = useState(true);
  const [redeemingAsset, setRedeemingAsset] = useState<string | null>(null);
  const [sellingAsset, setSellingAsset] = useState<string | null>(null);
  const [successfulSale, setSuccessfulSale] = useState<string | null>(null);
  const [successfulRedeem, setSuccessfulRedeem] = useState<string | null>(null);
  const [redeemingKalshiMint, setRedeemingKalshiMint] = useState<string | null>(
    null,
  );
  const [closingAccountAddress, setClosingAccountAddress] = useState<
    string | null
  >(null);
  const [redeemingLimitlessSlug, setRedeemingLimitlessSlug] = useState<
    string | null
  >(null);
  const [pendingVerification, setPendingVerification] = useState<
    Map<string, number>
  >(new Map());
  const queryClient = useQueryClient();

  const signAndSendSolanaTransaction = useCallback(
    async (transactionBase64: string): Promise<string> => {
      if (solanaSource === "privy" && privySolanaWallet) {
        const binaryString = atob(transactionBase64);
        const txBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          txBytes[i] = binaryString.charCodeAt(i);
        }
        const result = await privySignAndSend({
          transaction: txBytes,
          wallet: privySolanaWallet,
          chain: "solana:mainnet",
          options: { uiOptions: { showWalletUIs: true } },
        });
        const sigBytes = result.signature;
        if (!sigBytes || sigBytes.length === 0) {
          throw new Error("No signature from Privy");
        }
        return bs58.encode(sigBytes);
      }
      const provider =
        typeof window !== "undefined" &&
        (window as { phantom?: { solana?: unknown } }).phantom?.solana;
      if (
        !provider ||
        typeof (provider as { signAndSendTransaction?: unknown })
          .signAndSendTransaction !== "function"
      ) {
        throw new Error(
          "Phantom wallet not found. Please install Phantom or use Privy.",
        );
      }
      const binaryString = atob(transactionBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const transaction = VersionedTransaction.deserialize(bytes);
      const result = await (
        provider as {
          signAndSendTransaction: (
            tx: unknown,
            opts?: unknown,
          ) => Promise<unknown>;
        }
      ).signAndSendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
      });
      const sig =
        typeof result === "object" && result !== null && "signature" in result
          ? (result as { signature: string }).signature
          : String(result);
      return sig;
    },
    [solanaSource, privySolanaWallet, privySignAndSend],
  );

  const pollKalshiOrderStatus = useCallback(
    async (signature: string): Promise<{ status: string }> => {
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(
          `/api/kalshi/dflow-order-status?signature=${encodeURIComponent(signature)}`,
        );
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const data = (await res.json()) as { status: string };
        if (
          data.status === "closed" ||
          data.status === "failed" ||
          data.status === "expired"
        ) {
          return data;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      return { status: "pending" };
    },
    [],
  );

  const isKalshiRedeemable = useCallback((pos: DFlowPosition): boolean => {
    const status = pos.market?.status;
    const redemptionStatus = pos.redemptionStatus;
    const result = pos.market?.result ?? "";
    if (status !== "determined" && status !== "finalized") return false;
    if (redemptionStatus !== "open") return false;
    // Standard outcome: result matches position
    if (result === "yes" && pos.position === "YES") return true;
    if (result === "no" && pos.position === "NO") return true;
    // Scalar outcome: result empty, scalarOutcomePct set — both YES and NO redeemable
    if (
      result === "" &&
      pos.scalarOutcomePct != null &&
      pos.scalarOutcomePct !== undefined &&
      (pos.position === "YES" || pos.position === "NO")
    ) {
      return true;
    }
    return false;
  }, []);

  const handleKalshiRedeem = useCallback(
    async (pos: DFlowPosition) => {
      if (!solanaAddress) {
        showErrorNotification("Redeem", "Connect your Solana wallet.");
        return;
      }
      const rawAmount = parseInt(pos.rawBalance, 10);
      if (isNaN(rawAmount) || rawAmount <= 0) {
        showErrorNotification("Redeem", "No balance to redeem.");
        return;
      }
      setRedeemingKalshiMint(pos.mint);
      try {
        const params = new URLSearchParams({
          userPublicKey: solanaAddress,
          inputMint: pos.mint,
          outputMint: USDC_MINT,
          amount: rawAmount.toString(),
          slippageBps: "100",
          predictionMarketSlippageBps: "100",
        });
        const orderRes = await fetch(
          `/api/kalshi/dflow-order?${params.toString()}`,
        );
        const orderData = (await orderRes.json()) as {
          transaction?: string;
          code?: number;
          msg?: string;
          error?: string;
        };
        if (!orderRes.ok || orderData.code) {
          const msg =
            orderData.msg ?? orderData.error ?? "Failed to get redeem order";
          throw new Error(msg);
        }
        if (!orderData.transaction) {
          throw new Error("No transaction in order response.");
        }
        const signature = await signAndSendSolanaTransaction(
          orderData.transaction,
        );
        const statusData = await pollKalshiOrderStatus(signature);
        if (statusData.status === "closed") {
          showSuccessNotification(
            "Redeem",
            `Redeemed successfully. Tx: ${signature.slice(0, 8)}...`,
          );
          queryClient.invalidateQueries({
            queryKey: ["dflow-positions", solanaAddress],
          });
        } else if (
          statusData.status === "failed" ||
          statusData.status === "expired"
        ) {
          showErrorNotification(
            "Redeem",
            `Order ${statusData.status}. Try again.`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Redeem failed.";
        showErrorNotification("Redeem", msg);
      } finally {
        setRedeemingKalshiMint(null);
      }
    },
    [
      solanaAddress,
      queryClient,
      signAndSendSolanaTransaction,
      pollKalshiOrderStatus,
    ],
  );

  // Close empty outcome token account and reclaim rent (DFlow recipe: close-outcome-token-accounts)
  const handleCloseEmptyAccount = useCallback(
    async (empty: DFlowEmptyOutcomeAccount) => {
      if (!solanaAddress) {
        showErrorNotification("Reclaim rent", "Connect your Solana wallet.");
        return;
      }
      setClosingAccountAddress(empty.tokenAccountAddress);
      try {
        const connection = new Connection(SOLANA_RPC, "confirmed");
        const tokenAccountPubkey = new PublicKey(empty.tokenAccountAddress);
        const mintPubkey = new PublicKey(empty.mint);
        const ownerPubkey = new PublicKey(solanaAddress);
        const rentRecipientPubkey = ownerPubkey;

        const account = await getAccount(
          connection,
          tokenAccountPubkey,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

        const instructions = [];
        if (account.amount > BigInt(0)) {
          instructions.push(
            createBurnInstruction(
              tokenAccountPubkey,
              mintPubkey,
              ownerPubkey,
              account.amount,
              [],
              TOKEN_2022_PROGRAM_ID,
            ),
          );
        }
        instructions.push(
          createCloseAccountInstruction(
            tokenAccountPubkey,
            rentRecipientPubkey,
            ownerPubkey,
            [],
            TOKEN_2022_PROGRAM_ID,
          ),
        );

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        const message = new TransactionMessage({
          payerKey: ownerPubkey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message();
        const tx = new VersionedTransaction(message);
        const txBytes = tx.serialize();
        let binary = "";
        for (let i = 0; i < txBytes.length; i++) {
          binary += String.fromCharCode(txBytes[i]);
        }
        const transactionBase64 = btoa(binary);

        const signature = await signAndSendSolanaTransaction(transactionBase64);
        showSuccessNotification(
          "Reclaim rent",
          `Closed account. Rent reclaimed. Tx: ${signature.slice(0, 8)}...`,
        );
        queryClient.invalidateQueries({
          queryKey: ["dflow-positions", solanaAddress],
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to close account.";
        showErrorNotification("Reclaim rent", msg);
      } finally {
        setClosingAccountAddress(null);
      }
    },
    [solanaAddress, queryClient, signAndSendSolanaTransaction],
  );

  // Handle market click - search for event by condition ID and navigate to rexmarkets
  const handleMarketClick = async (
    conditionId: string,
    marketTitle: string,
  ) => {
    if (!conditionId) return;

    // Set loading state for this market
    setLoadingMarketId(conditionId);

    try {
      // Search for the event that contains this condition ID
      // We'll search Polymarket events and find which one has this condition ID in its markets
      const searchResponse = await fetch(
        `/api/polymarket/markets?limit=100&active=true&closed=false&archived=false`,
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
          const routeParam =
            foundEvent.slug ||
            foundEvent.ticker ||
            foundEvent.event_ticker ||
            conditionId;

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
            const routeParam =
              market.slug || market.ticker || market.eventTicker || conditionId;

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
        conditionId,
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

  // Kalshi trade history (fills) for Trades tab when on Kalshi
  const {
    data: kalshiFillsData,
    isLoading: isLoadingKalshiFills,
    error: kalshiFillsError,
    refetch: refetchKalshiFills,
  } = useKalshiFills({
    limit: 50,
    enabled: isOpen && platformTab === "kalshi",
  });
  const kalshiFills = kalshiFillsData?.fills ?? [];

  // Limitless portfolio (trades + positions) when Limitless tab is selected
  const {
    data: limitlessTradesData,
    isLoading: isLoadingLimitlessTrades,
    error: limitlessTradesError,
  } = useLimitlessPortfolioTrades({
    limit: 50,
    enabled: isOpen && platformTab === "limitless",
  });
  const limitlessTrades = limitlessTradesData?.trades ?? [];
  const {
    data: limitlessPositions = [],
    isLoading: isLoadingLimitlessPositions,
    error: limitlessPositionsError,
  } = useLimitlessPortfolioPositions({
    enabled: isOpen && platformTab === "limitless",
  });

  // Fetch positions
  const {
    data: positions = [],
    isLoading: isLoadingPositions,
    error: positionsError,
  } = useUserPositions(safeAddress);

  // DFlow (Kalshi) positions and empty outcome accounts (for reclaim rent)
  const {
    data: dflowData,
    isLoading: isLoadingKalshiPositions,
    error: kalshiPositionsError,
  } = useDflowPositions(solanaAddress);
  const kalshiPositions = dflowData?.positions ?? [];
  const emptyOutcomeAccounts = dflowData?.emptyOutcomeAccounts ?? [];

  // Position actions
  const { redeemPosition, isRedeeming } = useRedeemPosition();
  const { submitOrder, isSubmitting } = useClobOrder(clobClient, eoaAddress);
  const { redeem: limitlessRedeem, isRedeeming: isLimitlessRedeemLoading } =
    useLimitlessRedeem();

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
    marketIds,
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
    formatted = formatted.replace(
      /not enough balance \/ allowance/gi,
      "Not enough balance or allowance",
    );
    formatted = formatted.replace(
      /not enough balance\/allowance/gi,
      "Not enough balance or allowance",
    );
    formatted = formatted.replace(
      /not enough balance or allowance/gi,
      "Not enough balance or allowance",
    );

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
        errorMessage =
          typeof errorObj.error === "string"
            ? errorObj.error
            : JSON.stringify(errorObj.error);
      } else if (errorObj.response?.data?.error) {
        errorMessage =
          typeof errorObj.response.data.error === "string"
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
      showSuccessNotification("Sell Order", "Transaction Success");

      setPendingVerification((prev) =>
        new Map(prev).set(position.asset, position.size),
      );

      queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });

      createPollingInterval(
        () => {
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
        },
        POLLING_INTERVAL,
        POLLING_DURATION,
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
      showErrorNotification("Sell Order", errorMessage);
      setSellingAsset(null);
      setSuccessfulSale(null);
    }
  };

  // Limitless: claim winnings after market resolves (CTF redeemPositions on Base)
  const handleLimitlessClaim = useCallback(
    async (marketSlug: string) => {
      if (!eoaAddress) {
        showErrorNotification("Claim", "Connect your wallet to claim winnings.");
        return;
      }
      if (!marketSlug || marketSlug === "—") return;
      setRedeemingLimitlessSlug(marketSlug);
      try {
        const { hash } = await limitlessRedeem(
          eoaAddress as `0x${string}`,
          marketSlug
        );
        showSuccessNotification(
          "Claim winnings",
          `Success. Tx: ${hash.slice(0, 10)}...`
        );
        queryClient.invalidateQueries({
          queryKey: ["limitless-portfolio-positions"],
        });
        queryClient.invalidateQueries({
          queryKey: ["baseBalance", eoaAddress],
        });
      } catch (err) {
        const raw =
          err instanceof Error ? err.message : "Failed to claim winnings.";
        const msg =
          /rejected the request|user denied|user rejected|request was rejected/i.test(
            raw
          )
            ? "User rejected the request."
            : raw;
        showErrorNotification("Claim", msg);
      } finally {
        setRedeemingLimitlessSlug(null);
      }
    },
    [eoaAddress, limitlessRedeem, queryClient]
  );

  // Handle redeem
  const handleRedeem = async (position: PolymarketPosition) => {
    if (!relayClient) {
      showErrorNotification("Redeem Failed", "Relay client not initialized");
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
      showSuccessNotification("Redeem Position", "Transaction Success");

      queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
      queryClient.invalidateQueries({ queryKey: ["polygon-balances"] });

      createPollingInterval(
        () => {
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
          queryClient.invalidateQueries({ queryKey: ["polygon-balances"] });
        },
        POLLING_INTERVAL,
        POLLING_DURATION,
      );

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessfulRedeem(null);
      }, 3000);
    } catch (err) {
      console.error("Failed to redeem position:", err);
      const errorMessage = getErrorMessage(err);
      showErrorNotification("Redeem Position Failed", errorMessage);
      setRedeemingAsset(null);
      setSuccessfulRedeem(null);
    }
  };

  // Refetch data when modal opens
  useEffect(() => {
    if (isOpen && platformTab === "polymarket" && clobClient && safeAddress) {
      if (activeTab === "trades") {
        refetchTrades();
      }
      // Positions are auto-refetched via useUserPositions hook
    }
    if (isOpen && platformTab === "kalshi" && activeTab === "trades") {
      refetchKalshiFills();
    }
  }, [isOpen, platformTab, clobClient, safeAddress, refetchTrades, refetchKalshiFills, activeTab]);

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
              Open Orders
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-400 hover:text-white"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Platform tabs: Polymarket | Kalshi | Limitless */}
          <div className="flex border-b border-white/10 sticky top-[73px] bg-[#0D0D0D] z-10 px-4 sm:px-6">
            <button
              onClick={() => setPlatformTab("polymarket")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                platformTab === "polymarket"
                  ? "border-[#2C59F7] text-[#2C59F7]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              Polymarket
            </button>
            <button
              onClick={() => {
                setPlatformTab("kalshi");
                setActiveTab("trades");
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                platformTab === "kalshi"
                  ? "border-[#17cb91] text-[#17cb91]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              Kalshi
            </button>
            <button
              onClick={() => {
                setPlatformTab("limitless");
                setActiveTab("trades");
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                platformTab === "limitless"
                  ? "border-grey text-white"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              Limitless
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            {/* Kalshi tab: Trades (fills) + Positions (DFlow) like Polymarket */}
            {platformTab === "kalshi" ? (
              <>
                {/* Kalshi sub-tabs: Trades | Positions */}
                <div className="flex border-b border-white/10 sticky top-[73px] bg-[#0D0D0D] z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-0">
                  <button
                    onClick={() => setActiveTab("trades")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                      activeTab === "trades"
                        ? "border-[#17cb91] text-[#17cb91]"
                        : "border-transparent text-gray-400 hover:text-white"
                    }`}
                  >
                    Trades
                  </button>
                  <button
                    onClick={() => setActiveTab("positions")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                      activeTab === "positions"
                        ? "border-[#17cb91] text-[#17cb91]"
                        : "border-transparent text-gray-400 hover:text-white"
                    }`}
                  >
                    Positions
                  </button>
                </div>

                {/* Kalshi Trades Tab: user's fill history (PortfolioApi.getFills) */}
                {platformTab === "kalshi" && activeTab === "trades" && (
                  <>
                    {isLoadingKalshiFills ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#17cb91]"></div>
                      </div>
                    ) : kalshiFillsError ? (
                      <div className="text-center py-8">
                        <p className="text-red-400">
                          Failed to load trade history. Please try again later.
                        </p>
                      </div>
                    ) : kalshiFills.length === 0 ? (
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
                                Time
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {kalshiFills.map((fill: KalshiFill) => {
                              const sideLabel =
                                fill.action === "buy"
                                  ? `BUY ${(fill.side ?? "").toUpperCase()}`
                                  : `SELL ${(fill.side ?? "").toUpperCase()}`;
                              const role = fill.is_taker ? "TAKER" : "MAKER";
                              const ticker = fill.ticker ?? "—";
                              return (
                                <tr
                                  key={fill.fill_id ?? fill.order_id ?? String(Math.random())}
                                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                >
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {ticker !== "—" ? (
                                      <a
                                        href={`/rexmarkets/kalshi/${encodeURIComponent(ticker)}`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          onClose();
                                          router.push(`/rexmarkets/kalshi/${encodeURIComponent(ticker)}`);
                                        }}
                                        className="max-w-[200px] truncate block text-left hover:text-[#17cb91] transition-colors cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid"
                                        title={`View ${ticker} on RexMarkets`}
                                      >
                                        {ticker}
                                      </a>
                                    ) : (
                                      ticker
                                    )}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span
                                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                        fill.action === "buy"
                                          ? "bg-green-500/20 text-green-400"
                                          : "bg-red-500/20 text-red-400"
                                      }`}
                                    >
                                      {sideLabel}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {formatKalshiFillPrice(fill.price)}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {(fill.count ?? 0).toLocaleString(undefined, {
                                      maximumFractionDigits: 4,
                                    })}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                                      {role}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-gray-400 text-xs">
                                    {formatKalshiFillTime(fill.created_time)}
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

                {/* Kalshi Positions Tab: DFlow positions + reclaim rent */}
                {platformTab === "kalshi" && activeTab === "positions" && (
                  <>
                    {!solanaAddress ? (
                      <div className="text-center py-12">
                        <p className="text-gray-400">
                          Connect your Solana wallet to view Kalshi positions.
                        </p>
                      </div>
                    ) : isLoadingKalshiPositions ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#17cb91]"></div>
                      </div>
                    ) : kalshiPositionsError ? (
                      <div className="text-center py-8">
                        <p className="text-red-400">
                          Failed to load Kalshi positions. Please try again later.
                        </p>
                      </div>
                    ) : kalshiPositions.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">
                          No Kalshi positions found.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Market
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Outcome
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Balance
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Redemption
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Open
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Close
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Status
                              </th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                                Redeem
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {kalshiPositions.map((pos) => {
                              const ticker = pos.market?.eventTicker;
                              const title =
                                pos.market?.title ??
                                pos.market?.question ??
                                ticker ??
                                "—";
                              const marketHref = ticker
                                ? `/rexmarkets/kalshi/${encodeURIComponent(ticker)}`
                                : null;
                              const redeemable = isKalshiRedeemable(pos);
                              const isRedeeming = redeemingKalshiMint === pos.mint;
                              return (
                                <tr
                                  key={pos.mint}
                                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                >
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {marketHref ? (
                                      <a
                                        href={marketHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="max-w-[220px] block truncate hover:text-[#17cb91] transition-colors underline decoration-dotted underline-offset-2"
                                        title={`Open ${title} in new tab`}
                                      >
                                        {title}
                                      </a>
                                    ) : (
                                      title
                                    )}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span
                                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                        pos.position === "YES"
                                          ? "bg-green-500/20 text-green-400"
                                          : pos.position === "NO"
                                            ? "bg-red-500/20 text-red-400"
                                            : "bg-gray-500/20 text-gray-400"
                                    }`}
                                    >
                                      {pos.position}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {pos.balance.toLocaleString(undefined, {
                                      maximumFractionDigits: 4,
                                    })}{" "}
                                    shares
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-gray-300 text-xs sm:text-sm">
                                    {pos.redemptionStatus ?? "—"}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-gray-300 text-xs sm:text-sm whitespace-nowrap">
                                    {formatKalshiDate(pos.market?.openTime)}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-gray-300 text-xs sm:text-sm whitespace-nowrap">
                                    {formatKalshiDate(pos.market?.closeTime)}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-white/10 text-gray-300">
                                      {pos.market?.status ?? "—"}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    {redeemable ? (
                                      <button
                                        type="button"
                                        onClick={() => handleKalshiRedeem(pos)}
                                        disabled={isRedeeming}
                                        className={`min-w-[80px] px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                          isRedeeming
                                            ? "bg-yellow-600/70 cursor-wait text-white"
                                            : "bg-[#17cb91] hover:bg-[#14b87d] text-black disabled:opacity-50 disabled:cursor-not-allowed"
                                        }`}
                                      >
                                        {isRedeeming ? (
                                          <span className="flex items-center gap-1.5 justify-center">
                                            <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                            Redeeming...
                                          </span>
                                        ) : (
                                          "Redeem"
                                        )}
                                      </button>
                                    ) : (
                                      <span className="text-gray-500 text-xs">
                                        Not Yet
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Reclaim rent from empty outcome token accounts (DFlow: close-outcome-token-accounts) */}
                    {emptyOutcomeAccounts.length > 0 &&
                      solanaAddress &&
                      !isLoadingKalshiPositions &&
                      !kalshiPositionsError && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <h3 className="text-sm font-medium text-gray-300 mb-2">
                        Reclaim rent from closed positions
                      </h3>
                      <p className="text-xs text-gray-500 mb-3">
                        Empty outcome token accounts can be closed to reclaim
                        SOL rent.
                      </p>
                      <div className="space-y-2">
                        {emptyOutcomeAccounts.map((empty) => {
                          const isClosing =
                            closingAccountAddress === empty.tokenAccountAddress;
                          return (
                            <div
                              key={empty.tokenAccountAddress}
                              className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-white/5"
                            >
                              <span
                                className="text-gray-400 text-xs font-mono truncate max-w-[200px] sm:max-w-[320px]"
                                title={empty.tokenAccountAddress}
                              >
                                {empty.tokenAccountAddress.slice(0, 8)}...
                                {empty.tokenAccountAddress.slice(-6)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCloseEmptyAccount(empty)}
                                disabled={isClosing}
                                className="shrink-0 px-3 py-1.5 rounded text-xs font-medium bg-[#17cb91] hover:bg-[#14b87d] text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {isClosing ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    Closing...
                                  </span>
                                ) : (
                                  "Reclaim rent"
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  </>
                )}
              </>
            ) : platformTab === "limitless" ? (
              <>
                {/* Limitless sub-tabs: Trades | Positions */}
                <div className="flex border-b border-white/10 sticky top-[73px] bg-[#0D0D0D] z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-0">
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

                {/* Limitless Trades */}
                {platformTab === "limitless" && activeTab === "trades" && (
                  <>
                    {!limitlessUser?.sessionCookie ? (
                      <div className="text-center py-12 space-y-4">
                        <p className="text-gray-400">
                          Sign in to Limitless to view your trade history.
                        </p>
                        {!eoaAddress ? (
                          <p className="text-sm text-amber-400">
                            Connect your wallet first to sign in to Limitless.
                          </p>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                const result = await limitlessLogin();
                                if (result) {
                                  queryClient.invalidateQueries({ queryKey: ["limitless-portfolio-trades"] });
                                  queryClient.invalidateQueries({ queryKey: ["limitless-portfolio-positions"] });
                                }
                              }}
                              disabled={isLimitlessLoginLoading || !ethersSigner}
                              className="px-6 py-3 rounded-lg font-semibold text-black bg-[#ffc000] hover:bg-[#ffd000] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isLimitlessLoginLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                  <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                  Signing in...
                                </span>
                              ) : (
                                "Sign in to Limitless"
                              )}
                            </button>
                            {limitlessAuthError && (
                              <p className="text-sm text-red-400">
                                {limitlessAuthError.message}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ) : isLoadingLimitlessTrades ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc000]"></div>
                      </div>
                    ) : limitlessTradesError ? (
                      <div className="text-center py-8">
                        <p className="text-red-400">
                          Failed to load Limitless trades. Please try again.
                        </p>
                      </div>
                    ) : limitlessTrades.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">No trades found.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Market</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Side</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Action</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Price</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Size</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Amount</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {limitlessTrades.map((t: LimitlessTrade, i: number) => {
                              const slugForLink = t.marketSlug ?? t.market ?? "—";
                              const displayTitle = t.market ?? t.marketSlug ?? "—";
                              const side = (t.side ?? t.outcome ?? "—").toString();
                              const actionRaw = (t.action ?? t.strategy ?? "—") as string;
                              const actionLower = actionRaw.toLowerCase();
                              const actionBadgeClass =
                                actionLower === "won"
                                  ? "bg-green-500/20 text-green-300"
                                  : actionLower === "lose" || actionLower === "lost"
                                    ? "bg-red-500/20 text-red-300"
                                    : "bg-white/10 text-white/90";
                              const price = t.price != null ? String(t.price) : "—";
                              const size = t.size ?? "—";
                              const amountRaw = t.amount;
                              const amountStr =
                                amountRaw != null && amountRaw !== ""
                                  ? (() => {
                                      const n = typeof amountRaw === "string" ? parseFloat(amountRaw) : Number(amountRaw);
                                      return Number.isFinite(n) ? `$${n.toFixed(2)}` : String(amountRaw);
                                    })()
                                  : "—";
                              const ts = t.timestamp ?? t.createdAt;
                              const timeStr =
                                ts != null
                                  ? (() => {
                                      const num = typeof ts === "string" && /^\d+$/.test(ts) ? Number(ts) : Number(ts);
                                      if (Number.isFinite(num)) return new Date(num * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
                                      const d = typeof ts === "string" ? new Date(ts) : new Date(Number(ts) * 1000);
                                      return !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
                                    })()
                                  : "—";
                              return (
                                <tr key={t.id ?? `limitless-trade-${i}`} className="border-b border-white/5 hover:bg-white/5">
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {slugForLink !== "—" ? (
                                      <a
                                        href={`/rexmarkets/limitless/${encodeURIComponent(slugForLink)}`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          onClose();
                                          router.push(`/rexmarkets/limitless/${encodeURIComponent(slugForLink)}`);
                                        }}
                                        className="max-w-[200px] truncate block hover:text-[#ffc000] transition-colors underline decoration-dotted"
                                        title={displayTitle}
                                      >
                                        {displayTitle}
                                      </a>
                                    ) : (
                                      displayTitle
                                    )}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-white/10 text-white">
                                      {side}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${actionBadgeClass}`}>
                                      {actionRaw}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">{price}</td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm" title="Outcome tokens (shares) bought or sold">{String(size)}</td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm" title="USDC spent or received (after fees)">{amountStr}</td>
                                  <td className="py-3 px-2 sm:px-4 text-gray-400 text-xs">{timeStr}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* Limitless Positions */}
                {platformTab === "limitless" && activeTab === "positions" && (
                  <>
                    {!limitlessUser?.sessionCookie ? (
                      <div className="text-center py-12 space-y-4">
                        <p className="text-gray-400">
                          Sign in to Limitless to view your positions.
                        </p>
                        {!eoaAddress ? (
                          <p className="text-sm text-amber-400">
                            Connect your wallet first to sign in to Limitless.
                          </p>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                const result = await limitlessLogin();
                                if (result) {
                                  queryClient.invalidateQueries({ queryKey: ["limitless-portfolio-trades"] });
                                  queryClient.invalidateQueries({ queryKey: ["limitless-portfolio-positions"] });
                                }
                              }}
                              disabled={isLimitlessLoginLoading || !ethersSigner}
                              className="px-6 py-3 rounded-lg font-semibold text-black bg-[#ffc000] hover:bg-[#ffd000] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isLimitlessLoginLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                  <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                  Signing in...
                                </span>
                              ) : (
                                "Sign in to Limitless"
                              )}
                            </button>
                            {limitlessAuthError && (
                              <p className="text-sm text-red-400">
                                {limitlessAuthError.message}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ) : isLoadingLimitlessPositions ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc000]"></div>
                      </div>
                    ) : limitlessPositionsError ? (
                      <div className="text-center py-8">
                        <p className="text-red-400">
                          Failed to load Limitless positions. Please try again.
                        </p>
                      </div>
                    ) : limitlessPositions.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">No positions found.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Market</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Outcome</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Size</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Closed</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Expiration</th>
                              <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">Claim</th>
                            </tr>
                          </thead>
                          <tbody>
                            {limitlessPositions.map((p: LimitlessPosition, i: number) => {
                              const slugForLink = p.marketSlug ?? p.market ?? "—";
                              const displayTitle = p.market ?? p.marketSlug ?? "—";
                              const outcome = (p.outcome ?? "—").toString();
                              const size = p.size ?? p.balance ?? "—";
                              const closed = p.marketClosed === true ? "Yes" : p.marketClosed === false ? "No" : "—";
                              const exp = p.expirationDate;
                              const expiration =
                                exp != null && exp !== ""
                                  ? (() => {
                                      const d = typeof exp === "string" ? new Date(exp) : null;
                                      return d && !Number.isNaN(d.getTime())
                                        ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                                        : String(exp);
                                    })()
                                  : "—";
                              const canClaim =
                                closed === "Yes" &&
                                slugForLink !== "—" &&
                                !!eoaAddress;
                              const isClaiming =
                                redeemingLimitlessSlug === slugForLink ||
                                isLimitlessRedeemLoading;
                              return (
                                <tr key={p.id ?? p.tokenId ?? `limitless-pos-${i}`} className="border-b border-white/5 hover:bg-white/5">
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                                    {slugForLink !== "—" ? (
                                      <a
                                        href={`/rexmarkets/limitless/${encodeURIComponent(slugForLink)}`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          onClose();
                                          router.push(`/rexmarkets/limitless/${encodeURIComponent(slugForLink)}`);
                                        }}
                                        className="max-w-[200px] truncate block hover:text-[#ffc000] transition-colors underline decoration-dotted"
                                        title={displayTitle}
                                      >
                                        {displayTitle}
                                      </a>
                                    ) : (
                                      displayTitle
                                    )}
                                  </td>
                                  <td className="py-3 px-2 sm:px-4">
                                    <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-white/10 text-white">
                                      {outcome}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">{String(size)}</td>
                                  <td className="py-3 px-2 sm:px-4 text-white/80 text-xs sm:text-sm">{closed}</td>
                                  <td className="py-3 px-2 sm:px-4 text-white/80 text-xs sm:text-sm">{expiration}</td>
                                  <td className="py-3 px-2 sm:px-4">
                                    {canClaim ? (
                                      <button
                                        type="button"
                                        onClick={() => handleLimitlessClaim(slugForLink)}
                                        disabled={isClaiming}
                                        className={`min-w-[80px] px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                          isClaiming
                                            ? "bg-amber-600/70 cursor-wait text-white"
                                            : "bg-[#ffc000] hover:bg-[#ffd000] text-black disabled:opacity-50 disabled:cursor-not-allowed"
                                        }`}
                                      >
                                        {isClaiming ? (
                                          <span className="flex items-center gap-1.5 justify-center">
                                            <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                            Claiming...
                                          </span>
                                        ) : (
                                          "Claim"
                                        )}
                                      </button>
                                    ) : (
                                      <span className="text-gray-500 text-xs">
                                        {closed !== "Yes" ? "—" : "—"}
                                      </span>
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
            ) : !tradingContext ? (
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
                                },
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
                                              "N/A",
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
                              },
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
                                position.asset,
                              );
                              const isSelling = sellingAsset === position.asset;
                              const isRedeemingPos =
                                redeemingAsset === position.asset;
                              const isSuccessful =
                                successfulSale === position.asset;
                              const isSuccessfulRedeem =
                                successfulRedeem === position.asset;

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
                                          position.title,
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
