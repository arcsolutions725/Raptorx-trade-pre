"use client";

import { useState, useEffect, useRef, useContext, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Check, ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";
import copy from "copy-to-clipboard";
import { useWallet } from "@/contexts/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import { usePolymarketDepositAddresses } from "@/hooks/usePolymarketDepositAddresses";
import { TradingContext } from "@/providers/TradingProvder";
import useUsdcTransfer from "@/hooks/useUsdcTransfer";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useSolanaBalance } from "@/hooks/useSolanaBalance";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { showSuccessNotification } from "@/components/ui/notification";
import { USDC_E_DECIMALS } from "@/constants/tokens";
import { parseUnits, isAddress } from "viem";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets as usePrivySolanaWallets,
} from "@privy-io/react-auth/solana";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

/** Solana USDC (SPL) mint – used for Kalshi USDC withdraw */
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_USDC_DECIMALS = 6;

type PlatformTab = "kalshi" | "polymarket";
type KalshiWithdrawAsset = "SOL" | "USDC";

type DepositWithdrawModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** When on rexmarkets, pre-select Kalshi or Polymarket based on current page */
  defaultPlatform?: PlatformTab;
};

const truncateAddress = (address: string) => {
  if (!address || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function DepositWithdrawModal({
  isOpen,
  onClose,
  defaultPlatform = "polymarket",
}: DepositWithdrawModalProps) {
  const [platformTab, setPlatformTab] = useState<PlatformTab>(defaultPlatform);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSendingSol, setIsSendingSol] = useState(false);
  const [isSendingUsdc, setIsSendingUsdc] = useState(false);
  const [kalshiWithdrawAsset, setKalshiWithdrawAsset] =
    useState<KalshiWithdrawAsset>("USDC");
  const [kalshiWithdrawError, setKalshiWithdrawError] = useState<string | null>(
    null,
  );
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [lastWithdrawnAmount, setLastWithdrawnAmount] = useState<string | null>(
    null,
  );
  const [lastWithdrawnAsset, setLastWithdrawnAsset] =
    useState<KalshiWithdrawAsset | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get wallet addresses
  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);

  // Check Privy wallet status (Ethereum)
  const { wallets, ready: walletsReady } = useWallets();
  const { ready: privyReady, user: privyUser } = usePrivy();
  const isWalletsLoading = !privyReady || !walletsReady;

  // Safely get trading context (may be null if TradingProvider is not available)
  const tradingContext = useContext(TradingContext);
  const relayClient = tradingContext?.relayClient || null;
  const safeAddr = tradingContext?.safeAddress || derivedSafeAddressFromEoa;
  const isTradingSessionComplete = tradingContext?.isTradingSessionComplete;
  const initializeTradingSession = tradingContext?.initializeTradingSession;
  const currentStep = tradingContext?.currentStep || "idle";
  const sessionError = tradingContext?.sessionError;
  const isGeoblocked = tradingContext?.isGeoblocked || false;
  const geoblockStatus = tradingContext?.geoblockStatus;

  const {
    solanaAddress,
    source: solanaSource,
    isLoading: isSolanaAddressLoading,
  } = useSolanaWalletAddress();

  // Privy Solana: for Kalshi withdraw (sign and send SOL)
  const { signAndSendTransaction: privySignAndSend } =
    useSignAndSendTransaction();
  const { wallets: privySolanaWallets, ready: privySolanaWalletsReady } =
    usePrivySolanaWallets();
  const privySolanaWallet =
    solanaSource === "privy" && solanaAddress && privySolanaWalletsReady
      ? (privySolanaWallets.find((w) => {
          const addr =
            (w as { address?: string }).address ??
            (w as { accounts?: { address: string }[] }).accounts?.[0]?.address;
          return addr?.toLowerCase() === solanaAddress.toLowerCase();
        }) ?? null)
      : null;

  const queryClient = useQueryClient();
  const privyUserId = solanaSource === "privy" ? (privyUser?.id ?? null) : null;
  const {
    data: solanaBalanceData,
    isLoading: isSolanaBalanceLoading,
    refetch: refetchSolanaBalance,
  } = useSolanaBalance(
    isOpen && platformTab === "kalshi" ? solanaAddress : null,
    solanaSource,
    privyUserId,
  );
  const {
    data: kalshiUsdcBalanceData,
    isLoading: isKalshiUsdcBalanceLoading,
    refetch: refetchKalshiUsdcBalance,
  } = useUsdcBalance(isOpen && platformTab === "kalshi" ? solanaAddress : null);

  const {
    data: depositAddressesData,
    isLoading: isLoadingDepositAddresses,
    error: depositAddressesError,
  } = usePolymarketDepositAddresses({
    walletAddress: safeAddr || null,
    enabled:
      isOpen &&
      platformTab === "polymarket" &&
      activeTab === "deposit" &&
      !!safeAddr,
  });

  // Withdraw functionality
  const { isTransferring, error, transferUsdc } = useUsdcTransfer();
  const { formattedUsdcBalance, rawUsdcBalance } = usePolygonBalances(safeAddr);

  useEffect(() => {
    if (isOpen) {
      setPlatformTab(defaultPlatform);
      setRecipient("");
      setAmount("");
      setShowSuccess(false);
      setCopiedAddress(null);
      setAddressError(null);
      setKalshiWithdrawError(null);
      setKalshiWithdrawAsset("USDC");
      setLastWithdrawnAmount(null);
      setLastWithdrawnAsset(null);
    }
  }, [isOpen, defaultPlatform]);

  // Clear error messages after 3 seconds
  useEffect(() => {
    if (error || addressError) {
      setShowError(true);
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setAddressError(null);
        setShowError(false);
      }, 3000);
    }
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [error, addressError]);

  useEffect(() => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleCopyAddress = (address: string, type: "evm" | "svm" | "btc") => {
    if (!address) return;
    copy(address);
    setCopiedAddress(type);

    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

    copyTimeoutRef.current = setTimeout(() => {
      setCopiedAddress(null);
    }, 2000);
  };

  const handleRefreshKalshiBalance = useCallback(async () => {
    if (isRefreshingBalance) return;
    setIsRefreshingBalance(true);
    try {
      await Promise.all([
        refetchSolanaBalance(),
        refetchKalshiUsdcBalance(),
      ]);
    } finally {
      setIsRefreshingBalance(false);
    }
  }, [refetchSolanaBalance, refetchKalshiUsdcBalance, isRefreshingBalance]);

  const handleTransfer = async () => {
    if (!relayClient || !recipient || !amount) return;

    // Validate address format when clicking send button
    const trimmedRecipient = recipient.trim();
    if (!isAddress(trimmedRecipient)) {
      setAddressError("Invalid Address");
      setShowError(true);
      // Clear error after 3 seconds
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setAddressError(null);
        setShowError(false);
      }, 3000);
      return;
    }

    // Clear any previous address errors
    setAddressError(null);
    setShowError(false);

    try {
      const amountBigInt = parseUnits(amount, USDC_E_DECIMALS);
      await transferUsdc(relayClient, {
        recipient: trimmedRecipient as `0x${string}`,
        amount: amountBigInt,
      });
      setShowSuccess(true);
      showSuccessNotification(
        "Withdrawal successful",
        `${amount} USDC.e withdrawn successfully.`,
      );
      setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Transfer failed:", err);
    }
  };

  // Validate Solana address (base58, 32–44 chars)
  const isValidSolanaAddress = useCallback((addr: string) => {
    try {
      new PublicKey(addr);
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleKalshiWithdraw = useCallback(async () => {
    const trimmedRecipient = recipient.trim();
    const solAmount = parseFloat(amount);

    if (!solanaAddress || !trimmedRecipient || !amount) {
      setKalshiWithdrawError("Please enter recipient and amount.");
      return;
    }
    if (!isValidSolanaAddress(trimmedRecipient)) {
      setKalshiWithdrawError("Invalid Solana address.");
      return;
    }
    if (isNaN(solAmount) || solAmount <= 0) {
      setKalshiWithdrawError("Please enter a valid SOL amount.");
      return;
    }

    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    const feeReserve = 5000; // leave ~0.000005 SOL for fee
    const availableLamports = solanaBalanceData?.lamports ?? 0;
    if (lamports + feeReserve > availableLamports) {
      setKalshiWithdrawError("Insufficient SOL balance.");
      return;
    }

    setKalshiWithdrawError(null);
    setIsSendingSol(true);

    try {
      const connection = new Connection(SOLANA_RPC, "confirmed");
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const fromPubkey = new PublicKey(solanaAddress);
      const toPubkey = new PublicKey(trimmedRecipient);

      const transferIx = SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
      });
      const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: blockhash,
        instructions: [transferIx],
      }).compileToV0Message();
      const transaction = new VersionedTransaction(messageV0);
      const serialized = transaction.serialize();

      if (solanaSource === "privy") {
        if (!privySolanaWallet) {
          throw new Error("Privy Solana wallet not found. Please reconnect.");
        }
        const txBytes = new Uint8Array(serialized);
        const result = await privySignAndSend({
          transaction: txBytes,
          wallet: privySolanaWallet,
          chain: "solana:mainnet",
          options: { uiOptions: { showWalletUIs: true } },
        });
        const sigBytes = result.signature;
        if (!sigBytes?.length) throw new Error("No signature from Privy");
        // signature is Uint8Array; success UI doesn't need it unless we show explorer link
      } else if (solanaSource === "phantom") {
        const provider =
          typeof window !== "undefined" &&
          (window as { phantom?: { solana?: unknown } }).phantom?.solana;
        if (
          !provider ||
          typeof (
            provider as {
              signAndSendTransaction?: (
                tx: VersionedTransaction,
                opts?: unknown,
              ) => Promise<{ signature: string }>;
            }
          ).signAndSendTransaction !== "function"
        ) {
          throw new Error(
            "Phantom wallet not found. Please install or unlock Phantom.",
          );
        }
        const tx = VersionedTransaction.deserialize(serialized);
        await (
          provider as {
            signAndSendTransaction: (
              tx: VersionedTransaction,
              opts?: unknown,
            ) => Promise<{ signature: string }>;
          }
        ).signAndSendTransaction(tx, {
          skipPreflight: false,
          maxRetries: 3,
        });
      } else {
        throw new Error(
          "Connect your Phantom or Privy Solana wallet to withdraw.",
        );
      }

      setLastWithdrawnAmount(amount);
      setLastWithdrawnAsset("SOL");
      setShowSuccess(true);
      setRecipient("");
      setAmount("");
      showSuccessNotification(
        "Withdrawal successful",
        `${amount} SOL withdrawn successfully.`,
      );
      if (solanaAddress) {
        void queryClient.invalidateQueries({
          queryKey: ["solana-balance", solanaAddress],
        });
        void queryClient.invalidateQueries({
          queryKey: ["usdc-balance", solanaAddress],
        });
      }
      setTimeout(() => {
        setShowSuccess(false);
        setLastWithdrawnAmount(null);
        setLastWithdrawnAsset(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Withdraw failed.";
      setKalshiWithdrawError(message);
    } finally {
      setIsSendingSol(false);
    }
  }, [
    recipient,
    amount,
    solanaAddress,
    solanaSource,
    solanaBalanceData?.lamports,
    isValidSolanaAddress,
    privySolanaWallet,
    privySignAndSend,
    queryClient,
  ]);

  const handleKalshiWithdrawUsdc = useCallback(async () => {
    const trimmedRecipient = recipient.trim();
    const usdcAmount = parseFloat(amount);

    if (!solanaAddress || !trimmedRecipient || !amount) {
      setKalshiWithdrawError("Please enter recipient and amount.");
      return;
    }
    if (!isValidSolanaAddress(trimmedRecipient)) {
      setKalshiWithdrawError("Invalid Solana address.");
      return;
    }
    if (isNaN(usdcAmount) || usdcAmount <= 0) {
      setKalshiWithdrawError("Please enter a valid USDC amount.");
      return;
    }

    const rawAmount = BigInt(
      Math.floor(usdcAmount * 10 ** SOLANA_USDC_DECIMALS),
    );
    const usdcBalanceRaw = BigInt(kalshiUsdcBalanceData?.rawAmount ?? "0");
    if (rawAmount > usdcBalanceRaw) {
      setKalshiWithdrawError("Insufficient USDC balance.");
      return;
    }

    setKalshiWithdrawError(null);
    setIsSendingUsdc(true);

    try {
      const connection = new Connection(SOLANA_RPC, "confirmed");
      const usdcMint = new PublicKey(SOLANA_USDC_MINT);
      const fromPubkey = new PublicKey(solanaAddress);
      const toPubkey = new PublicKey(trimmedRecipient);

      const sourceAta = getAssociatedTokenAddressSync(usdcMint, fromPubkey);
      const destAta = getAssociatedTokenAddressSync(usdcMint, toPubkey);

      const instructions: import("@solana/web3.js").TransactionInstruction[] =
        [];

      const destAccountInfo = await connection.getAccountInfo(destAta);
      if (!destAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            fromPubkey,
            destAta,
            toPubkey,
            usdcMint,
          ),
        );
      }

      instructions.push(
        createTransferCheckedInstruction(
          sourceAta,
          usdcMint,
          destAta,
          fromPubkey,
          rawAmount,
          SOLANA_USDC_DECIMALS,
        ),
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();
      const transaction = new VersionedTransaction(messageV0);
      const serialized = transaction.serialize();

      if (solanaSource === "privy") {
        if (!privySolanaWallet) {
          throw new Error("Privy Solana wallet not found. Please reconnect.");
        }
        const txBytes = new Uint8Array(serialized);
        await privySignAndSend({
          transaction: txBytes,
          wallet: privySolanaWallet,
          chain: "solana:mainnet",
          options: { uiOptions: { showWalletUIs: true } },
        });
      } else if (solanaSource === "phantom") {
        const provider =
          typeof window !== "undefined" &&
          (window as { phantom?: { solana?: unknown } }).phantom?.solana;
        if (
          !provider ||
          typeof (
            provider as {
              signAndSendTransaction?: (
                tx: VersionedTransaction,
                opts?: unknown,
              ) => Promise<{ signature: string }>;
            }
          ).signAndSendTransaction !== "function"
        ) {
          throw new Error(
            "Phantom wallet not found. Please install or unlock Phantom.",
          );
        }
        const tx = VersionedTransaction.deserialize(serialized);
        await (
          provider as {
            signAndSendTransaction: (
              tx: VersionedTransaction,
              opts?: unknown,
            ) => Promise<{ signature: string }>;
          }
        ).signAndSendTransaction(tx, {
          skipPreflight: false,
          maxRetries: 3,
        });
      } else {
        throw new Error(
          "Connect your Phantom or Privy Solana wallet to withdraw.",
        );
      }

      setLastWithdrawnAmount(amount);
      setLastWithdrawnAsset("USDC");
      setShowSuccess(true);
      setRecipient("");
      setAmount("");
      showSuccessNotification(
        "Withdrawal successful",
        `${amount} USDC withdrawn successfully.`,
      );
      if (solanaAddress) {
        void queryClient.invalidateQueries({
          queryKey: ["usdc-balance", solanaAddress],
        });
        void queryClient.invalidateQueries({
          queryKey: ["solana-balance", solanaAddress],
        });
      }
      setTimeout(() => {
        setShowSuccess(false);
        setLastWithdrawnAmount(null);
        setLastWithdrawnAsset(null);
      }, 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "USDC withdraw failed.";
      setKalshiWithdrawError(message);
    } finally {
      setIsSendingUsdc(false);
    }
  }, [
    recipient,
    amount,
    solanaAddress,
    solanaSource,
    kalshiUsdcBalanceData?.rawAmount,
    isValidSolanaAddress,
    privySolanaWallet,
    privySignAndSend,
    queryClient,
  ]);

  // Helper function to get user-friendly error message
  const getErrorMessage = () => {
    if (!error) return null;

    const errorMessage = error.message?.toLowerCase() || "";
    const errorString = error.toString().toLowerCase();

    // Check for invalid address errors
    if (
      errorMessage.includes("invalid address") ||
      errorMessage.includes("invalid recipient") ||
      errorMessage.includes("checksum") ||
      errorMessage.includes("address format") ||
      errorString.includes("invalid address") ||
      errorString.includes("invalid recipient")
    ) {
      return "Invalid Address";
    }

    // Return original error message for other errors
    return error.message || "An error occurred";
  };

  const handleSendMax = () => {
    if (rawUsdcBalance) {
      setAmount((Number(rawUsdcBalance) / 10 ** USDC_E_DECIMALS).toString());
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40" />
      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          ref={modalRef}
          className="w-125 max-w-[90%] bg-[#0D0D0D] rounded-xl shadow-2xl border border-white/10 pointer-events-auto max-h-[80vh] overflow-y-auto custom-sidebar-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-xl font-bold text-white">Deposit & Withdraw</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-400 hover:text-white"
              aria-label="Close modal"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Platform tabs: Kalshi | Polymarket */}
          <div className="flex space-x-1 mx-4 mt-4 bg-[#141414] p-1 rounded-lg">
            <button
              onClick={() => setPlatformTab("kalshi")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                platformTab === "kalshi"
                  ? "bg-[#17cb91] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Kalshi
            </button>
            <button
              onClick={() => setPlatformTab("polymarket")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                platformTab === "polymarket"
                  ? "bg-[#2C59F7] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Polymarket
            </button>
          </div>

          {/* Deposit / Withdraw tabs (Kalshi and Polymarket) */}
          {(platformTab === "polymarket" || platformTab === "kalshi") && (
            <div className="flex space-x-1 mx-4 mt-2 bg-[#141414] p-1 rounded-lg">
              <button
                onClick={() => setActiveTab("deposit")}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === "deposit"
                    ? platformTab === "kalshi"
                      ? "bg-[#ffc000] text-black"
                      : "bg-[#ffc000] text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" />
                Deposit
              </button>
              <button
                onClick={() => setActiveTab("withdraw")}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === "withdraw"
                    ? platformTab === "kalshi"
                      ? "bg-[#ffc000] text-black"
                      : "bg-[#ffc000] text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" />
                Withdraw
              </button>
            </div>
          )}

          {/* Content */}
          <div className="p-4">
            {platformTab === "kalshi" ? (
              activeTab === "deposit" ? (
                /* Kalshi Deposit: Solana wallet address + balance (Phantom or Privy) */
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-white font-semibold mb-3">
                      Solana Wallet (Kalshi)
                    </h4>
                    <p className="text-xs text-gray-400 mb-3">
                      Send SOL or USDC to this address to fund your Kalshi
                      trading account.
                    </p>
                    {isSolanaAddressLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#17cb91]" />
                      </div>
                    ) : !solanaAddress ? (
                      <p className="text-gray-400 text-sm py-2">
                        Connect your Phantom or Privy wallet to see your Solana
                        address.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {solanaSource && (
                          <span className="text-xs text-gray-500">
                            Connected via{" "}
                            {solanaSource === "phantom" ? "Phantom" : "Privy"}
                          </span>
                        )}
                        <div className="flex flex-col gap-1">
                          <span className="text-gray-400 text-xs">
                            Solana (SVM) Address:
                          </span>
                          <div className="flex items-center gap-2 bg-black/30 rounded px-2 py-1.5">
                            <span className="text-white text-xs font-mono break-all flex-1 min-w-0">
                              {solanaAddress}
                            </span>
                            <button
                              onClick={() =>
                                handleCopyAddress(solanaAddress, "svm")
                              }
                              className="p-1 hover:bg-white/10 rounded transition-colors shrink-0"
                              title="Copy Solana address"
                            >
                              {copiedAddress === "svm" ? (
                                <Check className="w-4 h-4 text-green-400" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="bg-black/30 rounded-lg p-3 mt-2 space-y-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-gray-400">
                              Wallet Balance
                            </p>
                            <button
                              type="button"
                              onClick={handleRefreshKalshiBalance}
                              disabled={
                                isRefreshingBalance ||
                                isSolanaBalanceLoading ||
                                isKalshiUsdcBalanceLoading
                              }
                              className="p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Refresh balance"
                            >
                              <RefreshCw
                                className={`w-4 h-4 text-gray-400 hover:text-[#ffc000] ${
                                  isRefreshingBalance ? "animate-spin" : ""
                                }`}
                              />
                            </button>
                          </div>
                          <div className="flex flex-col gap-1 text-[14px]">
                            {isKalshiUsdcBalanceLoading ||
                            isSolanaBalanceLoading ||
                            isRefreshingBalance ? (
                              <span className="inline-block animate-pulse h-5 w-16 bg-white/10 rounded align-middle" />
                            ) : (
                              <>
                                <span className="text-white/90 font-semibold text-[12px]">
                                  {kalshiUsdcBalanceData?.formatted ?? "0.00"}{" "}
                                  USDC (
                                  <span className="text-white/90 font-semibold">
                                    {solanaBalanceData?.formatted ?? "0"} SOL
                                  </span>
                                  )
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Kalshi Withdraw: send SOL or USDC to another Solana address */
                <div className="space-y-4">
                  {kalshiWithdrawError && (
                    <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3">
                      <p className="text-red-300 text-sm">
                        {kalshiWithdrawError}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Withdraw as</p>
                    <div className="flex rounded-lg overflow-hidden border border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setKalshiWithdrawAsset("USDC");
                          setAmount("");
                        }}
                        className={`flex-1 py-2 px-3 text-sm font-medium ${
                          kalshiWithdrawAsset === "USDC"
                            ? "bg-[#17cb91] text-black"
                            : "bg-white/5 text-gray-400 hover:text-white"
                        }`}
                      >
                        USDC
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setKalshiWithdrawAsset("SOL");
                          setAmount("");
                        }}
                        className={`flex-1 py-2 px-3 text-sm font-medium ${
                          kalshiWithdrawAsset === "SOL"
                            ? "bg-[#17cb91] text-black"
                            : "bg-white/5 text-gray-400 hover:text-white"
                        }`}
                      >
                        SOL
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Recipient (Solana address)
                    </label>
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="e.g. 9NvE68JVWHHHGLp5NNELtM5fiBw6SXHrzqQJjUqaykC1"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#17cb91] text-white font-mono text-sm"
                      disabled={isSendingSol || isSendingUsdc}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Available Balance (
                      {kalshiWithdrawAsset === "USDC"
                        ? (kalshiUsdcBalanceData?.formatted ?? "0.00 USDC") +
                          " USDC"
                        : (solanaBalanceData?.formatted ?? "0") + " SOL"}
                      )
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={
                          kalshiWithdrawAsset === "USDC" ? "0.00" : "0.0000"
                        }
                        className="w-full px-4 py-2 pr-16 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#17cb91] text-white"
                        disabled={isSendingSol || isSendingUsdc}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (kalshiWithdrawAsset === "USDC") {
                            setAmount(kalshiUsdcBalanceData?.formatted ?? "0");
                          } else {
                            setAmount(
                              solanaBalanceData
                                ? String(
                                    Math.max(
                                      0,
                                      solanaBalanceData.sol - 0.0001,
                                    ).toFixed(4),
                                  )
                                : "0",
                            );
                          }
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-[#17cb91] hover:bg-[#1ee0a0] rounded text-black font-semibold"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={
                      kalshiWithdrawAsset === "USDC"
                        ? handleKalshiWithdrawUsdc
                        : handleKalshiWithdraw
                    }
                    disabled={
                      isSendingSol ||
                      isSendingUsdc ||
                      !recipient.trim() ||
                      !amount ||
                      !solanaAddress ||
                      (solanaSource === "privy" && !privySolanaWallet)
                    }
                    className="w-full py-3 bg-[#17cb91] hover:bg-[#1ee0a0] disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
                  >
                    {isSendingUsdc
                      ? "Sending..."
                      : isSendingSol
                        ? "Sending..."
                        : kalshiWithdrawAsset === "USDC"
                          ? "Send USDC"
                          : "Send SOL"}
                  </button>
                  {!solanaAddress && (
                    <p className="text-xs text-yellow-400 text-center">
                      Connect your Phantom or Privy Solana wallet to withdraw.
                    </p>
                  )}
                </div>
              )
            ) : activeTab === "deposit" ? (
              <div className="space-y-4">
                {!safeAddr ? (
                  <div className="text-center py-8 space-y-3">
                    {isWalletsLoading ? (
                      <>
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#ffc000]"></div>
                        </div>
                        <p className="text-gray-400">
                          Setting up your wallet...
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-400">
                        Please connect your wallet to view deposit addresses. If
                        you just logged in, your wallet may still be
                        initializing.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bg-white/5 rounded-lg p-4">
                      <h4 className="text-white font-semibold mb-3">
                        Deposit Addresses
                      </h4>
                      <p className="text-xs text-gray-400 mb-3">
                        Send assets to these addresses to bridge and swap to
                        USDC.e on Polygon for trading.
                      </p>
                      {isLoadingDepositAddresses ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#ffc000]"></div>
                        </div>
                      ) : depositAddressesError ? (
                        <div className="text-red-400 text-sm py-2">
                          Failed to load deposit addresses. Please try again
                          later.
                        </div>
                      ) : depositAddressesData?.address ? (
                        <div className="space-y-3">
                          {/* Polygon (USDC.e) Address */}
                          <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-xs">
                              Polygon (USDC.e):
                            </span>
                            <div className="flex items-center gap-2 bg-black/30 rounded px-2 py-1.5">
                              <span className="text-white text-xs font-mono break-all flex-1 min-w-0">
                                {depositAddressesData.address.evm}
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    depositAddressesData.address.evm,
                                    "evm",
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors shrink-0"
                                title="Copy Polygon address"
                              >
                                {copiedAddress === "evm" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Solana Address */}
                          <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-xs">
                              Solana (SVM):
                            </span>
                            <div className="flex items-center gap-2 bg-black/30 rounded px-2 py-1.5">
                              <span className="text-white text-xs font-mono break-all flex-1 min-w-0">
                                {depositAddressesData.address.svm}
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    depositAddressesData.address.svm,
                                    "svm",
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors shrink-0"
                                title="Copy Solana address"
                              >
                                {copiedAddress === "svm" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Bitcoin Address */}
                          <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-xs">
                              Bitcoin:
                            </span>
                            <div className="flex items-center gap-2 bg-black/30 rounded px-2 py-1.5">
                              <span className="text-white text-xs font-mono break-all flex-1 min-w-0">
                                {depositAddressesData.address.btc}
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    depositAddressesData.address.btc,
                                    "btc",
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors shrink-0"
                                title="Copy Bitcoin address"
                              >
                                {copiedAddress === "btc" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            </div>
                          </div>

                          {depositAddressesData.note && (
                            <p className="text-xs text-gray-500 mt-2 italic">
                              {depositAddressesData.note}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm py-2">
                          No deposit addresses available.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Success Message */}
                {showSuccess && (
                  <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-3">
                    <p className="text-green-300 font-medium text-sm">
                      Transfer successful!
                    </p>
                  </div>
                )}

                {/* Error Message */}
                {error && showError && (
                  <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3">
                    <p className="text-red-300 text-sm">{getErrorMessage()}</p>
                  </div>
                )}

                {/* Address Validation Error */}
                {addressError && showError && (
                  <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3">
                    <p className="text-red-300 text-sm">{addressError}</p>
                  </div>
                )}

                {/* Balance Display */}
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">
                    Available Balance
                  </p>
                  <p className="text-lg font-bold">
                    ${formattedUsdcBalance} USDC.e
                  </p>
                </div>

                {/* Recipient Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#ffc000] text-white font-mono text-sm"
                    disabled={isTransferring}
                  />
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Amount (USDC.e)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2 pr-16 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#ffc000] text-white"
                      disabled={isTransferring}
                    />
                    <button
                      type="button"
                      onClick={handleSendMax}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-[#ffc000] hover:bg-[#ffd000] rounded text-black font-semibold"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {/* Send Button */}
                <button
                  onClick={handleTransfer}
                  disabled={
                    isTransferring ||
                    !recipient ||
                    !amount ||
                    !relayClient ||
                    !safeAddr
                  }
                  className="w-full py-3 bg-[#ffc000] hover:bg-[#ffd000] disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
                >
                  {isTransferring ? "Sending..." : "Send USDC.e"}
                </button>

                {!relayClient && eoaAddress && initializeTradingSession && (
                  <div className="space-y-3 mt-2">
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
                        isTradingSessionComplete ||
                        isGeoblocked
                      }
                      className="w-full px-6 py-3 bg-[#ffc000] text-black font-semibold rounded-lg hover:bg-[#ffd633] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#ffc000]"
                    >
                      {isInitializing || currentStep !== "idle" ? (
                        <span className="flex items-center justify-center gap-2">
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
                      ) : isGeoblocked ? (
                        "Trading not available in your region"
                      ) : (
                        "Initialize Trading"
                      )}
                    </button>
                    {/* Show geoblock message when geoblocked */}
                    {isGeoblocked &&
                      !isInitializing &&
                      currentStep === "idle" && (
                        <p className="text-yellow-400 text-sm text-center">
                          {geoblockStatus?.country || geoblockStatus?.region
                            ? `Trading is not available in your region (${geoblockStatus.country}${geoblockStatus.region ? `, ${geoblockStatus.region}` : ""}). Polymarket is geoblocked in your location.`
                            : "Trading is not available in your region. Polymarket is geoblocked in your location."}
                        </p>
                      )}
                    {sessionError && (
                      <p className="text-red-400 text-sm text-center">
                        {sessionError.message ||
                          "Failed to initialize trading session"}
                      </p>
                    )}
                  </div>
                )}
                {!relayClient && !eoaAddress && (
                  <p className="text-xs text-yellow-400 mt-2 text-center">
                    Please connect your wallet first
                  </p>
                )}
                {!relayClient && eoaAddress && !initializeTradingSession && (
                  <p className="text-xs text-yellow-400 mt-2 text-center">
                    Start a trading session first
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
