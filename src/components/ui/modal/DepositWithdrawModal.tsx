"use client";

import { useState, useEffect, useRef, useContext } from "react";
import { Copy, Check, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import copy from "copy-to-clipboard";
import { useWallet } from "@/contexts/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import { usePolymarketDepositAddresses } from "@/hooks/usePolymarketDepositAddresses";
import { TradingContext } from "@/providers/TradingProvder";
import useUsdcTransfer from "@/hooks/useUsdcTransfer";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import { USDC_E_DECIMALS } from "@/constants/tokens";
import { parseUnits, isAddress } from "viem";
import { useWallets, usePrivy } from "@privy-io/react-auth";

type DepositWithdrawModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const truncateAddress = (address: string) => {
  if (!address || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function DepositWithdrawModal({
  isOpen,
  onClose,
}: DepositWithdrawModalProps) {
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get wallet addresses
  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  
  // Check Privy wallet status
  const { wallets, ready: walletsReady } = useWallets();
  const { ready: privyReady } = usePrivy();
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

  // Deposit addresses
  const {
    data: depositAddressesData,
    isLoading: isLoadingDepositAddresses,
    error: depositAddressesError,
  } = usePolymarketDepositAddresses({
    walletAddress: safeAddr || null,
    enabled: isOpen && activeTab === "deposit" && !!safeAddr,
  });

  // Withdraw functionality
  const { isTransferring, error, transferUsdc } = useUsdcTransfer();
  const { formattedUsdcBalance, rawUsdcBalance } = usePolygonBalances(safeAddr);

  useEffect(() => {
    if (isOpen) {
      setRecipient("");
      setAmount("");
      setShowSuccess(false);
      setCopiedAddress(null);
      setAddressError(null);
    }
  }, [isOpen]);

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

  const handleCopyAddress = (
    address: string,
    type: "evm" | "svm" | "btc"
  ) => {
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
      setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Transfer failed:", err);
    }
  };

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
          className="w-[500px] max-w-[90%] bg-[#0D0D0D] rounded-xl shadow-2xl border border-white/10 pointer-events-auto max-h-[80vh] overflow-y-auto custom-sidebar-scrollbar"
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

          {/* Tabs */}
          <div className="flex space-x-1 mx-4 mt-4 bg-[#141414] p-1 rounded-lg">
            <button
              onClick={() => setActiveTab("deposit")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === "deposit"
                  ? "bg-[#ffc000] text-black"
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
                  ? "bg-[#ffc000] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Withdraw
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {activeTab === "deposit" ? (
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
                        Please connect your wallet to view deposit addresses. If you just logged in, your wallet may still be initializing.
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
                          {/* EVM Address */}
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 text-xs">
                                EVM (Ethereum/Polygon):
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    depositAddressesData.address.evm,
                                    "evm"
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title="Copy EVM address"
                              >
                                {copiedAddress === "evm" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            </div>
                            <div className="bg-black/30 rounded px-2 py-1.5 text-white text-xs font-mono break-all">
                              {depositAddressesData.address.evm}
                            </div>
                          </div>

                          {/* Solana Address */}
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 text-xs">
                                Solana (SVM):
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    depositAddressesData.address.svm,
                                    "svm"
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title="Copy Solana address"
                              >
                                {copiedAddress === "svm" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            </div>
                            <div className="bg-black/30 rounded px-2 py-1.5 text-white text-xs font-mono break-all">
                              {depositAddressesData.address.svm}
                            </div>
                          </div>

                          {/* Bitcoin Address */}
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 text-xs">
                                Bitcoin:
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    depositAddressesData.address.btc,
                                    "btc"
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title="Copy Bitcoin address"
                              >
                                {copiedAddress === "btc" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            </div>
                            <div className="bg-black/30 rounded px-2 py-1.5 text-white text-xs font-mono break-all">
                              {depositAddressesData.address.btc}
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
                    {isGeoblocked && !isInitializing && currentStep === "idle" && (
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
