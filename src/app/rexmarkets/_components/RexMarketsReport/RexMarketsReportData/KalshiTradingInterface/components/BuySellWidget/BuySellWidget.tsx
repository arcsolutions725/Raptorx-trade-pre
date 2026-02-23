"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { formatCurrency, formatShares } from "@/utils/format";
import { calculateTotalCost, convertCentsToPrice } from "@/utils/order";
import {
  isValidDecimalInput,
  isValidCentsInput,
  isValidSize,
  isValidPriceCents,
  MIN_ORDER_SIZE,
} from "@/utils/validation";
import { Select, SelectOption } from "@/components/ui/Select";
import { formatPrice } from "@/utils/polymarketTrading";
import { usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { useSolana } from "@phantom/react-sdk";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import LoginModal from "@/components/ui/modal/LoginModal";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useSolanaBalance } from "@/hooks/useSolanaBalance";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { useSolPrice } from "@/hooks/useSolPrice";
import { useDflowPositions } from "@/hooks/useDflowPositions";
import useKalshiGeoblock from "@/hooks/useKalshiGeoblock";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import {
  showSuccessNotification,
  showInfoNotification,
  showErrorNotification,
} from "@/components/ui/notification";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Wrapped SOL (WSOL) – DFlow routes any spot token (SOL, BONK, etc.) → settlement → outcome. */
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_DECIMALS = 6;
const SOL_DECIMALS = 9;
const FEE_BUFFER_SOL = 0.005;
const OUTCOME_DECIMALS = 6;
const DEFAULT_SLIPPAGE_BPS = 100;
const SOLANA_RPC = "https://mainnet.helius-rpc.com/?api-key=HELIUS_API_KEY";

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
    yes_price?: number;
    no_price?: number;
  }>;
  marketsForOrderBook?: Array<{
    clobTokenId: string | null;
    clobNoTokenId: string | null;
    marketTitle: string;
    ticker: string;
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
    initialOutcome || null,
  );
  const [size, setSize] = useState("");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  type ProgressStep =
    | "idle"
    | "fetching_order"
    | "signing_sending"
    | "confirming";
  const [progressStep, setProgressStep] = useState<ProgressStep>("idle");
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { authenticated: privyAuthenticated, user: privyUser } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, openModal: openPhantomModal } =
    usePhantomConnect();
  const { solana: phantomSolana, isAvailable: phantomSolanaAvailable } =
    useSolana();
  const { solanaAddress, source: solanaSource } = useSolanaWalletAddress();
  const { data: solBalance } = useSolanaBalance(
    solanaAddress,
    solanaSource,
    (privyUser as { id?: string } | null)?.id ?? null,
  );
  const { data: usdcBalance } = useUsdcBalance(solanaAddress);
  const { data: solPriceUsd } = useSolPrice(!!solanaAddress);
  const queryClient = useQueryClient();
  const { data: dflowData } = useDflowPositions(solanaAddress);
  const kalshiPositions = dflowData?.positions ?? [];
  const { isBlocked: isKalshiGeoblocked, geoblockStatus: kalshiGeoblockStatus } =
    useKalshiGeoblock();
  const { signAndSendTransaction: privySignAndSend } =
    useSignAndSendTransaction();
  const { wallets: privySolanaWallets, ready: privyWalletsReady } =
    useWallets();
  const authenticated = phantomAuthenticated || privyAuthenticated;
  const privySolanaWallet =
    solanaSource === "privy" && solanaAddress && privyWalletsReady
      ? (privySolanaWallets.find((w) => {
          const addr =
            (w as { address?: string }).address ??
            (w as { accounts?: { address: string }[] }).accounts?.[0]?.address;
          return addr?.toLowerCase() === solanaAddress.toLowerCase();
        }) ?? null)
      : null;

  // Selected market ticker for DFlow (same as Kalshi market ticker)
  const selectedMarketTicker = useMemo(() => {
    if (
      marketsForOrderBook.length > 0 &&
      selectedMarketIndex >= 0 &&
      selectedMarketIndex < marketsForOrderBook.length
    ) {
      return marketsForOrderBook[selectedMarketIndex].ticker;
    }
    return null;
  }, [marketsForOrderBook, selectedMarketIndex]);

  // Available shares for sell (from DFlow positions for this market)
  const availableSharesYes = useMemo(() => {
    if (!selectedMarketTicker || kalshiPositions.length === 0) return 0;
    const pos = kalshiPositions.find(
      (p) =>
        (p.market?.ticker === selectedMarketTicker ||
          p.market?.eventTicker === selectedMarketTicker) &&
        p.position === "YES",
    );
    return pos ? pos.balance : 0;
  }, [kalshiPositions, selectedMarketTicker]);

  const availableSharesNo = useMemo(() => {
    if (!selectedMarketTicker || kalshiPositions.length === 0) return 0;
    const pos = kalshiPositions.find(
      (p) =>
        (p.market?.ticker === selectedMarketTicker ||
          p.market?.eventTicker === selectedMarketTicker) &&
        p.position === "NO",
    );
    return pos ? pos.balance : 0;
  }, [kalshiPositions, selectedMarketTicker]);

  const availableShares = useMemo(() => {
    if (selectedOutcome) {
      return selectedOutcome === "Yes" ? availableSharesYes : availableSharesNo;
    }
    return availableSharesYes + availableSharesNo;
  }, [selectedOutcome, availableSharesYes, availableSharesNo]);

  // Position for current market + outcome (for sell: use exact mint user holds per DFlow decrease-position)
  const currentSellPosition = useMemo(() => {
    if (
      !selectedMarketTicker ||
      !selectedOutcome ||
      kalshiPositions.length === 0
    )
      return null;
    const outcome = selectedOutcome === "Yes" ? "YES" : "NO";
    return (
      kalshiPositions.find(
        (p) =>
          (p.market?.ticker === selectedMarketTicker ||
            p.market?.eventTicker === selectedMarketTicker) &&
          p.position === outcome,
      ) ?? null
    );
  }, [kalshiPositions, selectedMarketTicker, selectedOutcome]);

  // Fetch DFlow market outcome mints by ticker
  const { data: dflowMarket, isLoading: isLoadingDflowMarket } = useQuery({
    queryKey: ["dflow-market", selectedMarketTicker],
    queryFn: async () => {
      if (!selectedMarketTicker) return null;
      const res = await fetch(
        `/api/kalshi/dflow-market?ticker=${encodeURIComponent(selectedMarketTicker)}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || "Market not found",
        );
      }
      return res.json() as Promise<{
        ticker: string;
        yesMint: string;
        noMint: string;
        settlementMint: string;
        isInitialized?: boolean;
      }>;
    },
    enabled: !!selectedMarketTicker,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (initialOutcome) setSelectedOutcome(initialOutcome);
  }, [initialOutcome]);

  const marketOptions: SelectOption[] = useMemo(() => {
    if (marketsForOrderBook.length > 0) {
      return marketsForOrderBook.map((market, index) => ({
        value: index.toString(),
        label: market.marketTitle,
      }));
    }
    return [
      { value: "all", label: "Market" },
      ...availableMarkets.map((market) => ({
        value: market.condition_id || market.ticker || "",
        label:
          market.groupItemTitle || market.subtitle || market.ticker || "Market",
      })),
    ];
  }, [marketsForOrderBook, availableMarkets]);

  const selectedMarketValue = useMemo(() => {
    if (marketsForOrderBook.length > 0) return selectedMarketIndex.toString();
    return "all";
  }, [marketsForOrderBook.length, selectedMarketIndex]);

  const handleMarketChange = (value: string) => {
    if (marketsForOrderBook.length > 0 && onMarketIndexChange) {
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
        const walletDollars = usdcBalance?.amount ?? 0;
        const amount = Math.max(0, pct * walletDollars);
        setSize(amount.toFixed(2));
      } else {
        const maxShares = availableShares;
        const shares = Math.max(0, pct * maxShares);
        setSize(shares >= 0 ? String(Math.round(shares * 100) / 100) : "0");
      }
    },
    [activeTab, usdcBalance?.amount, availableShares],
  );

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
          options: {
            uiOptions: { showWalletUIs: true },
          },
        });
        const sigBytes = result.signature;
        if (!sigBytes || sigBytes.length === 0) {
          throw new Error("No signature from Privy");
        }
        return bs58.encode(sigBytes);
      }

      // Phantom Connect (embedded wallet from email/Google): use SDK, not extension
      if (solanaSource === "phantom" && phantomSolanaAvailable && phantomSolana?.signAndSendTransaction) {
        const binaryString = atob(transactionBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const transaction = VersionedTransaction.deserialize(bytes);
        const result = await phantomSolana.signAndSendTransaction(transaction);
        const sig =
          typeof result === "object" && result !== null
            ? (result as { hash?: string; signature?: string }).hash ??
              (result as { hash?: string; signature?: string }).signature ??
              String(result)
            : String(result);
        if (!sig) throw new Error("No signature from Phantom Connect");
        return sig;
      }

      // Fallback: extension wallet (injected) only when not using Phantom Connect
      const provider =
        typeof window !== "undefined" && (window as any).phantom?.solana;
      if (!provider) {
        throw new Error(
          solanaSource === "phantom"
            ? "Phantom Connect wallet not ready. Please sign in with Phantom again."
            : "Phantom wallet not found. Please install Phantom or sign in with Phantom Connect."
        );
      }
      const binaryString = atob(transactionBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const transaction = VersionedTransaction.deserialize(bytes);

      if (typeof provider.signAndSendTransaction === "function") {
        const result = await provider.signAndSendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 3,
        });
        const sig =
          typeof result === "object" && result !== null && "signature" in result
            ? (result as { signature: string }).signature
            : String(result);
        return sig;
      }

      const connection = new Connection(SOLANA_RPC, "confirmed");
      const signed = await provider.signTransaction(transaction);
      const raw = signed.serialize();
      const sig = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
      });
      return sig;
    },
    [
      solanaSource,
      privySolanaWallet,
      privySignAndSend,
      phantomSolanaAvailable,
      phantomSolana,
    ],
  );

  const pollOrderStatus = useCallback(
    async (
      signature: string,
    ): Promise<{ status: string; fills?: unknown[] }> => {
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(
          `/api/kalshi/dflow-order-status?signature=${encodeURIComponent(signature)}`,
        );
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const data = (await res.json()) as {
          status: string;
          fills?: unknown[];
        };
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

  const handleTrade = useCallback(async () => {
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }

    if (isKalshiGeoblocked) {
      showErrorNotification(
        "Trading unavailable",
        "Trading is not available in your region. Kalshi restricts access from your jurisdiction.",
      );
      return;
    }

    if (!solanaAddress) {
      showErrorNotification(
        "Error",
        "Connect your Solana wallet (Phantom or Privy) to trade.",
      );
      return;
    }

    const inputValue = parseFloat(size) || 0;
    if (!selectedOutcome) {
      showErrorNotification("Error", "Please select an outcome (Yes or No).");
      return;
    }

    if (!dflowMarket?.yesMint || !dflowMarket?.noMint) {
      showErrorNotification(
        "Error",
        "Market data not ready. Try again in a moment.",
      );
      return;
    }

    let amountScaled: number;
    let inputMint: string;
    let outputMint: string;

    if (activeTab === "buy") {
      outputMint =
        selectedOutcome === "Yes" ? dflowMarket.yesMint : dflowMarket.noMint;

      const usdAmount = inputValue;
      const currentPrice =
        selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice;
      let effectivePrice: number;
      if (orderType === "limit" && limitPrice) {
        const limitPriceNum = parseInt(limitPrice);
        effectivePrice = isValidPriceCents(limitPriceNum)
          ? convertCentsToPrice(limitPriceNum)
          : currentPrice;
      } else {
        effectivePrice = currentPrice;
      }
      if (effectivePrice <= 0) {
        showErrorNotification("Error", "Invalid price.");
        return;
      }
      const shares = usdAmount / effectivePrice;
      if (!isValidSize(shares)) {
        showErrorNotification(
          "Error",
          `Amount must result in shares > ${MIN_ORDER_SIZE}`,
        );
        return;
      }

      // DFlow: settlement mints are USDC and CASH. Trade from any spot token (SOL, etc.) → settlement → outcome.
      const hasEnoughUsdc =
        usdcBalance != null && usdcBalance.amount >= usdAmount;
      if (hasEnoughUsdc) {
        amountScaled = Math.round(usdAmount * 10 ** USDC_DECIMALS);
        inputMint = USDC_MINT;
      } else {
        if (solPriceUsd == null || solPriceUsd <= 0) {
          showErrorNotification(
            "Error",
            "Loading SOL price. Try again in a moment.",
          );
          return;
        }
        const solAmount = usdAmount / solPriceUsd;
        const lamports = Math.floor(solAmount * 10 ** SOL_DECIMALS);
        if (lamports <= 0) {
          showErrorNotification("Error", "Amount too small.");
          return;
        }
        if (solBalance == null || solBalance.sol < solAmount + FEE_BUFFER_SOL) {
          showErrorNotification(
            "Insufficient SOL",
            `Insufficient SOL for ~$${usdAmount.toFixed(2)} (need ~${solAmount.toFixed(4)} SOL). You have ${solBalance?.formatted ?? "—"} SOL. Leave ~${FEE_BUFFER_SOL} SOL for fees.`,
          );
          return;
        }
        amountScaled = lamports;
        inputMint = SOL_MINT;
      }
    } else {
      // Sell: DFlow decrease-position — outcome token → settlement (USDC). Use exact mint user holds.
      if (!selectedOutcome) {
        showErrorNotification("Error", "Select Yes or No to sell.");
        return;
      }
      if (!isValidSize(inputValue)) {
        showErrorNotification(
          "Error",
          `Amount must be greater than ${MIN_ORDER_SIZE}`,
        );
        return;
      }
      if (availableShares > 0 && inputValue > availableShares) {
        showErrorNotification(
          "Insufficient shares",
          `Available: ${formatShares(availableShares)}`,
        );
        return;
      }
      const outcomeMint = currentSellPosition?.mint
        ? currentSellPosition.mint
        : selectedOutcome === "Yes"
          ? dflowMarket.yesMint
          : dflowMarket.noMint;
      if (!outcomeMint) {
        showErrorNotification(
          "Error",
          "Market outcome mints not loaded. Try again.",
        );
        return;
      }
      inputMint = outcomeMint;
      outputMint = USDC_MINT;
      amountScaled = Math.floor(inputValue * 10 ** OUTCOME_DECIMALS);
      if (currentSellPosition?.rawBalance) {
        const maxRaw = parseInt(currentSellPosition.rawBalance, 10);
        if (!isNaN(maxRaw) && amountScaled > maxRaw) {
          amountScaled = maxRaw;
        }
      }
    }

    if (amountScaled <= 0) {
      showErrorNotification("Error", "Amount too small.");
      return;
    }

    setIsSubmitting(true);
    setProgressStep("fetching_order");
    showInfoNotification("Order in progress", "Getting order...");

    try {
      const params = new URLSearchParams({
        userPublicKey: solanaAddress,
        inputMint,
        outputMint,
        amount: amountScaled.toString(),
        slippageBps: DEFAULT_SLIPPAGE_BPS.toString(),
        predictionMarketSlippageBps: DEFAULT_SLIPPAGE_BPS.toString(),
      });
      if (inputMint === SOL_MINT) {
        params.set("wrapAndUnwrapSol", "true");
      }

      const orderRes = await fetch(
        `/api/kalshi/dflow-order?${params.toString()}`,
      );
      const orderData = (await orderRes.json()) as {
        transaction?: string;
        code?: string;
        msg?: string;
        error?: string;
        inAmount?: string;
        inputMint?: string;
      };

      if (!orderRes.ok || orderData.code) {
        const code = (orderData as { code?: string }).code;
        let apiMsg =
          (orderData as { msg?: string }).msg ??
          (orderData as { error?: string }).error;

        // Map DFlow route_not_found: fetch market by outcome mint and show bid/ask-specific message
        // Docs: https://pond.dflow.net/build/error-codes#route_not_found
        // Market by mint: https://pond.dflow.net/build/metadata-api/markets/market-by-mint
        if (code === "route_not_found") {
          const outcomeMint = activeTab === "buy" ? outputMint : inputMint;
          try {
            const byMintRes = await fetch(
              `/api/kalshi/dflow-market-by-mint?mint=${encodeURIComponent(outcomeMint)}`,
            );
            if (byMintRes.ok) {
              const marketByMint = (await byMintRes.json()) as {
                yesAsk?: string | null;
                noAsk?: string | null;
                yesBid?: string | null;
                noBid?: string | null;
              };
              const yesAsk = marketByMint.yesAsk ?? null;
              const noAsk = marketByMint.noAsk ?? null;
              const yesBid = marketByMint.yesBid ?? null;
              const noBid = marketByMint.noBid ?? null;
              if (activeTab === "buy") {
                if (selectedOutcome === "Yes" && (yesAsk == null || yesAsk === "")) {
                  apiMsg = "Nobody is willing to sell YES tokens right now. Try again later or choose a different market.";
                } else if (selectedOutcome === "No" && (noAsk == null || noAsk === "")) {
                  apiMsg = "Nobody is willing to sell NO tokens right now. Try again later or choose a different market.";
                } else {
                  apiMsg = "No route available for this trade right now. Try again later or choose a different market.";
                }
              } else {
                if (selectedOutcome === "Yes" && (yesBid == null || yesBid === "")) {
                  apiMsg = "Nobody is willing to buy YES tokens right now. Try again later or choose a different market.";
                } else if (selectedOutcome === "No" && (noBid == null || noBid === "")) {
                  apiMsg = "Nobody is willing to buy NO tokens right now. Try again later or choose a different market.";
                } else {
                  apiMsg = "No route available for this trade right now. Try again later or choose a different market.";
                }
              }
            }
          } catch (_) {
            // Fallback if market-by-mint fails
            apiMsg =
              activeTab === "buy" && selectedOutcome
                ? `Nobody is willing to sell ${selectedOutcome === "Yes" ? "YES" : "NO"} tokens right now. Try again later or choose a different market.`
                : "No route available for this trade right now. Liquidity may be unavailable—please try again later or reduce size.";
          }
        } else if (orderRes.status === 403) {
          apiMsg =
            apiMsg && !String(apiMsg).startsWith("HTTP error")
              ? apiMsg
              : "Order request was denied. Please try again or contact support.";
        }

        throw new Error(apiMsg || "Failed to get order");
      }

      if (!orderData.transaction) {
        throw new Error("No transaction in order response.");
      }

      setProgressStep("signing_sending");
      showInfoNotification(
        "Order in progress",
        "Signing & sending transaction...",
      );

      const signature = await signAndSendSolanaTransaction(
        orderData.transaction,
      );
      setProgressStep("confirming");
      showInfoNotification(
        "Order in progress",
        "Transaction submitted. Confirming...",
      );

      const statusData = await pollOrderStatus(signature);
      if (statusData.status === "closed") {
        setSize("");
        setLimitPrice("");
        showSuccessNotification(
          "Order Filled",
          `Transaction: ${signature.slice(0, 8)}...`,
        );
        if (activeTab === "buy") onBuyClick(selectedOutcome);
        else onSellClick(selectedOutcome);
        if (solanaAddress) {
          queryClient.invalidateQueries({
            queryKey: ["dflow-positions", solanaAddress],
          });
        }
      } else if (
        statusData.status === "failed" ||
        statusData.status === "expired"
      ) {
        showErrorNotification(
          "Order failed",
          `Order ${statusData.status}. Check wallet or try again.`,
        );
      } else {
        showInfoNotification(
          "Order submitted",
          "It may fill shortly.",
        );
        setSize("");
        setLimitPrice("");
        if (solanaAddress) {
          queryClient.invalidateQueries({
            queryKey: ["dflow-positions", solanaAddress],
          });
        }
      }
    } catch (err) {
      let msg = "Order failed";
      if (err instanceof Error) {
        msg = err.message;
        // Map common Phantom/RPC/Privy errors to user-friendly text
        if (msg.includes("User rejected") || msg.includes("rejected"))
          msg =
            "Transaction was rejected. Please try again and confirm in your wallet.";
        else if (msg.includes("Unexpected error"))
          msg =
            "Transaction failed. Check: (1) You have enough USDC or SOL for the amount, (2) Wallet is unlocked, (3) Try again.";
        else if (msg.includes("simulation") || msg.includes("Simulation"))
          msg =
            "Transaction simulation failed. You may not have enough USDC or SOL, or the order may no longer be valid. Try a smaller amount or try again.";
        else if (msg.includes("blockhash") || msg.includes("expired"))
          msg = "Transaction expired. Please try placing the order again.";
        else if (
          msg.includes("403") ||
          msg.includes("HTTP error (403)") ||
          msg.includes("denied")
        )
          msg =
            "Order request was denied. Please try again or contact support.";
      }
      showErrorNotification("Order failed", msg);
      console.error("DFlow order error:", err);
    } finally {
      setIsSubmitting(false);
      setProgressStep("idle");
    }
  }, [
    authenticated,
    isKalshiGeoblocked,
    solanaAddress,
    selectedOutcome,
    size,
    orderType,
    limitPrice,
    activeTab,
    solBalance,
    usdcBalance,
    solPriceUsd,
    availableShares,
    currentSellPosition,
    currentYesPrice,
    currentNoPrice,
    dflowMarket,
    queryClient,
    signAndSendSolanaTransaction,
    pollOrderStatus,
    onBuyClick,
    onSellClick,
  ]);

  const inputValue = parseFloat(size) || 0;
  const currentPriceForCalc =
    selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice;
  let effectivePriceForCalc: number;
  if (orderType === "limit" && limitPrice) {
    const limitPriceNum = parseInt(limitPrice);
    effectivePriceForCalc =
      !isNaN(limitPriceNum) && limitPriceNum > 0
        ? convertCentsToPrice(limitPriceNum)
        : currentPriceForCalc;
  } else {
    effectivePriceForCalc = currentPriceForCalc;
  }
  const sizeNum =
    activeTab === "buy" && effectivePriceForCalc > 0
      ? inputValue / effectivePriceForCalc
      : inputValue;

  const validAmount = isValidSize(sizeNum);

  const isTradeDisabled =
    isKalshiGeoblocked ||
    !selectedOutcome ||
    !validAmount ||
    (orderType === "limit" &&
      (!limitPrice || !isValidPriceCents(parseInt(limitPrice)))) ||
    isSubmitting ||
    (!!selectedMarketTicker && (isLoadingDflowMarket || !dflowMarket));

  const getDisableReason = (): string | null => {
    if (isSubmitting) return null;
    if (isKalshiGeoblocked)
      return kalshiGeoblockStatus?.country
        ? `Trading not available in your region (${kalshiGeoblockStatus.country})`
        : "Trading not available in your region";
    if (!selectedOutcome) return "Select Yes or No";
    if (!isValidSize(sizeNum)) return `Amount must be > ${MIN_ORDER_SIZE}`;
    if (orderType === "limit") {
      if (!limitPrice) return "Enter limit price";
      if (!isValidPriceCents(parseInt(limitPrice))) return "Price 1–99¢";
    }
    if (selectedMarketTicker && (isLoadingDflowMarket || !dflowMarket))
      return "Loading market...";
    return null;
  };

  const disableReason = getDisableReason();

  return (
    <div className="flex flex-col min-h-full border border-white/10 rounded-lg overflow-hidden">
      {/* Profile Section - same as Polymarket */}
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
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white/10">
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
      </div>

      {/* Yes/No Selection Buttons - same as Polymarket */}
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

      {/* Order type: market only (Limit option hidden for Kalshi) */}

      {/* Size Input Section - same as Polymarket */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="mb-3 bg-white/5 rounded-lg p-3">
          <p className="text-xs text-white/60 mb-1">Current Market Price</p>
          <p className="text-lg font-bold text-white">
            {formatPrice(
              selectedOutcome === "Yes" ? currentYesPrice : currentNoPrice,
            )}
          </p>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-white/80">
              {activeTab === "buy" ? "Amount ($)" : "Size (shares)"}
            </label>
            {solanaAddress && (
              <div className="flex flex-col items-start">
                <span className="text-sm text-white/80">
                  {activeTab === "buy" ? (
                    <>Available: {formatCurrency(usdcBalance?.amount ?? 0)}</>
                  ) : selectedOutcome ? (
                    <>Available shares: {formatShares(availableShares)}</>
                  ) : (
                    <>
                      Available: Yes {formatShares(availableSharesYes)}, No{" "}
                      {formatShares(availableSharesNo)}
                    </>
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
                        (activeTab === "buy"
                          ? (usdcBalance?.amount ?? 0) <= 0
                          : availableShares <= 0)
                      }
                      className="py-1 px-2 rounded border border-green-500/50 bg-white/5 text-white/90 text-[10px] font-medium hover:bg-white/10 hover:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5 transition-colors"
                    >
                      {pct === 100 ? "Max" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
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
        {authenticated && solanaAddress && (
          <div className="shrink-0">
            <div className="text-xs text-white/60 space-y-1">
              <div>
                USDC Balance:{" "}
                <span className="text-white font-medium">
                  ${usdcBalance?.formatted ?? "0.00"}
                </span>
                (
                <span className="text-white font-medium">
                  {solBalance?.formatted ?? "0"} SOL
                </span>
                )
              </div>
            </div>
          </div>
        )}

        {/* Order Summary / To Win - same as Polymarket */}
        {selectedOutcome && inputValue > 0 && (
          <>
            {activeTab === "buy" && effectivePriceForCalc > 0 && (
              <div className="mt-4 bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-white/60">To win</span>
                    <span className="text-xs text-white/60">
                      Avg. Price {formatPrice(effectivePriceForCalc)}
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-green-500">
                    {formatCurrency(inputValue / effectivePriceForCalc)}
                  </span>
                </div>
              </div>
            )}
            {activeTab === "sell" && (
              <div className="mt-4 bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-white">You'll receive</span>
                    <span className="text-xs text-white/60">
                      Avg. Price {formatPrice(effectivePriceForCalc)}
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-green-500">
                    {formatCurrency(inputValue * effectivePriceForCalc)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* {isSubmitting && progressStep !== "idle" && (
        <div className="px-4 py-2 border-t border-white/10">
          <div className="flex items-center gap-2 text-sm text-white/80">
            <span className="inline-block w-2 h-2 rounded-full bg-[#ffc000] animate-pulse" />
            {progressStep === "fetching_order" && "Getting order..."}
            {progressStep === "signing_sending" && "Signing & sending..."}
            {progressStep === "confirming" && "Confirming on chain..."}
          </div>
        </div>
      )} */}

      {/* Spacer so Place Order stays at bottom when widget fills column height */}
      <div className="flex-1 min-h-[1px]" aria-hidden="true" />

      <div className="p-4 border-t border-white/10 flex-shrink-0">
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
                : disableReason || (activeTab === "buy" ? "Place Order" : "Sell")}
        </button>
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}
