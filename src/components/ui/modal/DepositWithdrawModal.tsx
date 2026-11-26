"use client";

import {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import Image from "next/image";
import clsx from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Compass, RefreshCw, CircleAlert, Wallet } from "lucide-react";
import copy from "copy-to-clipboard";
import { AcctModal, AcctModalHead } from "@/components/ui/modal/accountUi";
import { useWallet } from "@/contexts/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import { usePolymarketDepositAddresses } from "@/hooks/usePolymarketDepositAddresses";
import { TradingContext } from "@/providers/TradingProvder";
import useUsdcTransfer from "@/hooks/useUsdcTransfer";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useSolanaBalance } from "@/hooks/useSolanaBalance";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { useBaseBalance } from "@/hooks/useBaseBalance";
import { showSuccessNotification } from "@/components/ui/notification";
import { USDC_E_DECIMALS } from "@/constants/tokens";
import { parseUnits, parseEther, isAddress, createWalletClient, custom } from "viem";
import { base, bsc } from "viem/chains";
import { erc20Abi } from "viem";
import { USDC_BASE_ADDRESS, USDC_BASE_DECIMALS } from "@/constants/tokens";
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
import {
  useMyriadBscBalances,
  MYRIAD_BSC_USD1,
  MYRIAD_BSC_USDT,
  MYRIAD_BSC_STABLE_DECIMALS,
  MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB,
} from "@/hooks/useMyriadBscBalances";
import { formatCurrency } from "@/utils/format";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

/** Solana USDC (SPL) mint – used for Kalshi USDC withdraw */
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_USDC_DECIMALS = 6;

type PlatformTab = "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun";
type KalshiWithdrawAsset = "SOL" | "USDC";
type MyriadWithdrawAsset = "BNB" | "USD1" | "USDT";

type DepositWithdrawModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** When on rexmarkets, pre-select Kalshi, Polymarket, or Limitless based on current page */
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
  const [isSendingLimitlessUsdc, setIsSendingLimitlessUsdc] = useState(false);
  const [limitlessWithdrawError, setLimitlessWithdrawError] = useState<string | null>(null);
  const [isRefreshingBaseBalance, setIsRefreshingBaseBalance] = useState(false);
  const [myriadWithdrawAsset, setMyriadWithdrawAsset] =
    useState<MyriadWithdrawAsset>("USD1");
  const [myriadWithdrawError, setMyriadWithdrawError] = useState<string | null>(
    null,
  );
  const [isSendingMyriadStable, setIsSendingMyriadStable] = useState(false);
  const [isRefreshingMyriadBsc, setIsRefreshingMyriadBsc] = useState(false);
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
    usdcBalance: baseUsdcBalance,
    usdcBalanceFormatted: baseUsdcFormatted,
    ethBalanceFormatted: baseEthFormatted,
    isLoading: isBaseBalanceLoading,
    refetch: refetchBaseBalance,
  } = useBaseBalance(isOpen && platformTab === "limitless" ? eoaAddress : undefined);

  const {
    data: myriadBscBalances,
    isLoading: isMyriadBscBalancesLoading,
    refetch: refetchMyriadBscBalances,
  } = useMyriadBscBalances(
    eoaAddress,
    isOpen && (platformTab === "myriad" || platformTab === "predictfun"),
  );

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
      setLimitlessWithdrawError(null);
      setMyriadWithdrawError(null);
      setMyriadWithdrawAsset(defaultPlatform === "predictfun" ? "USDT" : "USD1");
      setKalshiWithdrawAsset("USDC");
      setLastWithdrawnAmount(null);
      setLastWithdrawnAsset(null);
    }
  }, [isOpen, defaultPlatform]);

  useEffect(() => {
    if (platformTab === "predictfun" && myriadWithdrawAsset === "USD1") {
      setMyriadWithdrawAsset("USDT");
    }
  }, [platformTab, myriadWithdrawAsset]);

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

  // Page scroll is locked by the modal shell (AcctModal) while the dialog is open.

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

  const handleRefreshLimitlessBalance = useCallback(async () => {
    if (isRefreshingBaseBalance || !refetchBaseBalance) return;
    setIsRefreshingBaseBalance(true);
    try {
      await refetchBaseBalance();
    } finally {
      setIsRefreshingBaseBalance(false);
    }
  }, [refetchBaseBalance, isRefreshingBaseBalance]);

  const handleRefreshMyriadBscBalance = useCallback(async () => {
    if (isRefreshingMyriadBsc) return;
    setIsRefreshingMyriadBsc(true);
    try {
      await refetchMyriadBscBalances();
    } finally {
      setIsRefreshingMyriadBsc(false);
    }
  }, [refetchMyriadBscBalances, isRefreshingMyriadBsc]);

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

  const handleLimitlessWithdraw = useCallback(async () => {
    const trimmedRecipient = recipient.trim();
    const usdcAmount = parseFloat(amount);

    if (!eoaAddress || !trimmedRecipient || !amount) {
      setLimitlessWithdrawError("Please enter recipient and amount.");
      return;
    }
    if (!isAddress(trimmedRecipient)) {
      setLimitlessWithdrawError("Invalid EVM address.");
      return;
    }
    if (isNaN(usdcAmount) || usdcAmount <= 0) {
      setLimitlessWithdrawError("Please enter a valid USDC amount.");
      return;
    }
    if (usdcAmount > baseUsdcBalance) {
      setLimitlessWithdrawError("Insufficient USDC balance on Base.");
      return;
    }

    setLimitlessWithdrawError(null);
    setIsSendingLimitlessUsdc(true);

    try {
      const wallet = wallets?.find(
        (w) => (w as { address?: string }).address?.toLowerCase() === eoaAddress?.toLowerCase()
      );
      if (!wallet) {
        throw new Error("Wallet not found. Please connect your wallet.");
      }
      const provider = typeof (wallet as { getEthereumProvider?: () => Promise<unknown> }).getEthereumProvider === "function"
        ? await (wallet as { getEthereumProvider: () => Promise<unknown> }).getEthereumProvider()
        : null;
      if (!provider) {
        throw new Error("Wallet provider not available. Please connect your wallet.");
      }

      // Ensure wallet is on Base before sending USDC (Limitless uses Base).
      // Per Privy React docs (https://docs.privy.io/wallets/using-wallets/ethereum/switch-chain),
      // use the wallet's switchChain method — do not use provider.request('wallet_switchEthereumChain')
      // as that is for React Native and can cause "handleSwitchEthereumChain" errors in React.
      const walletWithSwitch = wallet as { chainId?: string | number; switchChain?: (chainId: number) => Promise<void> };
      const currentChainId = walletWithSwitch.chainId;
      const isOnBase =
        currentChainId === base.id ||
        currentChainId === `eip155:${base.id}` ||
        currentChainId === String(base.id);
      if (!isOnBase) {
        if (typeof walletWithSwitch.switchChain !== "function") {
          throw new Error("Cannot switch chain. Please switch your wallet to Base (Chain ID 8453) manually and try again.");
        }
        await walletWithSwitch.switchChain(base.id);
      }

      const client = createWalletClient({
        account: eoaAddress as `0x${string}`,
        chain: base,
        transport: custom(provider as Parameters<typeof custom>[0]),
      });
      const amountWei = parseUnits(amount, USDC_BASE_DECIMALS);
      const hash = await client.writeContract({
        address: USDC_BASE_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: "transfer",
        args: [trimmedRecipient as `0x${string}`, amountWei],
      });

      setShowSuccess(true);
      setRecipient("");
      setAmount("");
      showSuccessNotification("Withdrawal successful", `${amount} USDC sent on Base.`);
      refetchBaseBalance?.();
      queryClient.invalidateQueries({ queryKey: ["baseBalance", eoaAddress] });
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Withdraw failed.";
      setLimitlessWithdrawError(message);
    } finally {
      setIsSendingLimitlessUsdc(false);
    }
  }, [recipient, amount, eoaAddress, baseUsdcBalance, wallets, refetchBaseBalance, queryClient]);

  const handleMyriadWithdraw = useCallback(async () => {
    const trimmedRecipient = recipient.trim();
    const sendAmount = parseFloat(amount);
    const usd1Avail = myriadBscBalances?.usd1 ?? 0;
    const maxSendBnbWei = BigInt(
      myriadBscBalances?.bnbMaxSendAfterReserveWei ?? "0",
    );

    if (!eoaAddress || !trimmedRecipient || !amount) {
      setMyriadWithdrawError("Please enter recipient and amount.");
      return;
    }
    if (!isAddress(trimmedRecipient)) {
      setMyriadWithdrawError("Invalid EVM address.");
      return;
    }
    if (isNaN(sendAmount) || sendAmount <= 0) {
      setMyriadWithdrawError("Please enter a valid amount.");
      return;
    }

    if (myriadWithdrawAsset === "USD1") {
      if (sendAmount > usd1Avail) {
        setMyriadWithdrawError("Insufficient USD1 balance on BNB Chain.");
        return;
      }
    } else if (myriadWithdrawAsset === "USDT") {
      const usdtAvail = myriadBscBalances?.usdt ?? 0;
      if (sendAmount > usdtAvail) {
        setMyriadWithdrawError("Insufficient USDT balance on BNB Chain.");
        return;
      }
    } else {
      let bnbValueWei: bigint;
      try {
        bnbValueWei = parseEther(amount.trim());
      } catch {
        setMyriadWithdrawError("Invalid BNB amount.");
        return;
      }
      if (bnbValueWei <= BigInt(0)) {
        setMyriadWithdrawError("Please enter a valid amount.");
        return;
      }
      if (bnbValueWei > maxSendBnbWei) {
        setMyriadWithdrawError(
          `Exceeds sendable BNB (wallet keeps ~${MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB} BNB for gas).`,
        );
        return;
      }
    }

    setMyriadWithdrawError(null);
    setIsSendingMyriadStable(true);

    try {
      const wallet = wallets?.find(
        (w) =>
          (w as { address?: string }).address?.toLowerCase() ===
          eoaAddress?.toLowerCase(),
      );
      if (!wallet) {
        throw new Error("Wallet not found. Please connect your wallet.");
      }
      const provider =
        typeof (wallet as { getEthereumProvider?: () => Promise<unknown> })
          .getEthereumProvider === "function"
          ? await (
              wallet as { getEthereumProvider: () => Promise<unknown> }
            ).getEthereumProvider()
          : null;
      if (!provider) {
        throw new Error(
          "Wallet provider not available. Please connect your wallet.",
        );
      }

      const walletWithSwitch = wallet as {
        chainId?: string | number;
        switchChain?: (chainId: number) => Promise<void>;
      };
      const currentChainId = walletWithSwitch.chainId;
      const isOnBsc =
        currentChainId === bsc.id ||
        currentChainId === `eip155:${bsc.id}` ||
        currentChainId === String(bsc.id);
      if (!isOnBsc) {
        if (typeof walletWithSwitch.switchChain !== "function") {
          throw new Error(
            "Cannot switch chain. Switch your wallet to BNB Smart Chain (56) and try again.",
          );
        }
        await walletWithSwitch.switchChain(bsc.id);
      }

      const client = createWalletClient({
        account: eoaAddress as `0x${string}`,
        chain: bsc,
        transport: custom(provider as Parameters<typeof custom>[0]),
      });

      if (myriadWithdrawAsset === "USD1") {
        const amountWei = parseUnits(amount, MYRIAD_BSC_STABLE_DECIMALS);
        await client.writeContract({
          address: MYRIAD_BSC_USD1,
          abi: erc20Abi,
          functionName: "transfer",
          args: [trimmedRecipient as `0x${string}`, amountWei],
        });
      } else if (myriadWithdrawAsset === "USDT") {
        const amountWei = parseUnits(amount, MYRIAD_BSC_STABLE_DECIMALS);
        await client.writeContract({
          address: MYRIAD_BSC_USDT as `0x${string}`,
          abi: erc20Abi,
          functionName: "transfer",
          args: [trimmedRecipient as `0x${string}`, amountWei],
        });
      } else {
        const valueWei = parseEther(amount);
        await client.sendTransaction({
          to: trimmedRecipient as `0x${string}`,
          value: valueWei,
        });
      }

      setShowSuccess(true);
      setRecipient("");
      setAmount("");
      showSuccessNotification(
        "Withdrawal successful",
        `${amount} ${myriadWithdrawAsset} sent on BNB Smart Chain.`,
      );
      void refetchMyriadBscBalances();
      void queryClient.invalidateQueries({ queryKey: ["myriad-bsc-balances"] });
      void queryClient.invalidateQueries({ queryKey: ["myriad-erc20-balance"] });
      void queryClient.invalidateQueries({ queryKey: ["predictfun-positions"] });
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Withdraw failed.";
      setMyriadWithdrawError(message);
    } finally {
      setIsSendingMyriadStable(false);
    }
  }, [
    recipient,
    amount,
    eoaAddress,
    myriadWithdrawAsset,
    myriadBscBalances?.bnbMaxSendAfterReserveWei,
    myriadBscBalances?.usd1,
    myriadBscBalances?.usdt,
    wallets,
    refetchMyriadBscBalances,
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

  const isPredictFunBsc = platformTab === "predictfun";
  const bscVenueName = isPredictFunBsc ? "Predict.fun" : "Myriad";

  if (!isOpen) return null;

  /* ---------- Kalshi ---------- */
  const kalshiDeposit = (
    <>
      <div className="acct-intro">
        <h3 className="rx-h3">Solana wallet · Kalshi</h3>
        <p>Send SOL or USDC to this address to fund your Kalshi trading account.</p>
      </div>
      {isSolanaAddressLoading ? (
        <DwLoading label="Loading your Solana address" />
      ) : !solanaAddress ? (
        <DwNote>
          Connect your Phantom or Privy wallet to see your Solana address.
        </DwNote>
      ) : (
        <>
          <DwAddressField
            label={`Solana (SVM) address${
              solanaSource
                ? ` · connected via ${solanaSource === "phantom" ? "Phantom" : "Privy"}`
                : ""
            }`}
            address={solanaAddress}
            copied={copiedAddress === "svm"}
            onCopy={() => handleCopyAddress(solanaAddress, "svm")}
            copyLabel="Copy Solana address"
          />
          <div className="rx-well dw-bal">
            <span className="rx-small">Wallet balance</span>
            <span className="dw-bal__v">
              {isKalshiUsdcBalanceLoading ||
              isSolanaBalanceLoading ||
              isRefreshingBalance ? (
                <span className="rx-skel" aria-label="Loading balance" />
              ) : (
                <span>
                  {kalshiUsdcBalanceData?.formatted ?? "0.00"} USDC{" "}
                  <small>({solanaBalanceData?.formatted ?? "0"} SOL)</small>
                </span>
              )}
              <DwRefreshButton
                onClick={handleRefreshKalshiBalance}
                disabled={
                  isRefreshingBalance ||
                  isSolanaBalanceLoading ||
                  isKalshiUsdcBalanceLoading
                }
                spinning={isRefreshingBalance}
              />
            </span>
          </div>
        </>
      )}
    </>
  );

  const kalshiWithdraw = (
    <>
      {kalshiWithdrawError && <DwError>{kalshiWithdrawError}</DwError>}
      <div className="rx-field">
        <span className="rx-label" id="dw-kalshi-asset">
          Withdraw as
        </span>
        <div
          className="rx-seg dw-assets"
          role="group"
          aria-labelledby="dw-kalshi-asset"
        >
          {(["USDC", "SOL"] as const).map((asset) => (
            <button
              key={asset}
              type="button"
              aria-pressed={kalshiWithdrawAsset === asset}
              className={clsx(
                "rx-seg__item",
                kalshiWithdrawAsset === asset && "is-active",
              )}
              onClick={() => {
                setKalshiWithdrawAsset(asset);
                setAmount("");
              }}
            >
              {asset}
            </button>
          ))}
        </div>
      </div>
      <DwAmountField
        available={
          kalshiWithdrawAsset === "USDC"
            ? `${kalshiUsdcBalanceData?.formatted ?? "0.00"} USDC`
            : `${solanaBalanceData?.formatted ?? "0"} SOL`
        }
        value={amount}
        onChange={(v) => setAmount(v)}
        placeholder={kalshiWithdrawAsset === "USDC" ? "0.00" : "0.0000"}
        disabled={isSendingSol || isSendingUsdc}
        onMax={() => {
          if (kalshiWithdrawAsset === "USDC") {
            setAmount(kalshiUsdcBalanceData?.formatted ?? "0");
          } else {
            setAmount(
              solanaBalanceData
                ? String(
                    Math.max(0, solanaBalanceData.sol - 0.0001).toFixed(4),
                  )
                : "0",
            );
          }
        }}
      />
      <DwRecipientField
        label="Send to (Solana address)"
        placeholder="Paste a Solana address"
        value={recipient}
        onChange={setRecipient}
        disabled={isSendingSol || isSendingUsdc}
      />
    </>
  );

  /* ---------- Limitless (Base) ---------- */
  const limitlessDeposit = (
    <>
      <div className="acct-intro">
        <h3 className="rx-h3">Base wallet · Limitless</h3>
        <p>
          Send USDC or ETH on Base to this address to fund your Limitless
          trading.
        </p>
      </div>
      {!eoaAddress ? (
        <DwNote>Connect your wallet to see your Base address.</DwNote>
      ) : (
        <>
          <DwAddressField
            label="Base (EVM) address"
            address={eoaAddress}
            copied={copiedAddress === "evm"}
            onCopy={() => handleCopyAddress(eoaAddress, "evm")}
            copyLabel="Copy Base address"
            icon="/images/brands/base.webp"
          />
          <div className="rx-well dw-bal">
            <span className="rx-small">Wallet balance (Base)</span>
            <span className="dw-bal__v">
              {isBaseBalanceLoading || isRefreshingBaseBalance ? (
                <span className="rx-skel" aria-label="Loading balance" />
              ) : (
                <span>
                  {baseUsdcFormatted} USDC <small>({baseEthFormatted} ETH)</small>
                </span>
              )}
              <DwRefreshButton
                onClick={handleRefreshLimitlessBalance}
                disabled={isRefreshingBaseBalance || isBaseBalanceLoading}
                spinning={isRefreshingBaseBalance}
              />
            </span>
          </div>
        </>
      )}
    </>
  );

  const limitlessWithdraw = (
    <>
      {limitlessWithdrawError && <DwError>{limitlessWithdrawError}</DwError>}
      {showSuccess && <DwSuccess />}
      <DwAmountField
        available={`${baseUsdcFormatted} USDC (Base)`}
        value={amount}
        onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
        placeholder="0.00"
        disabled={isSendingLimitlessUsdc}
        onMax={() => setAmount(baseUsdcFormatted)}
      />
      <DwRecipientField
        label="Send to (EVM address)"
        placeholder="0x…"
        value={recipient}
        onChange={setRecipient}
        disabled={isSendingLimitlessUsdc}
      />
    </>
  );

  /* ---------- Myriad / Predict.fun (BNB Smart Chain) ---------- */
  const bscDeposit = (
    <>
      <div className="acct-intro">
        <h3 className="rx-h3">BNB Smart Chain · {bscVenueName}</h3>
      </div>
      <div className="acct-alert" role="note">
        <CircleAlert className="size-4" aria-hidden />
        <p>
          {isPredictFunBsc ? (
            <>
              Only send <b>USDT</b> (BEP-20) on <b>BNB Smart Chain</b> to this
              address to trade on Predict.fun.
            </>
          ) : (
            <>
              Only send <b>USD1</b> or <b>USDT</b> (BEP-20) on{" "}
              <b>BNB Smart Chain</b> to this address to trade on Myriad.
            </>
          )}
        </p>
      </div>
      {!eoaAddress ? (
        <DwNote>Connect your wallet to see your BNB Chain address.</DwNote>
      ) : (
        <>
          <DwAddressField
            label="BNB Chain (EVM) address"
            address={eoaAddress}
            copied={copiedAddress === "evm"}
            onCopy={() => handleCopyAddress(eoaAddress, "evm")}
            copyLabel="Copy address"
          />
          <div className="rx-well dw-bal dw-bal--stack">
            <div className="dw-bal__row">
              <span className="rx-small">Wallet balance (BNB Chain)</span>
              <DwRefreshButton
                onClick={() => void handleRefreshMyriadBscBalance()}
                disabled={isRefreshingMyriadBsc || isMyriadBscBalancesLoading}
                spinning={isRefreshingMyriadBsc}
              />
            </div>
            {isMyriadBscBalancesLoading || isRefreshingMyriadBsc ? (
              <span className="rx-skel" aria-label="Loading balance" />
            ) : (
              <>
                {isPredictFunBsc ? (
                  <>
                    <span className="dw-bal__big">
                      {myriadBscBalances?.usdtFormatted ?? "0"} USDT
                    </span>
                    <span className="dw-bal__sub">
                      {myriadBscBalances?.bnbFormatted ?? "0"} BNB (gas)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="dw-bal__big">
                      {formatCurrency(myriadBscBalances?.totalUsdApprox ?? 0)}
                    </span>
                    <span className="dw-bal__sub">
                      {myriadBscBalances?.bnbFormatted ?? "0"} BNB ·{" "}
                      {myriadBscBalances?.usd1Formatted ?? "0"} USD1 ·{" "}
                      {myriadBscBalances?.usdtFormatted ?? "0"} USDT
                    </span>
                    {(myriadBscBalances?.usdc ?? 0) > 0 && (
                      <span className="rx-help">
                        USDC included in total above
                      </span>
                    )}
                  </>
                )}
                <p className="dw-bal__note">
                  Keep native BNB on this chain for gas (trades, transfers). As
                  a rule of thumb, leave at least{" "}
                  <span className="rx-num text-rx-text-2">
                    {MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB} BNB
                  </span>{" "}
                  or more if you trade often.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </>
  );

  const bscAssets: MyriadWithdrawAsset[] = isPredictFunBsc
    ? ["BNB", "USDT"]
    : ["BNB", "USD1", "USDT"];
  const bscAvailable =
    myriadWithdrawAsset === "USD1"
      ? `${myriadBscBalances?.usd1Formatted ?? "0"} USD1`
      : myriadWithdrawAsset === "USDT"
        ? `${myriadBscBalances?.usdtFormatted ?? "0"} USDT`
        : `${myriadBscBalances?.bnbMaxSendAfterReserveFormatted ?? "0"} BNB`;
  const bscBalanceHelp = [
    !isPredictFunBsc
      ? `Total balance (est.) ${formatCurrency(myriadBscBalances?.totalUsdApprox ?? 0)}`
      : null,
    myriadWithdrawAsset === "BNB"
      ? `Wallet ${myriadBscBalances?.bnbFormatted ?? "0"} BNB`
      : null,
    "BNB Chain",
  ]
    .filter(Boolean)
    .join(" · ");

  const bscWithdraw = (
    <>
      {myriadWithdrawError && <DwError>{myriadWithdrawError}</DwError>}
      {showSuccess && <DwSuccess />}
      <div className="rx-field">
        <span className="rx-label" id="dw-bsc-asset">
          Withdraw asset
        </span>
        <div
          className="rx-seg dw-assets"
          role="group"
          aria-labelledby="dw-bsc-asset"
        >
          {bscAssets.map((asset) => (
            <button
              key={asset}
              type="button"
              aria-pressed={myriadWithdrawAsset === asset}
              className={clsx(
                "rx-seg__item",
                myriadWithdrawAsset === asset && "is-active",
              )}
              onClick={() => {
                setMyriadWithdrawAsset(asset);
                setAmount("");
              }}
            >
              {asset}
            </button>
          ))}
        </div>
        <span className="rx-help">
          {isPredictFunBsc
            ? "Native BNB or BEP-20 USDT on BNB Smart Chain. Switch network if prompted."
            : "Native BNB or BEP-20 USD1 / USDT on BNB Smart Chain. Switch network if prompted."}
        </span>
      </div>
      {myriadWithdrawAsset === "BNB" ? (
        <div className="acct-alert" role="note">
          <CircleAlert className="size-4" aria-hidden />
          <p>
            <b>BNB gas reserve: </b>
            Max withdraw leaves about{" "}
            <b>{MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB} BNB</b> in your wallet so
            you can still pay network fees on BNB Smart Chain. The <b>Max</b>{" "}
            button only fills the amount above that reserve.
          </p>
        </div>
      ) : (
        <p className="rx-help m-0">
          Sending {isPredictFunBsc ? "USDT" : "USD1 or USDT"} still uses a small
          amount of BNB for gas. Keep native BNB in this wallet (e.g. at least
          ~{MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB} BNB).
        </p>
      )}
      <DwAmountField
        available={bscAvailable}
        help={bscBalanceHelp}
        value={amount}
        onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
        placeholder={myriadWithdrawAsset === "BNB" ? "0.0000" : "0.00"}
        disabled={isSendingMyriadStable}
        onMax={() => {
          if (myriadWithdrawAsset === "USD1") {
            setAmount(myriadBscBalances?.usd1Formatted ?? "0");
          } else if (myriadWithdrawAsset === "USDT") {
            setAmount(myriadBscBalances?.usdtFormatted ?? "0");
          } else {
            setAmount(myriadBscBalances?.bnbMaxSendAfterReserveFormatted ?? "0");
          }
        }}
      />
      <DwRecipientField
        label="Send to (EVM address)"
        placeholder="0x…"
        value={recipient}
        onChange={setRecipient}
        disabled={isSendingMyriadStable}
      />
    </>
  );

  /* ---------- Polymarket ---------- */
  const polymarketDeposit = !safeAddr ? (
    isWalletsLoading ? (
      <DwLoading label="Setting up your wallet" />
    ) : (
      <DwNote>
        Please connect your wallet to view deposit addresses. If you just
        logged in, your wallet may still be initializing.
      </DwNote>
    )
  ) : (
    <>
      <div className="acct-intro">
        <h3 className="rx-h3">Deposit addresses · Polymarket</h3>
        <p>
          Send assets to these addresses to bridge and swap to USDC.e on Polygon
          for trading.
        </p>
      </div>
      {isLoadingDepositAddresses ? (
        <DwLoading label="Loading deposit addresses" />
      ) : depositAddressesError ? (
        <DwError>Failed to load deposit addresses. Please try again later.</DwError>
      ) : depositAddressesData?.address ? (
        <>
          <DwAddressField
            label="Polygon (USDC.e)"
            address={depositAddressesData.address.evm}
            copied={copiedAddress === "evm"}
            onCopy={() =>
              handleCopyAddress(depositAddressesData.address.evm, "evm")
            }
            copyLabel="Copy Polygon address"
          />
          <DwAddressField
            label="Solana (SVM)"
            address={depositAddressesData.address.svm}
            copied={copiedAddress === "svm"}
            onCopy={() =>
              handleCopyAddress(depositAddressesData.address.svm, "svm")
            }
            copyLabel="Copy Solana address"
          />
          <DwAddressField
            label="Bitcoin"
            address={depositAddressesData.address.btc}
            copied={copiedAddress === "btc"}
            onCopy={() =>
              handleCopyAddress(depositAddressesData.address.btc, "btc")
            }
            copyLabel="Copy Bitcoin address"
          />
          {depositAddressesData.note && (
            <p className="rx-help m-0">{depositAddressesData.note}</p>
          )}
        </>
      ) : (
        <DwNote>No deposit addresses available.</DwNote>
      )}
    </>
  );

  const showInitTrading =
    !relayClient && !!eoaAddress && !!initializeTradingSession;
  const showGeoblock =
    showInitTrading && isGeoblocked && !isInitializing && currentStep === "idle";

  const polymarketWithdraw = (
    <>
      {showSuccess && <DwSuccess />}
      {error && showError && <DwError>{getErrorMessage()}</DwError>}
      {addressError && showError && <DwError>{addressError}</DwError>}
      <div className="rx-well dw-bal">
        <span className="rx-small">Available balance</span>
        <span className="dw-bal__v">
          <span>${formattedUsdcBalance} USDC.e</span>
        </span>
      </div>
      <DwAmountField
        label="Amount (USDC.e)"
        available={`$${formattedUsdcBalance}`}
        value={amount}
        onChange={(v) => setAmount(v)}
        placeholder="0.00"
        disabled={isTransferring}
        onMax={handleSendMax}
      />
      <DwRecipientField
        label="Send to (Polygon address)"
        placeholder="0x…"
        value={recipient}
        onChange={setRecipient}
        disabled={isTransferring}
      />
      {showGeoblock && (
        <div className="rx-raised acct-blocked" role="note">
          <span className="acct-blocked__ico" aria-hidden="true">
            <Compass className="size-6" />
          </span>
          <span className="rx-eyebrow">Region restricted</span>
          <b>Trading isn&apos;t available in your region</b>
          <p>
            {geoblockStatus?.country || geoblockStatus?.region
              ? `Trading is not available in your region (${geoblockStatus.country}${geoblockStatus.region ? `, ${geoblockStatus.region}` : ""}). Polymarket is geoblocked in your location.`
              : "Trading is not available in your region. Polymarket is geoblocked in your location."}
          </p>
        </div>
      )}
      {showInitTrading && sessionError && (
        <DwError>
          {sessionError.message || "Failed to initialize trading session"}
        </DwError>
      )}
    </>
  );

  /* ---------- footer: the step's main action ---------- */
  const sendingLabel = (
    <>
      <span className="rx-spin" aria-hidden="true" />
      Sending…
    </>
  );

  let foot: ReactNode;
  if (activeTab === "deposit") {
    foot = (
      <button
        type="button"
        className="rx-btn rx-btn--secondary rx-btn--block"
        onClick={onClose}
      >
        Done
      </button>
    );
  } else if (platformTab === "kalshi") {
    const busy = isSendingSol || isSendingUsdc;
    foot = (
      <>
        <button
          type="button"
          className="rx-btn rx-btn--primary rx-btn--block"
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
          aria-busy={busy || undefined}
        >
          {busy
            ? sendingLabel
            : kalshiWithdrawAsset === "USDC"
              ? "Send USDC"
              : "Send SOL"}
        </button>
        {!solanaAddress && (
          <p className="rx-help m-0">
            Connect your Phantom or Privy Solana wallet to withdraw.
          </p>
        )}
      </>
    );
  } else if (platformTab === "limitless") {
    foot = (
      <>
        <button
          type="button"
          className="rx-btn rx-btn--primary rx-btn--block"
          onClick={handleLimitlessWithdraw}
          disabled={
            isSendingLimitlessUsdc ||
            !recipient.trim() ||
            !amount ||
            !eoaAddress ||
            baseUsdcBalance <= 0
          }
          aria-busy={isSendingLimitlessUsdc || undefined}
        >
          {isSendingLimitlessUsdc ? sendingLabel : "Send USDC (Base)"}
        </button>
        {!eoaAddress && (
          <p className="rx-help m-0">Connect your wallet to withdraw.</p>
        )}
      </>
    );
  } else if (platformTab === "myriad" || platformTab === "predictfun") {
    foot = (
      <>
        <button
          type="button"
          className="rx-btn rx-btn--primary rx-btn--block"
          onClick={() => void handleMyriadWithdraw()}
          disabled={
            isSendingMyriadStable ||
            !recipient.trim() ||
            !amount ||
            !eoaAddress ||
            (myriadWithdrawAsset === "USD1"
              ? (myriadBscBalances?.usd1 ?? 0) <= 0
              : myriadWithdrawAsset === "USDT"
                ? (myriadBscBalances?.usdt ?? 0) <= 0
                : BigInt(myriadBscBalances?.bnbMaxSendAfterReserveWei ?? "0") ===
                  BigInt(0))
          }
          aria-busy={isSendingMyriadStable || undefined}
        >
          {isSendingMyriadStable
            ? sendingLabel
            : myriadWithdrawAsset === "BNB"
              ? "Send BNB"
              : myriadWithdrawAsset === "USD1"
                ? "Send USD1"
                : "Send USDT"}
        </button>
        {!eoaAddress && (
          <p className="rx-help m-0">Connect your wallet to withdraw.</p>
        )}
      </>
    );
  } else {
    const initBusy = isInitializing || currentStep !== "idle";
    foot = (
      <>
        <button
          type="button"
          className="rx-btn rx-btn--primary rx-btn--block"
          onClick={handleTransfer}
          disabled={
            isTransferring || !recipient || !amount || !relayClient || !safeAddr
          }
          aria-busy={isTransferring || undefined}
        >
          {isTransferring ? sendingLabel : "Send USDC.e"}
        </button>
        {showInitTrading && !showGeoblock && (
          <button
            type="button"
            className="rx-btn rx-btn--secondary rx-btn--block"
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
            ) : isGeoblocked ? (
              "Trading not available in your region"
            ) : (
              "Initialize trading"
            )}
          </button>
        )}
        {!relayClient && !eoaAddress && (
          <p className="rx-help m-0">Please connect your wallet first</p>
        )}
        {!relayClient && eoaAddress && !initializeTradingSession && (
          <p className="rx-help m-0">Start a trading session first</p>
        )}
      </>
    );
  }

  const body =
    platformTab === "kalshi"
      ? activeTab === "deposit"
        ? kalshiDeposit
        : kalshiWithdraw
      : platformTab === "limitless"
        ? activeTab === "deposit"
          ? limitlessDeposit
          : limitlessWithdraw
        : platformTab === "myriad" || platformTab === "predictfun"
          ? activeTab === "deposit"
            ? bscDeposit
            : bscWithdraw
          : activeTab === "deposit"
            ? polymarketDeposit
            : polymarketWithdraw;

  return (
    <AcctModal labelledBy="dw-title" variant="plain" modalRef={modalRef}>
      <AcctModalHead
        id="dw-title"
        title="Deposit and withdraw"
        description="Fund your prediction market accounts"
        onClose={onClose}
        closeLabel="Close deposit and withdraw"
      />

      <div className="acct-modal__body">
        {/* venue: five equal columns, logo over the name */}
        <div className="rx-seg dw-kinds" role="tablist" aria-label="Account">
          {DW_VENUES.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={platformTab === v.key}
              className={clsx(
                "rx-seg__item",
                platformTab === v.key && "is-active",
              )}
              onClick={() => {
                setPlatformTab(v.key);
                if (v.key === "predictfun") setMyriadWithdrawAsset("USDT");
              }}
            >
              <Image
                className="dw-ico"
                src={v.icon}
                alt=""
                width={18}
                height={18}
              />
              {v.short ? (
                <>
                  <span className="sm:hidden">{v.short}</span>
                  <span className="max-sm:hidden">{v.label}</span>
                </>
              ) : (
                v.label
              )}
            </button>
          ))}
        </div>

        <div className="rx-seg dw-modes" role="group" aria-label="Deposit or withdraw">
          {(
            [
              ["deposit", "Deposit"],
              ["withdraw", "Withdraw"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={activeTab === key}
              className={clsx("rx-seg__item", activeTab === key && "is-active")}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {body}
      </div>

      <div className="acct-modal__foot acct-modal__foot--stack">{foot}</div>
    </AcctModal>
  );
}

/* ---------------- presentation helpers (props only) ---------------- */

const DW_VENUES: {
  key: PlatformTab;
  label: string;
  short?: string;
  icon: string;
}[] = [
  { key: "kalshi", label: "Kalshi", icon: "/images/brands/kalshi.webp" },
  { key: "polymarket", label: "Polymarket", icon: "/images/brands/polymarket.webp" },
  { key: "limitless", label: "Limitless", icon: "/images/brands/limitless.webp" },
  { key: "myriad", label: "Myriad", icon: "/images/brands/myriad.webp" },
  {
    key: "predictfun",
    label: "Predict.fun",
    short: "Predict",
    icon: "/images/brands/predictfun.webp",
  },
];

/** Read-only deposit address: label, the full address (wraps), and Copy. */
function DwAddressField({
  label,
  address,
  copied,
  onCopy,
  copyLabel,
  icon,
}: {
  label: string;
  address: string;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  icon?: string;
}) {
  return (
    <div className="rx-field">
      <span className="rx-label">{label}</span>
      <div className="dw-addr">
        {icon ? (
          <Image className="dw-ico" src={icon} alt="" width={18} height={18} />
        ) : null}
        <span className="dw-addr__v">{address}</span>
        <button
          type="button"
          className={clsx("rx-btn rx-btn--secondary rx-btn--s", copied && "is-done")}
          onClick={onCopy}
          title={copyLabel}
          aria-label={copied ? "Copied" : copyLabel}
        >
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden="true" />
              Copied
            </>
          ) : (
            "Copy"
          )}
        </button>
      </div>
    </div>
  );
}

/** Amount input with the available balance and Max. */
function DwAmountField({
  label = "Amount",
  available,
  help,
  value,
  onChange,
  placeholder,
  disabled,
  onMax,
}: {
  label?: string;
  available: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  onMax: () => void;
}) {
  return (
    <div className="rx-field">
      <div className="dw-field-head">
        <label className="rx-label" htmlFor="dw-amount">
          {label}
        </label>
        <span className="rx-help">
          Available <span className="rx-num">{available}</span>
        </span>
      </div>
      <div className="rx-input">
        <input
          id="dw-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <div className="rx-pct">
          <button type="button" onClick={onMax}>
            Max
          </button>
        </div>
      </div>
      {help ? <span className="rx-help">{help}</span> : null}
    </div>
  );
}

function DwRecipientField({
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rx-field">
      <label className="rx-label" htmlFor="dw-recipient">
        {label}
      </label>
      <div className="rx-input">
        <input
          id="dw-recipient"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      <span className="rx-help">
        Double-check the address. Withdrawals can&apos;t be reversed.
      </span>
    </div>
  );
}

function DwRefreshButton({
  onClick,
  disabled,
  spinning,
}: {
  onClick: () => void;
  disabled: boolean;
  spinning: boolean;
}) {
  return (
    <button
      type="button"
      className="acct-copy"
      onClick={onClick}
      disabled={disabled}
      title="Refresh balance"
      aria-label="Refresh balance"
    >
      <RefreshCw
        className={clsx("size-[13px]", spinning && "is-spinning")}
        aria-hidden="true"
      />
    </button>
  );
}

function DwLoading({ label }: { label: string }) {
  return (
    <div className="dw-loading" role="status">
      <span className="rx-spin" aria-hidden="true" />
      {label}…
    </div>
  );
}

function DwNote({ children }: { children: ReactNode }) {
  return (
    <div className="acct-alert acct-alert--muted">
      <Wallet className="size-4" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function DwError({ children }: { children: ReactNode }) {
  return (
    <div className="acct-alert acct-alert--down" role="alert">
      <CircleAlert className="size-4" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function DwSuccess() {
  return (
    <div className="acct-alert acct-alert--up" role="status">
      <Check className="size-4" aria-hidden="true" />
      <p>
        <b>Transfer successful!</b>
      </p>
    </div>
  );
}
