"use client";

import { useEffect, useRef, useState, useContext } from "react";
import { ReferralShare } from "@/components/leaderboard/ReferralInput";
import copy from "copy-to-clipboard";
import { Copy, Check } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { usePolymarketDepositAddresses } from "@/hooks/usePolymarketDepositAddresses";
import useSafeDeployment from "@/hooks/useSafeDeployment";

type User = {
  id: string; // cuid
  username: string;
  email: string | null;
  privyId: string;
  points: number;
  solanaWallet?: string | null;
  ethereumWallet?: string | null;
  referralCode?: string;
  createdAt: string;
  updatedAt: string;
};

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  isLoadingUser: boolean;
  isLoggingOut: boolean;
  onLogout: () => void;
}

const getInitials = (username: string) => {
  const lettersOnly = username.replace(/[0-9]/g, "");
  if (lettersOnly.length < 2) return lettersOnly.toUpperCase();
  return (lettersOnly[0] + lettersOnly[lettersOnly.length - 1]).toUpperCase();
};

const truncateAddress = (address: string) => {
  if (!address || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function AccountModal({
  isOpen,
  onClose,
  currentUser,
  isLoadingUser,
  isLoggingOut,
  onLogout,
}: AccountModalProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "referral">("profile");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  // Use only safeAddress for deposit addresses
  const safeAddress = derivedSafeAddressFromEoa;

  const {
    data: depositAddressesData,
    isLoading: isLoadingDepositAddresses,
    error: depositAddressesError,
  } = usePolymarketDepositAddresses({
    walletAddress: safeAddress || null,
    enabled: isOpen && !!safeAddress,
  });

  const handleCopyAddress = (
    address: string,
    type: "solana" | "ethereum" | "evm" | "svm" | "btc"
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

  useEffect(() => {
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

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          ref={modalRef}
          className="w-[500px] max-w-[90%] bg-[#0D0D0D] rounded-xl shadow-2xl border border-white/10 pointer-events-auto max-h-[80vh] overflow-y-auto custom-sidebar-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-xl font-bold text-white">
              Account & Referrals
            </h2>
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
              onClick={() => setActiveTab("profile")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === "profile"
                  ? "bg-[#ffc000] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab("referral")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === "referral"
                  ? "bg-[#ffc000] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Referrals
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {isLoadingUser ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc000]"></div>
              </div>
            ) : currentUser ? (
              <>
                {/* Profile Tab */}
                {activeTab === "profile" && (
                  <div className="space-y-6">
                    {/* User Info */}
                    <div className="flex flex-col items-center mb-6">
                      <div className="w-20 h-20 rounded-full bg-[#ffc000] text-black flex items-center justify-center text-2xl font-bold mb-4">
                        {getInitials(currentUser.username)}
                      </div>
                      <h3 className="font-bold text-white text-2xl">
                        {currentUser.username}
                      </h3>
                      <p className="text-white text-lg mt-2">
                        <span className="text-[#00B050] text-xl font-bold">
                          {currentUser.points.toLocaleString()}
                        </span>{" "}
                        points
                      </p>
                    </div>

                    {/* Account Details */}
                    <div className="bg-white/5 rounded-lg p-4">
                      <h4 className="text-white font-semibold mb-3">
                        Account Information
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Username:</span>
                          <span className="text-white">
                            {currentUser.username}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-gray-400">Solana Wallet:</span>
                          <div className="flex items-center gap-2 max-w-[220px]">
                            <span className="text-white text-right">
                              {currentUser.solanaWallet
                                ? truncateAddress(currentUser.solanaWallet)
                                : "Not connected"}
                            </span>
                            {currentUser.solanaWallet && (
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    currentUser.solanaWallet!,
                                    "solana"
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title="Copy address"
                                aria-label="Copy Solana wallet address"
                              >
                                {copiedAddress === "solana" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-gray-400">BNB Wallet:</span>
                          <div className="flex items-center gap-2 max-w-[220px]">
                            <span className="text-white text-right">
                              {currentUser.ethereumWallet
                                ? truncateAddress(currentUser.ethereumWallet)
                                : "Not connected"}
                            </span>
                            {currentUser.ethereumWallet && (
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    currentUser.ethereumWallet!,
                                    "ethereum"
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title="Copy address"
                                aria-label="Copy Ethereum wallet address"
                              >
                                {copiedAddress === "ethereum" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Email:</span>
                          <span className="text-white">
                            {currentUser.email || "Not provided"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Member Since:</span>
                          <span className="text-white">
                            {new Date(
                              currentUser.createdAt
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Deposit Addresses Section */}
                    {derivedSafeAddressFromEoa && (
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
                    )}
                  </div>
                )}

                {/* Referral Tab */}
                {activeTab === "referral" && (
                  <div className="space-y-4">
                    <ReferralShare
                      userId={currentUser.id}
                      referralCode={currentUser.referralCode || ""}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">User data not available</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700">
            <button
              onClick={onLogout}
              disabled={isLoggingOut}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition ${
                isLoggingOut
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-[#ffc000] text-black hover:bg-[#ffc000]/80 font-semibold"
              }`}
            >
              {isLoggingOut ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                  <span>Logging out...</span>
                </>
              ) : (
                <>
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
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3v1"
                    />
                  </svg>
                  <span>Sign Out</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
