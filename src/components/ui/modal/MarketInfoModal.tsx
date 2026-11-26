"use client";

import {
  useEffect,
  useRef,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy, useWallets as usePrivyEvmWallets } from "@privy-io/react-auth";
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
import useActiveOrders, { type PolymarketOrder } from "@/hooks/useActiveOrder";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { useBaseBalance } from "@/hooks/useBaseBalance";
import { useMyriadBscBalances } from "@/hooks/useMyriadBscBalances";
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
import {
  useMyriadOrdersHistory,
  useMyriadUserMarketsModal,
  useMyriadUserTradeEvents,
} from "@/hooks/useMyriadOpenOrdersModal";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";
import { MYRIAD_PREDICTION_MARKET_BSC } from "@/lib/myriad/predictionMarket";
import {
  myriadPriceWeiToDecimal,
  myriadShareWeiToNumber,
} from "@/lib/myriad/parseMyriadModalApi";
import { formatCurrency, formatShares, formatPercentage } from "@/utils/format";
import { DUST_THRESHOLD } from "@/utils/validation";
import { POLLING_DURATION, POLLING_INTERVAL } from "@/constants/query";
import { createPollingInterval } from "@/utils/polling";
import {
  showErrorNotification,
  showSuccessNotification,
} from "@/components/ui/notification";
import PredictFunMarketInfoPanel from "@/components/ui/modal/PredictFunMarketInfoPanel";
import { AcctModal, AcctTabs } from "@/components/ui/modal/accountUi";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import {
  BusyLabel,
  CancelOrderButton,
  DepositButton,
  FillBar,
  MarketName,
  OrdersBrowseProvider,
  OrdersHead,
  OrdersLoading,
  OrdersState,
  OrdersSummary,
  RecordTable,
  RxToggle,
  SideTag,
  StatusBadge,
  SuccessNote,
  TabCount,
  VenueSeg,
  ORDERS_VENUES,
  type OrdersVenue,
  type RecordColumn,
  type SummaryItem,
  type Tone,
} from "@/components/ui/modal/ordersUi";
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

/** View tabs. "open" (open orders) exists for Polymarket only: it is the one venue with both an
 *  open-orders feed (useActiveOrders) and a cancel call (useClobOrder.cancelOrder). */
type OrdersView = "open" | "positions" | "trades";

interface MarketInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tab to show when the dialog opens (account links: "My orders and positions", "Trade history"). */
  initialTab?: OrdersView;
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

/** Numeric string from the CLOB ("0.34", "120") → number; 0 when missing. */
const toNum = (v: string | number | undefined | null): number => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
};

/** Open order limit price as cents ("34¢", "70.5¢"). */
const formatCents = (price: string): string => {
  const n = parseFloat(price);
  if (!Number.isFinite(n)) return "—";
  return `${Number((n * 100).toFixed(1))}¢`;
};

/** Open order age ("2m ago", "3h ago", then the date). created_at is unix seconds. */
const formatOrderAge = (createdAt: number | undefined): string => {
  if (!createdAt) return "—";
  const ms = createdAt < 1e12 ? createdAt * 1000 : createdAt;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Value still resting on the book: unfilled shares × limit price. */
const openOrderValue = (o: PolymarketOrder): number =>
  Math.max(0, toNum(o.original_size) - toNum(o.size_matched)) * toNum(o.price);

export default function MarketInfoModal({
  isOpen,
  onClose,
  initialTab,
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
  const { wallets: evmWallets } = usePrivyEvmWallets();
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
    "polymarket" | "kalshi" | "limitless" | "myriad" | "predictfun"
  >("polymarket");
  const [activeTab, setActiveTab] = useState<OrdersView>("trades");
  // Opened from an account link: start on the tab it names.
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);
  /** Open orders: the row waiting for "Confirm cancel", the one being canceled, and the ones
   *  canceled this session (hidden right away, before the next poll drops them). */
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [canceledOrderIds, setCanceledOrderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    if (!isOpen) setConfirmCancelId(null);
  }, [isOpen]);
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
  const [redeemingMyriadMarketId, setRedeemingMyriadMarketId] = useState<
    number | null
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

  const myriadModalEnabled = isOpen && platformTab === "myriad";
  const {
    data: myriadOrders = [],
    isLoading: isLoadingMyriadOrders,
    error: myriadOrdersError,
    refetch: refetchMyriadOrders,
  } = useMyriadOrdersHistory(eoaAddress, myriadModalEnabled);
  const {
    data: myriadUserEvents = [],
    isLoading: isLoadingMyriadUserEvents,
    error: myriadUserEventsError,
    refetch: refetchMyriadUserEvents,
  } = useMyriadUserTradeEvents(eoaAddress, myriadModalEnabled);
  const {
    data: myriadUserMarkets = [],
    isLoading: isLoadingMyriadUserMarkets,
    error: myriadUserMarketsError,
    refetch: refetchMyriadUserMarkets,
  } = useMyriadUserMarketsModal(eoaAddress, myriadModalEnabled);

  const myriadMarketMetaById = useMemo(() => {
    const m = new Map<number, { slug: string; title: string }>();
    for (const row of myriadUserMarkets) {
      m.set(row.marketId, { slug: row.slug, title: row.title });
    }
    return m;
  }, [myriadUserMarkets]);

  /** Positions tab: only list markets where Yes or No shares exceed dust threshold. */
  const MYRIAD_MODAL_POSITION_MIN_SHARES = 0.01;
  const myriadUserMarketsVisible = useMemo(
    () =>
      myriadUserMarkets.filter(
        (r) =>
          r.yesShares > MYRIAD_MODAL_POSITION_MIN_SHARES ||
          r.noShares > MYRIAD_MODAL_POSITION_MIN_SHARES,
      ),
    [myriadUserMarkets],
  );

  const myriadOrdersSorted = useMemo(() => {
    return [...myriadOrders].sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });
  }, [myriadOrders]);

  const myriadUserEventsSorted = useMemo(() => {
    return [...myriadUserEvents].sort((a, b) => b.timestamp - a.timestamp);
  }, [myriadUserEvents]);

  /** On-chain events + CLOB orders, newest first — same columns as Polymarket trades table. */
  const myriadUnifiedTradesRows = useMemo(() => {
    const outcomeWord = (outcomeId: number) => (outcomeId === 1 ? "No" : "Yes");

    type UnifiedRow =
      | {
          kind: "event";
          key: string;
          marketTitle: string;
          slugForLink: string;
          sideLabel: string;
          sideTone: "buy" | "sell" | "claim" | "neutral";
          priceDisplay: string;
          sizeDisplay: string;
          role: string;
          statusLabel: string;
          statusStyle:
            | "confirmed"
            | "open"
            | "cancelled"
            | "pending"
            | "expired"
            | "muted";
          timeStr: string;
          sortMs: number;
        }
      | {
          kind: "order";
          key: string;
          marketTitle: string;
          slugForLink: string;
          sideLabel: string;
          isBuySide: boolean;
          priceDisplay: string;
          sizeDisplay: string;
          role: string;
          statusLabel: string;
          statusStyle:
            | "confirmed"
            | "open"
            | "cancelled"
            | "pending"
            | "expired"
            | "muted";
          timeStr: string;
          sortMs: number;
        };

    const eventRows: UnifiedRow[] = myriadUserEventsSorted.map((ev, evIdx) => {
      const slugForLink = ev.marketSlug?.trim() || String(ev.marketId);
      const a = ev.action.toLowerCase();
      let sideTone: "buy" | "sell" | "claim" | "neutral" = "neutral";
      let sideLabel: string;
      if (a === "buy") {
        sideTone = "buy";
        sideLabel = `BUY ${outcomeWord(ev.outcomeId)}`;
      } else if (a === "sell") {
        sideTone = "sell";
        sideLabel = `SELL ${outcomeWord(ev.outcomeId)}`;
      } else if (a.includes("claim")) {
        sideTone = "claim";
        sideLabel = "CLAIM";
      } else {
        sideLabel = ev.action
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
          .toUpperCase();
      }

      let priceDisplay = "—";
      if ((a === "buy" || a === "sell") && ev.shares > 0 && ev.value > 0) {
        priceDisplay = (ev.value / ev.shares).toFixed(4);
      }

      const sizeDisplay = ev.shares > 0 ? formatShares(ev.shares) : "—";

      const timeStr =
        ev.timestamp > 0
          ? new Date(ev.timestamp * 1000).toLocaleString(undefined, {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "—";

      return {
        kind: "event" as const,
        key: `e-${ev.marketId}-${ev.timestamp}-${ev.blockNumber}-${evIdx}`,
        marketTitle: ev.marketTitle || `Market #${ev.marketId}`,
        slugForLink,
        sideLabel,
        sideTone,
        priceDisplay,
        sizeDisplay,
        role: "TAKER",
        statusLabel: "CONFIRMED",
        statusStyle: "confirmed" as const,
        timeStr,
        sortMs: ev.timestamp > 0 ? ev.timestamp * 1000 : 0,
      };
    });

    const orderRows: UnifiedRow[] = myriadOrdersSorted.map((ord) => {
      const meta = myriadMarketMetaById.get(ord.marketId);
      const slugForLink = meta?.slug?.trim() || String(ord.marketId);
      const displayTitle = meta?.title?.trim() || `Market #${ord.marketId}`;
      const sideLabel = `${ord.side === 0 ? "BUY" : "SELL"} ${outcomeWord(ord.outcomeId)}`;
      const priceStr = myriadPriceWeiToDecimal(ord.priceWei).toFixed(4);
      const st = ord.status.toLowerCase();
      const sizeWei = st === "filled" ? ord.filledAmountWei : ord.amountWei;
      const sizeStr = myriadShareWeiToNumber(sizeWei).toFixed(2);

      let role = "TAKER";
      if (st === "open") role = "MAKER";
      else if (st === "cancelled" || st === "canceled" || st === "expired") {
        role = "—";
      }

      let statusLabel = ord.status.toUpperCase();
      let statusStyle: UnifiedRow["statusStyle"] = "muted";
      if (st === "filled") {
        statusLabel = "FILLED";
        statusStyle = "confirmed";
      } else if (st === "open") {
        statusLabel = "OPEN";
        statusStyle = "open";
      } else if (st === "cancelled" || st === "canceled") {
        statusStyle = "cancelled";
      } else if (st === "expired") {
        statusStyle = "expired";
      }

      const timeStr = ord.createdAt
        ? (() => {
            const d = new Date(ord.createdAt);
            return Number.isNaN(d.getTime())
              ? ord.createdAt
              : d.toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                });
          })()
        : "—";
      const sortMs = ord.createdAt ? Date.parse(ord.createdAt) : 0;

      return {
        kind: "order" as const,
        key: `o-${ord.orderHash}`,
        marketTitle: displayTitle,
        slugForLink,
        sideLabel,
        isBuySide: ord.side === 0,
        priceDisplay: priceStr,
        sizeDisplay: sizeStr,
        role,
        statusLabel,
        statusStyle,
        timeStr,
        sortMs,
      };
    });

    return [...eventRows, ...orderRows].sort((a, b) => b.sortMs - a.sortMs);
  }, [
    myriadUserEventsSorted,
    myriadOrdersSorted,
    myriadMarketMetaById,
  ]);

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

  // Polymarket open orders (CLOB, status LIVE) — polled only while this dialog shows Polymarket.
  const polymarketShown = isOpen && platformTab === "polymarket";
  const { data: openOrdersData, isLoading: isLoadingOpenOrders } =
    useActiveOrders(
      polymarketShown ? clobClient : null,
      polymarketShown ? safeAddress : undefined,
    );
  const openOrders = useMemo(
    () => (openOrdersData ?? []).filter((o) => !canceledOrderIds.has(o.id)),
    [openOrdersData, canceledOrderIds],
  );
  const openOrderMarketIds = useMemo(
    () => [...new Set(openOrders.map((o) => o.market).filter(Boolean))],
    [openOrders],
  );
  const { data: openOrderTitles } = useMarketTitles(
    clobClient,
    openOrderMarketIds,
  );

  // Cash available for the summary strip: the same balance hooks the Deposit popup reads,
  // each enabled only while its venue is shown here.
  const polygonCash = usePolygonBalances(
    polymarketShown ? safeAddress : undefined,
  );
  const kalshiCash = useUsdcBalance(
    isOpen && platformTab === "kalshi" ? solanaAddress : null,
  );
  const limitlessCash = useBaseBalance(
    isOpen && platformTab === "limitless" ? eoaAddress : undefined,
  );
  const bscCash = useMyriadBscBalances(
    eoaAddress,
    isOpen && (platformTab === "myriad" || platformTab === "predictfun"),
  );

  // Position actions
  const { redeemPosition, isRedeeming } = useRedeemPosition();
  const { submitOrder, cancelOrder, isSubmitting } = useClobOrder(
    clobClient,
    eoaAddress,
  );
  const { redeem: limitlessRedeem, isRedeeming: isLimitlessRedeemLoading } =
    useLimitlessRedeem();

  const handleMyriadClaim = useCallback(
    async (marketId: number) => {
      if (!eoaAddress) {
        showErrorNotification("Claim", "Connect your EVM wallet.");
        return;
      }
      if (!ethersSigner) {
        showErrorNotification("Claim", "Wallet signer not ready.");
        return;
      }
      setRedeemingMyriadMarketId(marketId);
      try {
        const wallet = evmWallets.find((w) => w.address === privyUser?.wallet?.address);
        if (wallet) {
          const cid = wallet.chainId;
          const onBsc =
            cid === `eip155:${MYRIAD_ORDER_BOOK_CHAIN_ID}` ||
            cid === String(MYRIAD_ORDER_BOOK_CHAIN_ID);
          if (!onBsc) {
            await wallet.switchChain(MYRIAD_ORDER_BOOK_CHAIN_ID);
            await new Promise((r) => setTimeout(r, 400));
          }
        }

        let toAddr = MYRIAD_PREDICTION_MARKET_BSC;
        let calldata: string | undefined;
        let value = BigInt(0);

        const claimRes = await fetch("/api/myriad/markets/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market_id: marketId,
            network_id: MYRIAD_ORDER_BOOK_CHAIN_ID,
          }),
        });
        const claimJson = (await claimRes.json()) as {
          error?: string;
          calldata?: string;
          to?: string;
        };

        if (
          claimRes.ok &&
          typeof claimJson.calldata === "string" &&
          claimJson.calldata.startsWith("0x")
        ) {
          calldata = claimJson.calldata;
          if (typeof claimJson.to === "string" && claimJson.to.startsWith("0x")) {
            toAddr = claimJson.to;
          }
        } else {
          const res = await fetch("/api/myriad/positions/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              market_id: marketId,
              network_id: MYRIAD_ORDER_BOOK_CHAIN_ID,
            }),
          });
          const j = (await res.json()) as {
            error?: string;
            to?: string;
            calldata?: string;
            value?: string | number;
          };
          if (!res.ok) {
            throw new Error(
              claimJson.error || j.error || "Claim failed (resolved markets use POST /markets/claim)"
            );
          }
          if (!j.to || !j.calldata || !j.to.startsWith("0x")) {
            throw new Error("Invalid redeem calldata from API");
          }
          toAddr = j.to;
          calldata = j.calldata;
          value =
            j.value !== undefined && j.value !== null && j.value !== ""
              ? BigInt(String(j.value))
              : BigInt(0);
        }

        if (!calldata?.startsWith("0x")) {
          throw new Error("No calldata returned for claim");
        }

        const tx = await ethersSigner.sendTransaction({
          to: toAddr,
          data: calldata,
          value,
        });
        showSuccessNotification("Myriad claim", "Transaction submitted");
        await tx.wait(1).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["myriad-user-markets-modal"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-orders-history"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-user-events"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-user-portfolio"] });
        queryClient.invalidateQueries({ queryKey: ["myriad-erc20-balance"] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Claim failed";
        showErrorNotification("Myriad claim", msg);
      } finally {
        setRedeemingMyriadMarketId(null);
      }
    },
    [eoaAddress, ethersSigner, evmWallets, privyUser?.wallet?.address, queryClient]
  );

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

  /** Open orders: first click asks "Confirm cancel", the second cancels on the CLOB. */
  const handleCancelOrder = async (orderId: string) => {
    if (confirmCancelId !== orderId) {
      setConfirmCancelId(orderId);
      return;
    }
    setCancelingOrderId(orderId);
    try {
      await cancelOrder(orderId);
      setCanceledOrderIds((prev) => new Set(prev).add(orderId));
      setConfirmCancelId(null);
      showSuccessNotification("Order canceled");
    } catch (err) {
      console.error("Failed to cancel order:", err);
      showErrorNotification("Cancel order", getErrorMessage(err));
    } finally {
      setCancelingOrderId(null);
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
    if (isOpen && platformTab === "myriad") {
      /** Always refresh positions + activity + orders — tab-specific refetch left stale data when switching after a trade. */
      void refetchMyriadOrders();
      void refetchMyriadUserEvents();
      void refetchMyriadUserMarkets();
    }
  }, [
    isOpen,
    platformTab,
    clobClient,
    safeAddress,
    refetchTrades,
    refetchKalshiFills,
    refetchMyriadOrders,
    refetchMyriadUserEvents,
    refetchMyriadUserMarkets,
    activeTab,
  ]);

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

  /** Venue picker: same switching as before (every venue but Polymarket opens on Trades). */
  const selectVenue = (venue: OrdersVenue) => {
    setPlatformTab(venue);
    setConfirmCancelId(null);
    if (venue !== "polymarket") setActiveTab("trades");
  };
  const selectView = (view: OrdersView) => {
    setActiveTab(view);
    setConfirmCancelId(null);
  };
  /** Market links inside the dialog close it, then route in-app. */
  const openMarket = (href: string) => {
    onClose();
    router.push(href);
  };
  /** "Deposit or withdraw": the Header's Deposit popup (log in first when signed out). The two
   *  dialogs don't stack (this one closes on any click outside it), so this one closes first. */
  const openDeposit = () => {
    onClose();
    requestShellAction("deposit");
  };

  const polymarketReady =
    !!tradingContext && !!clobClient && !!safeAddress && !!isTradingSessionComplete;

  /* Tab counts, from the lists this venue has loaded (Predict.fun keeps its lists in its own
     panel, so its tabs carry no count). */
  const openOrdersCount =
    platformTab === "polymarket" && polymarketReady && !isLoadingOpenOrders
      ? openOrders.length
      : null;
  const positionsCount =
    platformTab === "polymarket"
      ? polymarketReady && !isLoadingPositions && !positionsError
        ? activePositions.length
        : null
      : platformTab === "kalshi"
        ? solanaAddress && !isLoadingKalshiPositions && !kalshiPositionsError
          ? kalshiPositions.length
          : null
        : platformTab === "limitless"
          ? limitlessUser?.sessionCookie &&
            !isLoadingLimitlessPositions &&
            !limitlessPositionsError
            ? limitlessPositions.length
            : null
          : platformTab === "myriad"
            ? eoaAddress && !isLoadingMyriadUserMarkets && !myriadUserMarketsError
              ? myriadUserMarketsVisible.length
              : null
            : null;

  const viewTabs: (readonly [OrdersView, ReactNode])[] = [
    ...(platformTab === "polymarket"
      ? [
          [
            "open",
            <>
              Open orders
              <TabCount n={openOrdersCount} />
            </>,
          ] as const,
        ]
      : []),
    [
      "positions",
      <>
        Positions
        <TabCount n={positionsCount} />
      </>,
    ],
    [
      "trades",
      <>
        <span className="o-tab-long">Trade history</span>
        <span className="o-tab-short">History</span>
      </>,
    ],
  ];

  /* Summary strip: only figures the selected venue's data supports. Polymarket has all four
     (positions carry value and P&L, open orders their size and price, the Safe its USDC.e);
     the other venues' position feeds carry no live prices, so they show cash only. */
  const summaryItems: SummaryItem[] = [];
  if (platformTab === "polymarket") {
    if (polymarketReady) {
      if (!positionsError) {
        summaryItems.push(
          {
            key: "value",
            label: "Portfolio value",
            value: positions.reduce((a, p) => a + toNum(p.currentValue), 0),
            loading: isLoadingPositions,
            hint: "Current value of your Polymarket positions",
          },
          {
            key: "pnl",
            label: "Unrealized P&L",
            value: positions.reduce((a, p) => a + toNum(p.cashPnl), 0),
            signed: true,
            loading: isLoadingPositions,
            hint: "Gain or loss on your Polymarket positions at today's prices",
          },
        );
      }
      summaryItems.push({
        key: "orders",
        label: "In open orders",
        value: openOrders.reduce((a, o) => a + openOrderValue(o), 0),
        loading: isLoadingOpenOrders,
        hint: "Unfilled shares × limit price of your open Polymarket orders",
      });
      if (!polygonCash.isError) {
        summaryItems.push({
          key: "cash",
          label: "Cash available",
          value: polygonCash.usdcBalance,
          loading: polygonCash.isLoading,
          hint: "USDC.e in your Polymarket wallet",
        });
      }
    }
  } else if (platformTab === "kalshi") {
    if (solanaAddress && !kalshiCash.isError) {
      summaryItems.push({
        key: "cash",
        label: "Cash available",
        value: kalshiCash.data?.amount,
        loading: kalshiCash.isLoading,
        hint: "USDC in your Solana wallet, used for Kalshi",
      });
    }
  } else if (platformTab === "limitless") {
    if (eoaAddress && !limitlessCash.isError) {
      summaryItems.push({
        key: "cash",
        label: "Cash available",
        value: limitlessCash.usdcBalance,
        loading: limitlessCash.isLoading,
        hint: "USDC on Base, used for Limitless",
      });
    }
  } else if (eoaAddress && !bscCash.isError) {
    const b = bscCash.data;
    summaryItems.push({
      key: "cash",
      label: "Cash available",
      value: b
        ? platformTab === "predictfun"
          ? b.usdt
          : b.usd1 + b.usdt + b.usdc
        : undefined,
      loading: bscCash.isLoading,
      hint:
        platformTab === "predictfun"
          ? "USDT on BNB Chain, used for Predict.fun"
          : "USD1, USDT and USDC on BNB Chain, used for Myriad",
    });
  }

  const tradesEmptyCopy = (
    <p>Orders you fill on this venue show here, newest first.</p>
  );
  const positionsEmptyCopy = (
    <p>Buy Yes or No on any market and your shares appear here.</p>
  );

  /** Limitless needs its own session for portfolio data. */
  const limitlessSignIn = (what: string) => (
    <OrdersState
      icon="wallet"
      title="Sign in to Limitless"
      actions={
        eoaAddress ? (
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
              aria-busy={isLimitlessLoginLoading || undefined}
              className="rx-btn rx-btn--primary"
            >
              <BusyLabel busy={isLimitlessLoginLoading} busyText="Signing in...">
                Sign in to Limitless
              </BusyLabel>
            </button>
            {limitlessAuthError && (
              <p className="rx-help rx-help--error">{limitlessAuthError.message}</p>
            )}
          </>
        ) : null
      }
    >
      <p>Sign in to Limitless to view your {what}.</p>
      {!eoaAddress ? (
        <p className="text-rx-gold-hi">
          Connect your wallet first to sign in to Limitless.
        </p>
      ) : null}
    </OrdersState>
  );

  const errorState = (message: string) => (
    <OrdersState icon="error" title="Couldn't load this list">
      <p className="rx-help rx-help--error">{message}</p>
    </OrdersState>
  );

  return (
    <OrdersBrowseProvider
      value={{ href: "/rexmarkets", onNavigate: () => openMarket("/rexmarkets") }}
    >
    <AcctModal labelledBy="orders-title" variant="orders" modalRef={modalRef}>
      <OrdersHead
        id="orders-title"
        eyebrow="Account"
        title="My orders and positions"
        description="Your open orders, positions and trade history on Polymarket, Kalshi, Limitless, Myriad and Predict.fun."
        tools={<DepositButton onClick={openDeposit} />}
        onClose={onClose}
      />

      {/* View tabs left, venue picker right (phones: venue picker on top) */}
      <div className="o-bar">
        <AcctTabs
          idPrefix="orders"
          label="View"
          tabs={viewTabs}
          active={activeTab}
          onChange={selectView}
        />
        <VenueSeg value={platformTab} onChange={selectVenue} />
      </div>

      <div
        className="acct-modal__body"
        role="tabpanel"
        aria-labelledby={`orders-tab-${activeTab}`}
      >
        <OrdersSummary
          items={summaryItems}
          label={`${ORDERS_VENUES.find((v) => v.key === platformTab)?.label ?? "Venue"} summary`}
        />
        {platformTab === "kalshi" ? (
          <>
            {/* Kalshi Trades: user's fill history (PortfolioApi.getFills) */}
            {activeTab === "trades" &&
              (isLoadingKalshiFills ? (
                <OrdersLoading label="Loading Kalshi trades" />
              ) : kalshiFillsError ? (
                errorState("Failed to load trade history. Please try again later.")
              ) : kalshiFills.length === 0 ? (
                <OrdersState icon="trades" title="No trades found">
                  {tradesEmptyCopy}
                </OrdersState>
              ) : (
                <RecordTable
                  label="Kalshi trades"
                  columns={TRADE_COLUMNS_ROLE}
                  rows={kalshiFills.map((fill: KalshiFill) => {
                    const sideLabel =
                      fill.action === "buy"
                        ? `BUY ${(fill.side ?? "").toUpperCase()}`
                        : `SELL ${(fill.side ?? "").toUpperCase()}`;
                    const role = fill.is_taker ? "TAKER" : "MAKER";
                    const ticker = fill.ticker ?? "—";
                    const href =
                      ticker !== "—"
                        ? `/rexmarkets/kalshi/${encodeURIComponent(ticker)}`
                        : undefined;
                    const side = (
                      <SideTag tone={fill.action === "buy" ? "up" : "down"}>
                        {sideLabel}
                      </SideTag>
                    );
                    return {
                      key: fill.fill_id ?? fill.order_id ?? String(Math.random()),
                      market: (
                        <MarketName
                          title={ticker}
                          venue="kalshi"
                          href={href}
                          onNavigate={href ? () => openMarket(href) : undefined}
                          tooltip={`View ${ticker} on RexMarkets`}
                        />
                      ),
                      tag: side,
                      cells: {
                        side,
                        price: formatKalshiFillPrice(fill.price),
                        size: (fill.count ?? 0).toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        }),
                        role: <StatusBadge tone="neutral">{role}</StatusBadge>,
                        time: formatKalshiFillTime(fill.created_time),
                      },
                    };
                  })}
                />
              ))}

            {/* Kalshi Positions: DFlow positions + reclaim rent */}
            {activeTab === "positions" && (
              <>
                {!solanaAddress ? (
                  <OrdersState icon="wallet" title="Connect your Solana wallet">
                    <p>Connect your Solana wallet to view Kalshi positions.</p>
                  </OrdersState>
                ) : isLoadingKalshiPositions ? (
                  <OrdersLoading label="Loading Kalshi positions" />
                ) : kalshiPositionsError ? (
                  errorState("Failed to load Kalshi positions. Please try again later.")
                ) : kalshiPositions.length === 0 ? (
                  <OrdersState icon="positions" title="No Kalshi positions found">
                    {positionsEmptyCopy}
                  </OrdersState>
                ) : (
                  <RecordTable
                    label="Kalshi positions"
                    actionLabel="Actions"
                    columns={[
                      { key: "outcome", label: "Outcome", card: false },
                      { key: "balance", label: "Shares", num: true },
                      { key: "redemption", label: "Redemption" },
                      { key: "status", label: "Status" },
                      { key: "open", label: "Opens", muted: true, card: "half" },
                      { key: "close", label: "Closes", muted: true, card: "half" },
                    ]}
                    rows={kalshiPositions.map((pos) => {
                      const ticker = pos.market?.eventTicker;
                      const title =
                        pos.market?.title ??
                        pos.market?.question ??
                        ticker ??
                        "—";
                      const marketHref = ticker
                        ? `/rexmarkets/kalshi/${encodeURIComponent(ticker)}`
                        : undefined;
                      const redeemable = isKalshiRedeemable(pos);
                      const isRedeeming = redeemingKalshiMint === pos.mint;
                      const outcome = (
                        <SideTag
                          tone={
                            pos.position === "YES"
                              ? "up"
                              : pos.position === "NO"
                                ? "down"
                                : "neutral"
                          }
                        >
                          {pos.position}
                        </SideTag>
                      );
                      return {
                        key: pos.mint,
                        market: (
                          <MarketName
                            title={title}
                            venue="kalshi"
                            href={marketHref}
                            newTab
                            tooltip={`Open ${title} in new tab`}
                          />
                        ),
                        tag: outcome,
                        cells: {
                          outcome,
                          balance: pos.balance.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          }),
                          redemption: pos.redemptionStatus ?? "—",
                          open: formatKalshiDate(pos.market?.openTime),
                          close: formatKalshiDate(pos.market?.closeTime),
                          status: (
                            <StatusBadge tone="neutral">
                              {pos.market?.status ?? "—"}
                            </StatusBadge>
                          ),
                        },
                        action: redeemable ? (
                          <button
                            type="button"
                            onClick={() => handleKalshiRedeem(pos)}
                            disabled={isRedeeming}
                            aria-busy={isRedeeming || undefined}
                            className="rx-btn rx-btn--primary rx-btn--s"
                          >
                            <BusyLabel busy={isRedeeming} busyText="Redeeming...">
                              Redeem
                            </BusyLabel>
                          </button>
                        ) : (
                          <span className="o-note">Not yet</span>
                        ),
                      };
                    })}
                  />
                )}

                {/* Reclaim rent from empty outcome token accounts (DFlow: close-outcome-token-accounts) */}
                {emptyOutcomeAccounts.length > 0 &&
                  solanaAddress &&
                  !isLoadingKalshiPositions &&
                  !kalshiPositionsError && (
                    <section className="o-rent" aria-labelledby="orders-rent-title">
                      <div>
                        <h3 id="orders-rent-title" className="rx-h3">
                          Reclaim rent from closed positions
                        </h3>
                        <p className="rx-small mb-0 mt-1">
                          Empty outcome token accounts can be closed to reclaim
                          SOL rent.
                        </p>
                      </div>
                      {emptyOutcomeAccounts.map((empty) => {
                        const isClosing =
                          closingAccountAddress === empty.tokenAccountAddress;
                        return (
                          <div key={empty.tokenAccountAddress} className="o-rent__row">
                            <span className="rx-num" title={empty.tokenAccountAddress}>
                              {empty.tokenAccountAddress.slice(0, 8)}...
                              {empty.tokenAccountAddress.slice(-6)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCloseEmptyAccount(empty)}
                              disabled={isClosing}
                              aria-busy={isClosing || undefined}
                              className="rx-btn rx-btn--secondary rx-btn--s shrink-0"
                            >
                              <BusyLabel busy={isClosing} busyText="Closing...">
                                Reclaim rent
                              </BusyLabel>
                            </button>
                          </div>
                        );
                      })}
                    </section>
                  )}
              </>
            )}
          </>
        ) : platformTab === "limitless" ? (
          <>
            {/* Limitless Trades */}
            {activeTab === "trades" &&
              (!limitlessUser?.sessionCookie ? (
                limitlessSignIn("trade history")
              ) : isLoadingLimitlessTrades ? (
                <OrdersLoading label="Loading Limitless trades" />
              ) : limitlessTradesError ? (
                errorState("Failed to load Limitless trades. Please try again.")
              ) : limitlessTrades.length === 0 ? (
                <OrdersState icon="trades" title="No trades found">
                  {tradesEmptyCopy}
                </OrdersState>
              ) : (
                <RecordTable
                  label="Limitless trades"
                  columns={[
                    { key: "side", label: "Side" },
                    { key: "action", label: "Action", card: false },
                    { key: "price", label: "Price", num: true },
                    { key: "size", label: "Size", num: true, hint: "Outcome tokens (shares) bought or sold" },
                    { key: "amount", label: "Amount", num: true, card: "half", hint: "USDC spent or received (after fees)" },
                    { key: "time", label: "Time", muted: true, card: "half" },
                  ]}
                  rows={limitlessTrades.map((t: LimitlessTrade, i: number) => {
                    const slugForLink = t.marketSlug ?? t.market ?? "—";
                    const displayTitle = t.market ?? t.marketSlug ?? "—";
                    const side = (t.side ?? t.outcome ?? "—").toString();
                    const actionRaw = (t.action ?? t.strategy ?? "—") as string;
                    const actionLower = actionRaw.toLowerCase();
                    const actionTone: Tone =
                      actionLower === "won"
                        ? "up"
                        : actionLower === "lose" || actionLower === "lost"
                          ? "down"
                          : "neutral";
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
                    const href =
                      slugForLink !== "—"
                        ? `/rexmarkets/limitless/${encodeURIComponent(slugForLink)}`
                        : undefined;
                    const action = <StatusBadge tone={actionTone}>{actionRaw}</StatusBadge>;
                    return {
                      key: t.id ?? `limitless-trade-${i}`,
                      market: (
                        <MarketName
                          title={displayTitle}
                          venue="limitless"
                          href={href}
                          onNavigate={href ? () => openMarket(href) : undefined}
                        />
                      ),
                      tag: action,
                      cells: {
                        side: <SideTag tone={sideTone(side)}>{side}</SideTag>,
                        action,
                        price,
                        size: String(size),
                        amount: amountStr,
                        time: timeStr,
                      },
                    };
                  })}
                />
              ))}

            {/* Limitless Positions */}
            {activeTab === "positions" &&
              (!limitlessUser?.sessionCookie ? (
                limitlessSignIn("positions")
              ) : isLoadingLimitlessPositions ? (
                <OrdersLoading label="Loading Limitless positions" />
              ) : limitlessPositionsError ? (
                errorState("Failed to load Limitless positions. Please try again.")
              ) : limitlessPositions.length === 0 ? (
                <OrdersState icon="positions" title="No positions found">
                  {positionsEmptyCopy}
                </OrdersState>
              ) : (
                <RecordTable
                  label="Limitless positions"
                  actionLabel="Actions"
                  columns={[
                    { key: "outcome", label: "Outcome", card: false },
                    { key: "size", label: "Size", num: true, card: "half" },
                    { key: "closed", label: "Closed", card: "half" },
                    { key: "expiration", label: "Expiration", muted: true, card: "full" },
                  ]}
                  rows={limitlessPositions.map((p: LimitlessPosition, i: number) => {
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
                    const href =
                      slugForLink !== "—"
                        ? `/rexmarkets/limitless/${encodeURIComponent(slugForLink)}`
                        : undefined;
                    const outcomeTag = <SideTag tone={sideTone(outcome)}>{outcome}</SideTag>;
                    return {
                      key: p.id ?? p.tokenId ?? `limitless-pos-${i}`,
                      market: (
                        <MarketName
                          title={displayTitle}
                          venue="limitless"
                          href={href}
                          onNavigate={href ? () => openMarket(href) : undefined}
                        />
                      ),
                      tag: outcomeTag,
                      cells: {
                        outcome: outcomeTag,
                        size: String(size),
                        closed,
                        expiration,
                      },
                      action: canClaim ? (
                        <button
                          type="button"
                          onClick={() => handleLimitlessClaim(slugForLink)}
                          disabled={isClaiming}
                          aria-busy={isClaiming || undefined}
                          className="rx-btn rx-btn--primary rx-btn--s"
                        >
                          <BusyLabel busy={isClaiming} busyText="Claiming...">
                            Claim
                          </BusyLabel>
                        </button>
                      ) : undefined,
                    };
                  })}
                />
              ))}
          </>
        ) : platformTab === "myriad" ? (
          <>
            {activeTab === "trades" &&
              (!eoaAddress ? (
                <OrdersState icon="wallet" title="Connect your wallet">
                  <p>
                    Connect your wallet to view Myriad activity and order-book
                    orders (BNB Chain).
                  </p>
                </OrdersState>
              ) : isLoadingMyriadOrders && isLoadingMyriadUserEvents ? (
                <OrdersLoading label="Loading Myriad activity" />
              ) : myriadOrdersError && myriadUserEventsError ? (
                errorState(
                  myriadUserEventsError instanceof Error
                    ? myriadUserEventsError.message
                    : myriadOrdersError instanceof Error
                      ? myriadOrdersError.message
                      : "Failed to load Myriad data.",
                )
              ) : myriadUserEventsSorted.length === 0 && myriadOrdersSorted.length === 0 ? (
                <OrdersState icon="trades" title="No trades or activity yet">
                  {tradesEmptyCopy}
                </OrdersState>
              ) : (
                <RecordTable
                  label="Myriad trades"
                  columns={TRADE_COLUMNS_STATUS}
                  rows={myriadUnifiedTradesRows.map((row) => {
                    const tone: Tone =
                      row.kind === "order"
                        ? row.isBuySide
                          ? "up"
                          : "down"
                        : row.sideTone === "buy"
                          ? "up"
                          : row.sideTone === "sell"
                            ? "down"
                            : row.sideTone === "claim"
                              ? "gold"
                              : "neutral";
                    const statusToneValue: Tone =
                      row.statusStyle === "confirmed"
                        ? "up"
                        : row.statusStyle === "open" || row.statusStyle === "pending"
                          ? "gold"
                          : row.statusStyle === "cancelled"
                            ? "down"
                            : "neutral";
                    const href = `/rexmarkets/myriad/${encodeURIComponent(row.slugForLink)}`;
                    const status = (
                      <StatusBadge tone={statusToneValue}>{row.statusLabel}</StatusBadge>
                    );
                    return {
                      key: row.key,
                      market: (
                        <MarketName
                          title={row.marketTitle}
                          venue="myriad"
                          href={href}
                          onNavigate={() => openMarket(href)}
                        />
                      ),
                      tag: status,
                      cells: {
                        side: <SideTag tone={tone}>{row.sideLabel}</SideTag>,
                        price: row.priceDisplay,
                        size: row.sizeDisplay,
                        role:
                          row.role === "—" ? (
                            "—"
                          ) : (
                            <StatusBadge tone="neutral">{row.role}</StatusBadge>
                          ),
                        status,
                        time: row.timeStr,
                      },
                    };
                  })}
                />
              ))}

            {activeTab === "positions" &&
              (!eoaAddress ? (
                <OrdersState icon="wallet" title="Connect your wallet">
                  <p>
                    Connect your wallet to view Myriad positions and claim on
                    BNB Chain.
                  </p>
                </OrdersState>
              ) : isLoadingMyriadUserMarkets ? (
                <OrdersLoading label="Loading Myriad positions" />
              ) : myriadUserMarketsError ? (
                errorState(
                  myriadUserMarketsError instanceof Error
                    ? myriadUserMarketsError.message
                    : "Failed to load Myriad positions.",
                )
              ) : myriadUserMarketsVisible.length === 0 ? (
                <OrdersState icon="positions" title="No positions found">
                  {positionsEmptyCopy}
                </OrdersState>
              ) : (
                <RecordTable
                  label="Myriad positions"
                  actionLabel="Actions"
                  columns={[
                    { key: "yes", label: "Yes (shares)", num: true, card: "half" },
                    { key: "no", label: "No (shares)", num: true, card: "half" },
                    { key: "state", label: "State", card: false },
                  ]}
                  rows={myriadUserMarketsVisible.map((row) => {
                    const slugForLink = row.slug?.trim() || String(row.marketId);
                    const isRedeeming = redeemingMyriadMarketId === row.marketId;
                    const href = `/rexmarkets/myriad/${encodeURIComponent(slugForLink)}`;
                    const state = (
                      <StatusBadge tone="neutral">
                        <span className="capitalize">{row.state || "—"}</span>
                      </StatusBadge>
                    );
                    return {
                      key: String(row.marketId),
                      market: (
                        <MarketName
                          title={row.title}
                          venue="myriad"
                          href={href}
                          onNavigate={() => openMarket(href)}
                        />
                      ),
                      tag: state,
                      cells: {
                        yes: row.yesShares.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        }),
                        no: row.noShares.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        }),
                        state,
                      },
                      action: (
                        <button
                          type="button"
                          onClick={() => void handleMyriadClaim(row.marketId)}
                          disabled={isRedeeming || !row.redeemEligible}
                          aria-busy={isRedeeming || undefined}
                          title={
                            row.redeemEligible
                              ? "POST /markets/claim — submit calldata on BNB Smart Chain (fallback: order-book redeem)."
                              : "Claim is only available when the market is resolved and you have winnings or voided proceeds to claim (per API)."
                          }
                          className={clsx(
                            "rx-btn rx-btn--s",
                            row.redeemEligible ? "rx-btn--primary" : "rx-btn--secondary",
                          )}
                        >
                          <BusyLabel busy={isRedeeming} busyText="Claiming...">
                            Claim
                          </BusyLabel>
                        </button>
                      ),
                    };
                  })}
                />
              ))}
          </>
        ) : platformTab === "predictfun" ? (
          <PredictFunMarketInfoPanel
            isOpen={isOpen}
            onClose={onClose}
            activeTab={activeTab === "open" ? "positions" : activeTab}
            setActiveTab={setActiveTab}
            eoaAddress={eoaAddress}
            signer={ethersSigner}
          />
        ) : !tradingContext ? (
          <OrdersState icon="wallet" title="Trading isn't available here">
            <p>
              Trading provider not available. Please navigate to the trading
              page to view data.
            </p>
          </OrdersState>
        ) : !clobClient || !safeAddress || !isTradingSessionComplete ? (
          <OrdersState
            icon="wallet"
            title={!eoaAddress ? "Connect your wallet" : "Set up Polymarket trading"}
            actions={
              eoaAddress && initializeTradingSession ? (
                <>
                  <button
                    type="button"
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
                    aria-busy={isInitializing || currentStep !== "idle" || undefined}
                    className="rx-btn rx-btn--primary"
                  >
                    <BusyLabel
                      busy={isInitializing || currentStep !== "idle"}
                      busyText={
                        currentStep === "checking"
                          ? "Checking..."
                          : currentStep === "deploying"
                            ? "Deploying Safe..."
                            : currentStep === "credentials"
                              ? "Setting up credentials..."
                              : currentStep === "approvals"
                                ? "Setting approvals..."
                                : "Initializing..."
                      }
                    >
                      Initialize Trading
                    </BusyLabel>
                  </button>
                  {sessionError && (
                    <p className="rx-help rx-help--error">
                      {sessionError.message ||
                        "Failed to initialize trading session"}
                    </p>
                  )}
                </>
              ) : null
            }
          >
            <p>
              {!eoaAddress
                ? "Please connect your wallet to view trading data."
                : "Please initialize trading session to view data."}
            </p>
          </OrdersState>
        ) : (
          <>
            {/* Polymarket open orders (resting on the CLOB): Cancel → Confirm cancel */}
            {activeTab === "open" &&
              (isLoadingOpenOrders ? (
                <OrdersLoading label="Loading open orders" />
              ) : openOrders.length === 0 ? (
                <OrdersState icon="trades" title="No open orders">
                  <p>
                    Orders you place on Rex Predictions show here until they
                    fill or you cancel them.
                  </p>
                </OrdersState>
              ) : (
                <RecordTable
                  label="Polymarket open orders"
                  actionLabel="Actions"
                  columns={OPEN_ORDER_COLUMNS}
                  rows={openOrders.map((order) => {
                    const title =
                      openOrderTitles?.get(order.market) ||
                      marketTitlesMap.get(order.market) ||
                      (order.market
                        ? `Market ${order.market.slice(0, 8)}…`
                        : "Polymarket market");
                    const isBuy = order.side === "BUY";
                    const outcomeTone = sideTone(order.outcome);
                    const side = (
                      <SideTag
                        tone={
                          outcomeTone !== "neutral"
                            ? outcomeTone
                            : isBuy
                              ? "up"
                              : "down"
                        }
                      >
                        {isBuy ? "Buy" : "Sell"} {order.outcome}
                      </SideTag>
                    );
                    return {
                      key: order.id,
                      market: (
                        <MarketName
                          title={title}
                          sub={order.outcome || undefined}
                          venue="polymarket"
                          onClick={() => handleMarketClick(order.market, title)}
                          disabled={loadingMarketId === order.market}
                          loading={loadingMarketId === order.market}
                          tooltip={`Click to view ${title}`}
                        />
                      ),
                      tag: side,
                      cells: {
                        side,
                        price: formatCents(order.price),
                        filled: (
                          <FillBar
                            filled={toNum(order.size_matched)}
                            total={toNum(order.original_size)}
                          />
                        ),
                        placed: formatOrderAge(order.created_at),
                      },
                      action: (
                        <CancelOrderButton
                          confirming={confirmCancelId === order.id}
                          busy={cancelingOrderId === order.id}
                          disabled={
                            isSubmitting && cancelingOrderId !== order.id
                          }
                          onClick={() => void handleCancelOrder(order.id)}
                          marketLabel={title}
                        />
                      ),
                    };
                  })}
                />
              ))}

            {/* Polymarket Trades */}
            {activeTab === "trades" &&
              (isLoadingTrades ? (
                <OrdersLoading label="Loading Polymarket trades" />
              ) : tradesError ? (
                errorState("Failed to load trades. Please try again later.")
              ) : trades.length === 0 ? (
                <OrdersState icon="trades" title="No trades found">
                  {tradesEmptyCopy}
                </OrdersState>
              ) : (
                <RecordTable
                  label="Polymarket trades"
                  columns={TRADE_COLUMNS_STATUS}
                  rows={tradesWithTitles.map(
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
                      const marketKey = trade.market || trade.asset_id || "";
                      const name =
                        trade.marketTitle ||
                        trade.market ||
                        trade.asset_id ||
                        "N/A";
                      const status = (
                        <StatusBadge
                          tone={
                            trade.status === "CONFIRMED"
                              ? "up"
                              : trade.status === "PENDING"
                                ? "gold"
                                : "neutral"
                          }
                        >
                          {trade.status || "N/A"}
                        </StatusBadge>
                      );
                      return {
                        key: trade.id,
                        market: (
                          <MarketName
                            title={name}
                            venue="polymarket"
                            onClick={() => handleMarketClick(marketKey, name)}
                            disabled={loadingMarketId === marketKey}
                            loading={loadingMarketId === marketKey}
                            tooltip={`Click to view ${name}`}
                          />
                        ),
                        tag: status,
                        cells: {
                          side: (
                            <SideTag tone={trade.side === "BUY" ? "up" : "down"}>
                              {trade.side}
                            </SideTag>
                          ),
                          price: formatPrice(trade.price),
                          size: formatSize(trade.size),
                          role: <StatusBadge tone="neutral">{role}</StatusBadge>,
                          status,
                          time: formatDate(trade.match_time),
                        },
                      };
                    },
                  )}
                />
              ))}

            {/* Polymarket Positions */}
            {activeTab === "positions" && (
              <>
                {/* Position filters with dust warning */}
                <div className="o-tools">
                  {hideDust &&
                  positions &&
                  positions.length > activePositions.length ? (
                    <span className="o-hint">
                      Hiding {positions.length - activePositions.length}{" "}
                      dust position(s) (value &lt; $
                      {DUST_THRESHOLD.toFixed(2)})
                    </span>
                  ) : (
                    <span />
                  )}
                  <RxToggle
                    checked={!hideDust}
                    onChange={(checked) => setHideDust(!checked)}
                    label="Show All"
                  />
                </div>

                {isLoadingPositions ? (
                  <OrdersLoading label="Loading Polymarket positions" />
                ) : positionsError ? (
                  errorState("Failed to load positions. Please try again later.")
                ) : activePositions.length === 0 ? (
                  <OrdersState icon="positions" title="No open positions found">
                    {positionsEmptyCopy}
                  </OrdersState>
                ) : (
                  <RecordTable
                    label="Polymarket positions"
                    actionLabel="Actions"
                    columns={[
                      { key: "outcome", label: "Outcome", card: false },
                      { key: "shares", label: "Shares", num: true },
                      { key: "avg", label: "Avg price", num: true },
                      { key: "now", label: "Now", num: true },
                      { key: "value", label: "Value", num: true, card: "half" },
                      { key: "pnl", label: "P&L", num: true, card: "half" },
                    ]}
                    rows={activePositions.map((position) => {
                      const isPending = pendingVerification.has(position.asset);
                      const isSelling = sellingAsset === position.asset;
                      const isRedeemingPos = redeemingAsset === position.asset;
                      const isSuccessful = successfulSale === position.asset;
                      const isSuccessfulRedeem = successfulRedeem === position.asset;
                      const outcome = (
                        <SideTag tone={sideTone(position.outcome)}>
                          {position.outcome}
                        </SideTag>
                      );
                      return {
                        key: `${position.conditionId}-${position.outcomeIndex}`,
                        market: (
                          <MarketName
                            title={position.title}
                            venue="polymarket"
                            onClick={() =>
                              handleMarketClick(position.conditionId, position.title)
                            }
                            disabled={loadingMarketId === position.conditionId}
                            loading={loadingMarketId === position.conditionId}
                            tooltip={`Click to view ${position.title}`}
                          />
                        ),
                        tag: outcome,
                        cells: {
                          outcome,
                          shares: formatShares(position.size),
                          avg: formatCurrency(position.avgPrice, 3),
                          now: formatCurrency(position.curPrice, 3),
                          value: formatCurrency(position.currentValue),
                          pnl: (
                            <span className={position.cashPnl >= 0 ? "up" : "down"}>
                              {formatCurrency(position.cashPnl)}{" "}
                              <small>({formatPercentage(position.percentPnl)})</small>
                            </span>
                          ),
                        },
                        action: position.redeemable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRedeem(position)}
                              disabled={
                                isRedeemingPos ||
                                !relayClient ||
                                isSuccessfulRedeem
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
                              ) : (
                                <BusyLabel busy={isRedeemingPos} busyText="Signing...">
                                  Redeem
                                </BusyLabel>
                              )}
                            </button>
                            {isSuccessfulRedeem && <SuccessNote />}
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
                                isSuccessful ? "o-btn-ok" : "rx-btn--secondary",
                              )}
                            >
                              {isSuccessful ? (
                                <>
                                  <Check className="size-3" aria-hidden="true" />
                                  Success
                                </>
                              ) : isSelling ? (
                                <BusyLabel busy busyText="Signing...">
                                  Sell
                                </BusyLabel>
                              ) : isPending ? (
                                "Processing..."
                              ) : (
                                "Sell"
                              )}
                            </button>
                            {isSuccessful && <SuccessNote />}
                          </>
                        ),
                      };
                    })}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </AcctModal>
    </OrdersBrowseProvider>
  );
}

/** Open orders (prototype columns): the side is the card's head tag. */
const OPEN_ORDER_COLUMNS: RecordColumn[] = [
  { key: "side", label: "Side", card: false },
  { key: "price", label: "Price", num: true },
  { key: "filled", label: "Filled", hint: "Shares filled / ordered" },
  { key: "placed", label: "Placed", muted: true },
];

/** Trades with a role column (Kalshi fills): the side is the card's head tag. */
const TRADE_COLUMNS_ROLE: RecordColumn[] = [
  { key: "side", label: "Side", card: false },
  { key: "price", label: "Price", num: true },
  { key: "size", label: "Size", num: true },
  { key: "role", label: "Role" },
  { key: "time", label: "Time", muted: true, card: "full" },
];

/** Trades with a status column (Polymarket, Myriad): the status is the card's head tag. */
const TRADE_COLUMNS_STATUS: RecordColumn[] = [
  { key: "side", label: "Side" },
  { key: "price", label: "Price", num: true },
  { key: "size", label: "Size", num: true },
  { key: "role", label: "Role" },
  { key: "status", label: "Status", card: false },
  { key: "time", label: "Time", muted: true, card: "wide" },
];

/** Yes / Buy read green, No / Sell red, anything else (team names, ranges) neutral. */
function sideTone(label: string | undefined | null): Tone {
  const s = (label ?? "").trim().toLowerCase();
  if (s === "yes" || s === "buy" || s.startsWith("buy ")) return "up";
  if (s === "no" || s === "sell" || s.startsWith("sell ")) return "down";
  return "neutral";
}
