/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import ChatSidebar from "../rexchat/ChatSidebar";
import { RexChat } from "../rexchat";
import { useReports } from "@/hooks/useReports";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { ReferralShare } from "@/components/leaderboard/ReferralInput";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { StorageManager } from "@/lib/storage/storage-util";

/* Technical Indicators + Analysis */
import TechnicalIndicators from "@/components/rexscreener/technicalindicators/TechnicalIndicators";
import { useTechnicalAnalysis } from "@/hooks/useTechnicalAnalysis";

type User = {
  id: string; // cuid
  username: string;
  email: string | null;
  privyId: string;
  points: number;
  referralCode?: string;
  createdAt: string;
  updatedAt: string;
};

interface Props {
  generatedReport?: { id: string } | null;
  // Technical indicator inputs (from Dexscreener view)
  selectedToken?: TrendingToken | null;
  tokenAddress?: string | null;
  isViewingChart?: boolean;
  onTokenSelect?: (token: TrendingToken | null) => void;
}

function CollapsiblePanel({
  title,
  open,
  onToggle,
  onRefresh,
  refreshDisabled,
  loading, // NEW
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  loading?: boolean; // NEW
  children: React.ReactNode;
}) {
  return (
    <div className="relative bg-black/20 rounded-lg border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 text-left text-white font-semibold"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="w-5 h-5 text-white/80" />
          ) : (
            <ChevronRight className="w-5 h-5 text-white/80" />
          )}
          <span className="text-lg">{title}</span>
        </button>

        <div className="flex items-center gap-3">
          {loading && <span className="text-[#00B050]">Regenerating…</span>}
          {onRefresh && (
            <button
              type="button"
              onClick={() => {
                onRefresh();
              }}
              disabled={!!refreshDisabled}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm transition ${
                refreshDisabled
                  ? "bg-[#ffc000]/10 text-white/40 cursor-not-allowed"
                  : "bg-[#ffc000]/20 hover:bg-[#ffc000]/30 text-white"
              }`}
              title={refreshDisabled ? "Please wait…" : "Refresh analysis"}
            >
              <RotateCcw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {open && <div className="px-4 pb-4 pt-4">{children}</div>}
    </div>
  );
}

export function GenerateRexscreenerReport({
  generatedReport,
  selectedToken = null,
  tokenAddress = null,
  isViewingChart = false,
}: Props) {
  const { authenticated, ready, user: privyUser, login, logout } = usePrivy();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "referral">("profile");
  const [macdOpen, setMacdOpen] = useState(true);
  const [rsiOpen, setRsiOpen] = useState(true);
  const [cupOpen, setCupOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(true);

  const router = useRouter();

  const sanitizeAnalysis = (text?: string) => (text ?? "").replace(/[#*]/g, "");

  // Hook is now the **only** place that fetches & stores analysis
  const {
    generateMACD,
    generateRSI,
    generateCupHandle,
    generateAllIndicators,
    isGeneratingMACD,
    isGeneratingRSI,
    isGeneratingCupHandle,
    isGeneratingAll,
    macdAnalysis,
    rsiAnalysis,
    cupHandleAnalysis,
    allAnalysis,
    clearAllStates,
    clearCache,
  } = useTechnicalAnalysis({
    userId: currentUser?.id || "",
  });

  const hasAnyAnalysis = !!(
    macdAnalysis ||
    rsiAnalysis ||
    cupHandleAnalysis ||
    allAnalysis
  );
  const isGeneratingAny =
    isGeneratingMACD ||
    isGeneratingRSI ||
    isGeneratingCupHandle ||
    isGeneratingAll;

  // Initialize from localStorage, then sync with props
  const [currentSelectedToken, setCurrentSelectedToken] =
    useState<TrendingToken | null>(() => {
      const navState = StorageManager.getNavigationState();
      return selectedToken ?? navState.selectedTokenData ?? null;
    });
  const [currentTokenAddress, setCurrentTokenAddress] = useState<string | null>(
    () => {
      const navState = StorageManager.getNavigationState();
      return tokenAddress ?? navState.currentTokenAddress ?? null;
    }
  );
  const [currentIsViewingChart, setCurrentIsViewingChart] = useState<boolean>(
    () => {
      const navState = StorageManager.getNavigationState();
      return isViewingChart ?? navState.currentIsViewingChart ?? false;
    }
  );

  // Sync with props and update localStorage
  useEffect(() => {
    const newToken = selectedToken ?? currentSelectedToken;
    const newAddress = tokenAddress ?? currentTokenAddress;
    const newIsViewing = isViewingChart ?? currentIsViewingChart;

    setCurrentSelectedToken(newToken);
    setCurrentTokenAddress(newAddress);
    setCurrentIsViewingChart(newIsViewing);

    // Update localStorage
    StorageManager.saveNavigationState({
      selectedTokenData: newToken,
      currentTokenAddress: newAddress,
      currentIsViewingChart: newIsViewing,
      hasReportOpen: !!selectedReportId,
      lastReportId: selectedReportId,
    });
  }, [
    selectedToken,
    tokenAddress,
    isViewingChart,
    currentSelectedToken,
    currentTokenAddress,
    currentIsViewingChart,
    selectedReportId,
  ]);

  const modalRef = useRef<HTMLDivElement>(null);
  const userId = currentUser?.id || null;
  const prevViewingRef = useRef<boolean>(isViewingChart);

  useEffect(() => {
    // Detect transition from viewing → not viewing
    if (prevViewingRef.current === true && isViewingChart === false) {
      clearAllStates(); // wipe MACD/RSI/CupHandle/All + errors + loading
    }
    prevViewingRef.current = isViewingChart;
  }, [isViewingChart, clearAllStates]);

  useEffect(() => {
    if (generatedReport?.id) {
      setSelectedReportId(generatedReport.id);
      setShowHistory(false);
    }
  }, [generatedReport?.id]);

  const fetchUser = useCallback(async () => {
    if (!authenticated || !privyUser?.id) {
      setCurrentUser(null);
      return;
    }
    setIsLoadingUser(true);
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privyId: privyUser.id }),
        cache: "no-store", // ensure we don't serve a cached response
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user as User);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setIsLoadingUser(false);
    }
  }, [authenticated, privyUser?.id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (showAccountModal) {
      fetchUser();
    }
  }, [showAccountModal, fetchUser]);

  const { data: serverReports = [] } = useReports(userId || undefined);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowAccountModal(false);
      }
    };
    if (showAccountModal) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [showAccountModal]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showAccountModal) setShowAccountModal(false);
    };
    if (showAccountModal) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [showAccountModal]);

  const handleSignIn = async () => {
    if (!ready) return;
    await login();
  };
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      setCurrentUser(null);
      setShowAccountModal(false);
      setSelectedReportId(null);
      clearAllStates();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getInitials = (username: string) => {
    const lettersOnly = username.replace(/[0-9]/g, "");
    if (lettersOnly.length < 2) return lettersOnly.toUpperCase();
    return (lettersOnly[0] + lettersOnly[lettersOnly.length - 1]).toUpperCase();
  };

  return (
    <div className="relative flex flex-col h-[100vh] w-full overflow-hidden">
      {/* Header */}
      <div className="w-full flex justify-between items-center px-3 sm:px-5 pt-8 lg:pt-5 sm:pt-9 z-20">
        <div className="flex flex-row gap-2 sm:gap-4 items-baseline justify-center">
          <button
            className="cursor-pointer transition"
            onClick={
              authenticated ? () => setShowHistory((v) => !v) : handleSignIn
            }
          >
            <Image
              src={"/images/history.png"}
              alt="report history"
              width={120}
              height={50}
              className="hover:scale-[1.05] w-[70px] h-[30px] sm:w-[80px] sm:h-[34px] md:w-[100px] md:h-[40px]"
            />
          </button>
          <button
            className="cursor-pointer transition flex flex-row items-end 
             disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
            disabled={true}
            onClick={() => router.push("/coming-soon")}
          >
            <Image
              src={"/images/exchange.png"}
              alt="report history"
              width={140}
              height={80}
              className="hover:scale-[1.05] w-[70px] h-[30px] sm:w-[80px] sm:h-[34px] md:w-[100px] md:h-[40px]"
            />
            <Image
              src={"/images/comingsoon.png"}
              alt="coming soon"
              width={28}
              height={17}
              className="w-[24px] h-[15px] sm:w-[28px] sm:h-[17px]"
            />
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-4 md:gap-5">
          {/* X (Twitter) Icon */}
          <a
            href="https://x.com/huntonraptor"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-transform hover:scale-110 p-1 sm:p-0"
            aria-label="Follow us on X (Twitter)"
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white hover:text-[#fce000] transition-colors"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>

          {/* Telegram Icon */}
          <a
            href="https://t.me/huntonraptor"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-transform hover:scale-110 p-1 sm:p-0"
            aria-label="Join us on Telegram"
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white hover:text-[#fce000] transition-colors"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16l-1.61 7.59c-.12.54-.44.67-.89.42l-2.46-1.81-1.19 1.14c-.13.13-.24.24-.49.24l.17-2.43 4.47-4.03c.19-.17-.04-.27-.31-.1L9.39 12.9l-2.4-.75c-.52-.16-.53-.52.11-.77l9.39-3.61c.43-.16.81.1.67.73z" />
            </svg>
          </a>

          {/* Instagram Icon */}
          <a
            href="https://www.instagram.com/huntonraptor"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-transform hover:scale-110 p-1 sm:p-0"
            aria-label="Follow us on Instagram"
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white hover:text-[#fce000] transition-colors"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </a>
        </div>

        {!authenticated ? (
          <button
            onClick={handleSignIn}
            className="flex items-center justify-center px-6 py-2 text-white font-bold text-lg rounded-lg cursor-pointer transition"
          >
            Sign-In
          </button>
        ) : (
          <button
            onClick={() => {
              setShowAccountModal((prev) => {
                const next = !prev;
                if (!prev && next) fetchUser();
                return next;
              });
            }}
            className="flex items-center gap-3 px-2 py-2 text-white font-bold text-lg rounded-lg cursor-pointer transition"
          >
            Account
          </button>
        )}
      </div>

      {/* Account Modal */}
      {showAccountModal && (
        <>
          <div
            className="absolute inset-0 bg-black/50 z-40"
            onClick={() => setShowAccountModal(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div
              ref={modalRef}
              className="w-[500px] max-w-[90%] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 pointer-events-auto max-h-[80vh] overflow-y-auto custom-sidebar-scrollbar"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">
                  Account & Referrals
                </h2>
                <button
                  onClick={() => setShowAccountModal(false)}
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
              <div className="flex space-x-1 mx-4 mt-4 bg-gray-800 p-1 rounded-lg">
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
                          {/* <p className="text-gray-400 text-sm mt-1">
                            {currentUser.email || "No email provided"}
                          </p> */}
                          <p className="text-white text-lg mt-2">
                            <span className="text-[#00B050] text-xl font-bold">
                              {currentUser.points.toLocaleString()}
                            </span>{" "}
                            points
                          </p>
                        </div>

                        {/* Account Details */}
                        <div className="bg-gray-800 rounded-lg p-4">
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
                            <div className="flex justify-between">
                              <span className="text-gray-400">Email:</span>
                              <span className="text-white">
                                {currentUser.email || "Not provided"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">
                                Member Since:
                              </span>
                              <span className="text-white">
                                {new Date(
                                  currentUser.createdAt
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
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
                  onClick={handleLogout}
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
      )}

      {/* Sidebar */}
      <div
        className={`absolute top-0 left-0 h-full z-30 transform transition-transform duration-300 ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full">
          {authenticated && userId ? (
            <ChatSidebar
              userId={userId}
              currentReportId={selectedReportId || undefined}
              onSelectReport={(rid: any) => {
                setSelectedReportId(rid);
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
            />
          ) : null}
        </div>
      </div>
      {showHistory && (
        <div
          className="absolute inset-0 bg-black/50 z-25"
          onClick={() => setShowHistory(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 overflow-hidden">
        {authenticated && userId ? (
          selectedReportId ? (
            /* CASE 1: report selected -> open chat (with tech props passthrough) */
            <RexChat
              userId={userId}
              selectedReportId={selectedReportId}
              onReportChange={setSelectedReportId}
              onBack={() => {
                // back to the first Generate Report section
                setSelectedReportId(null);
                setCurrentIsViewingChart(false);
                setShowHistory(false);
              }}
            />
          ) : !currentIsViewingChart ? (
            /* CASE 2: not viewing chart -> landing hero */
            <div className="flex flex-col items-center justify-center h-full gap-10 px-10">
              <header className="flex flex-col items-center justify-center">
                <div className="flex items-end">
                  <Image
                    src="/images/home-logo.png"
                    alt="RaptorX Logo"
                    width={200}
                    height={200}
                    priority
                  />
                  <Image
                    src={"/images/beta.png"}
                    alt="Beta version"
                    width={28}
                    height={28}
                    className="pb-5 ml-[-32px]"
                  />
                </div>
                <div className="flex flex-col gap-20 items-center justify-center">
                  <h1 className="max-w-[600px] w-full font-light text-xl text-center text-white">
                    Rex Pilot. Your AI Pilot for everying crypto.
                  </h1>
                  <h4 className="max-w-[600px] w-full font-light !text-[18px] text-center text-white">
                    Click <span className="text-[#00b050]">Generate</span> to
                    generate Alpha reports for any coin on Solana!
                  </h4>
                  {serverReports.length > 0 && (
                    <button
                      onClick={() => setShowHistory(true)}
                      className="px-6 py-3 bg-[#ffc000] text-black !font-semibold rounded-lg hover:bg-[#00b050] transition"
                    >
                      View Report History ({serverReports.length})
                    </button>
                  )}
                </div>
              </header>
            </div>
          ) : (
            /* CASE 3: viewing chart (no report selected) -> indicators + analysis */
            <div className="h-full flex flex-col">
              {/* Header with back button and title */}
              <div className="p-3 pt-20 bg-black/30 w-full flex flex-col gap-3">
                <div className="text-center">
                  <h1 className="text-xl font-semibold text-white">
                    Technical Analysis
                  </h1>
                  <p className="text-white/70 mb-6">
                    {currentTokenAddress
                      ? `Generate technical analysis for ${
                          currentSelectedToken?.name ||
                          currentTokenAddress.substring(0, 8)
                        }`
                      : "Select a coin from the chart view to enable analysis tools"}
                  </p>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto custom-sidebar-scrollbar">
                <div className="mb-6">
                  <div className="mb-8">
                    <TechnicalIndicators
                      userId={userId}
                      token={currentSelectedToken || undefined}
                      tokenAddress={currentTokenAddress || ""}
                      authenticated={true}
                      isGeneratingReport={false}
                      disabled={!currentTokenAddress}
                      /* statuses (from hook) */
                      isGeneratingMACD={isGeneratingMACD}
                      isGeneratingRSI={isGeneratingRSI}
                      isGeneratingCupHandle={isGeneratingCupHandle}
                      isGeneratingAll={isGeneratingAll}
                      hasMACD={!!macdAnalysis}
                      hasRSI={!!rsiAnalysis}
                      hasCupHandle={!!cupHandleAnalysis}
                      hasAll={!!allAnalysis}
                      /* triggers (from hook) */
                      onGenerateMACD={() =>
                        currentTokenAddress && generateMACD(currentTokenAddress)
                      }
                      onGenerateRSI={() =>
                        currentTokenAddress && generateRSI(currentTokenAddress)
                      }
                      onGenerateCupHandle={() =>
                        currentTokenAddress &&
                        generateCupHandle(currentTokenAddress)
                      }
                      onGenerateAll={() =>
                        currentTokenAddress &&
                        generateAllIndicators(currentTokenAddress)
                      }
                    />
                  </div>

                  {hasAnyAnalysis && (
                    <div className="mt-8 space-y-6">
                      <h2 className="text-xl font-semibold text-white mb-4">
                        Analysis Results
                      </h2>

                      {macdAnalysis && (
                        <CollapsiblePanel
                          title="MACD Analysis"
                          open={macdOpen}
                          onToggle={() => setMacdOpen((v) => !v)}
                          onRefresh={
                            currentTokenAddress
                              ? () => {
                                  clearCache(
                                    "macd",
                                    currentTokenAddress,
                                    "15m"
                                  );
                                  generateMACD(currentTokenAddress);
                                }
                              : undefined
                          }
                          refreshDisabled={
                            isGeneratingMACD || !currentTokenAddress
                          }
                          loading={isGeneratingMACD}
                        >
                          <div className="text-white/90 whitespace-pre-wrap">
                            {sanitizeAnalysis(macdAnalysis?.analysis)}
                          </div>
                        </CollapsiblePanel>
                      )}

                      {rsiAnalysis && (
                        <CollapsiblePanel
                          title="RSI Analysis"
                          open={rsiOpen}
                          onToggle={() => setRsiOpen((v) => !v)}
                          onRefresh={
                            currentTokenAddress
                              ? () => {
                                  clearCache("rsi", currentTokenAddress, "15m");
                                  generateRSI(currentTokenAddress);
                                }
                              : undefined
                          }
                          refreshDisabled={
                            isGeneratingRSI || !currentTokenAddress
                          }
                          loading={isGeneratingRSI}
                        >
                          <div className="text-white/90 whitespace-pre-wrap">
                            {sanitizeAnalysis(rsiAnalysis?.analysis)}
                          </div>
                        </CollapsiblePanel>
                      )}

                      {cupHandleAnalysis && (
                        <CollapsiblePanel
                          title="Cup & Handle Analysis"
                          open={cupOpen}
                          onToggle={() => setCupOpen((v) => !v)}
                          onRefresh={
                            currentTokenAddress
                              ? () => {
                                  clearCache(
                                    "cuphandle",
                                    currentTokenAddress,
                                    "15m"
                                  );
                                  generateCupHandle(currentTokenAddress);
                                }
                              : undefined
                          }
                          refreshDisabled={
                            isGeneratingCupHandle || !currentTokenAddress
                          }
                          loading={isGeneratingCupHandle}
                        >
                          <div className="text-white/90 whitespace-pre-wrap">
                            {sanitizeAnalysis(cupHandleAnalysis?.analysis)}
                          </div>
                        </CollapsiblePanel>
                      )}

                      {allAnalysis && (
                        <CollapsiblePanel
                          title="Combined Analysis"
                          open={allOpen}
                          onToggle={() => setAllOpen((v) => !v)}
                          onRefresh={
                            currentTokenAddress
                              ? () => {
                                  clearCache("all", currentTokenAddress, "15m");
                                  generateAllIndicators(currentTokenAddress);
                                }
                              : undefined
                          }
                          refreshDisabled={
                            isGeneratingAll || !currentTokenAddress
                          }
                          loading={isGeneratingAll}
                        >
                          <div className="text-white/90 whitespace-pre-wrap">
                            {sanitizeAnalysis(allAnalysis?.analysis)}
                          </div>
                        </CollapsiblePanel>
                      )}
                    </div>
                  )}

                  {/* Loading state */}
                  {!hasAnyAnalysis && isGeneratingAny && (
                    <div className="flex flex-col items-center justify-center py-10 mt-8">
                      <div className="w-12 h-12 border-2 border-[#ffc000] border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-white/70">
                        Generating technical analysis...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        ) : (
          /* Unauthenticated landing */
          <div className="flex flex-col items-center justify-center h-full gap-10 px-10">
            <header className="flex flex-col items-center justify-center">
              <div className="flex items-end">
                <Image
                  src="/images/home-logo.png"
                  alt="RaptorX Logo"
                  width={200}
                  height={200}
                  priority
                />
                <Image
                  src={"/images/beta.png"}
                  alt="Beta version"
                  width={28}
                  height={28}
                  className="pb-5 ml-[-32px]"
                />
              </div>
              <div className="flex flex-col gap-20 items-center justify-center">
                <h1 className="max-w-[600px] w-full font-light text-xl text-center text-white">
                  Rex Pilot. Your AI Pilot for everying crypto.
                </h1>
                <h4 className="max-w-[600px] w-full font-light !text-[18px] text-center text-white">
                  Click <span className="text-[#00b050]">Generate</span> to
                  generate Alpha reports for any coin on Solana!
                </h4>
              </div>
            </header>
          </div>
        )}
      </div>
    </div>
  );
}
