/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import ChatSidebar from "../rexchat/ChatSidebar";
import { RexChat } from "../rexchat";
import { useReports, useReportWithConversation } from "@/hooks/useReports";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Minimize,
  X,
} from "lucide-react";
import { StorageManager } from "@/lib/storage/storage-util";
import { DexSwapper } from "@/components/swap/DexSwapper";
import RexHeader from "@/components/ui/layout/Header";

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
  selectedToken?: TrendingToken | null;
  tokenAddress?: string | null;
  isViewingChart?: boolean;
  onTokenSelect?: (token: TrendingToken | null) => void;
  selectedChain?: "solana" | "bsc" | "all";
  hideHeader?: boolean; // Hide header when used as sidebar
  onClose?: () => void; // Callback to close the sidebar
  forceShowExchange?: boolean; // Force show the exchange panel when true
}

function CollapsiblePanel({
  title,
  open,
  onToggle,
  onRefresh,
  refreshDisabled,
  loading,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  loading?: boolean;
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
  selectedChain = "solana",
  hideHeader = false,
  onClose,
  forceShowExchange = false,
}: Props) {
  const [swapMinimized, setSwapMinimized] = useState(!forceShowExchange);
  const [contentMinimized, setContentMinimized] = useState(forceShowExchange);
  const { authenticated: privyAuthenticated, user: privyUser } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();
  
  // Combined authentication state
  const authenticated = privyAuthenticated || phantomAuthenticated;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [macdOpen, setMacdOpen] = useState(true);
  const [rsiOpen, setRsiOpen] = useState(true);
  const [cupOpen, setCupOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(true);

  const sanitizeAnalysis = (text?: string) => (text ?? "").replace(/[#*]/g, "");

  const showLandingFallback = contentMinimized && swapMinimized;

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

  // Initialize strictly from props (avoid restoring prior token -> don't auto-open swapper)
  const [currentSelectedToken, setCurrentSelectedToken] =
    useState<TrendingToken | null>(() => selectedToken ?? null);
  const [currentTokenAddress, setCurrentTokenAddress] = useState<string | null>(
    () => tokenAddress ?? null
  );
  const [currentIsViewingChart, setCurrentIsViewingChart] = useState<boolean>(
    () => isViewingChart ?? false
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

  // Handle forceShowExchange prop changes
  useEffect(() => {
    if (forceShowExchange) {
      setSwapMinimized(false);
      setContentMinimized(true);
    }
  }, [forceShowExchange]);

  // Prevent both content and swap being minimized simultaneously. If both true, show content.
  useEffect(() => {
    if (swapMinimized && contentMinimized && !forceShowExchange) {
      setContentMinimized(false);
    }
  }, [swapMinimized, contentMinimized, forceShowExchange]);

  // When a token is selected from the list, auto-show the DexSwapper
  useEffect(() => {
    if (currentTokenAddress) {
      setSwapMinimized(false);
    }
  }, [currentTokenAddress]);

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
      // Only auto-show exchange if not forcing exchange view
      if (!forceShowExchange) {
        setSwapMinimized(false);
      }
    }
  }, [generatedReport?.id, forceShowExchange]);

  // When a report is selected/generated, fetch it to get contract address and chain
  const { data: activeReport } = useReportWithConversation(
    userId || undefined,
    selectedReportId
  );

  useEffect(() => {
    if (activeReport?.contractAddress) {
      setCurrentTokenAddress(activeReport.contractAddress);
    }
  }, [activeReport?.contractAddress]);

  const fetchUser = useCallback(async () => {
    if (!authenticated) {
      setCurrentUser(null);
      return;
    }

    // Determine which auth provider to use
    const authId = privyUser?.id || phantomUser?.id;
    if (!authId) {
      setCurrentUser(null);
      return;
    }

    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          privyUser?.id
            ? { privyId: privyUser.id }
            : { phantomId: phantomUser!.id }
        ),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user as User);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    }
  }, [authenticated, privyUser?.id, phantomUser?.id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const { data: serverReports = [] } = useReports(
    userId || undefined,
    "crypto"
  );

  return (
    <div className={`relative flex flex-col w-full overflow-hidden h-full min-h-0`} style={{
      maxHeight: '100dvh', // Use dynamic viewport height for mobile
    }}>
      {!hideHeader && (
        <RexHeader
          onHistoryClick={() => setShowHistory((v) => !v)}
          onExchangeClick={() => setSwapMinimized(false)}
          showExchangeButton={true}
          onLogout={() => {
            setCurrentUser(null);
            setSelectedReportId(null);
            clearAllStates();
          }}
        />
      )}

      {/* Close button - always visible */}
      {(swapMinimized || contentMinimized) && onClose && (
        <div className="absolute top-2 right-2 z-50">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 bg-[#3C3C3C] rounded-lg cursor-pointer hover:bg-[#4C4C4C] transition-colors"
            aria-label="Close sidebar"
          >
            <X width={18} height={18} />
          </button>
        </div>
      )}

      {/* Expand banner when content is minimized */}
      {contentMinimized && (
        <div className="w-full flex items-center justify-center mt-1 z-30">
          <button
            onClick={() => setContentMinimized(false)}
            className="flex items-center gap-3 px-4 py-2 rounded-md cursor-pointer"
            aria-label="Expand intelligence report"
            title="Expand intelligence report"
          >
            <Image
              src={"/images/banner.png"}
              alt="RaptorX"
              width={34}
              height={34}
              className="rounded-full"
            />
            <span className="text-[#ffc000] text-base sm:text-lg">
              expand intelligence report.
            </span>
          </button>
        </div>
      )}

      <div
        className={`absolute top-0 left-0 h-full z-30 transform transition-transform duration-300 ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full relative">
          {authenticated && userId ? (
            <>
              <ChatSidebar
                userId={userId}
                currentReportId={selectedReportId || undefined}
                onSelectReport={(rid: any) => {
                  setSelectedReportId(rid);
                  setShowHistory(false);
                }}
                onClose={() => setShowHistory(false)}
                reportType="crypto"
              />
              {!swapMinimized && (
                <button
                  onClick={() => {
                    setContentMinimized(true);
                    setSwapMinimized(false);
                    setShowHistory(false);
                  }}
                  className="absolute bottom-3 left-3 z-50 px-2 py-1 text-xs rounded border border-white/20 bg-black/80 text-white hover:bg-black"
                  aria-label="Show only Swap"
                >
                  minimize
                </button>
              )}
            </>
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
      <div className="flex-1 overflow-hidden flex flex-col bg-black">
        {authenticated && userId ? (
          <>
            {/* Collapsible content wrapper keeps panel size stable */}
            <div
              className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
                contentMinimized && !showLandingFallback
                  ? "max-h-0 opacity-0"
                  : !swapMinimized
                  ? "max-h-[60vh] sm:max-h-[60vh] md:max-h-[60vh] opacity-100"
                  : "max-h-dvh opacity-100"
              }`}
            >
              <div className="relative w-full bg-black">
                {!swapMinimized && (
                  <div className="w-full flex justify-between items-center bg-[#141414] px-5 py-3">
                    <div className="flex items-center gap-4">
                      {onClose && (
                        <button
                          onClick={onClose}
                          className="flex items-center justify-center gap-1 z-51 w-10 h-10 bg-[#3C3C3C] rounded-lg cursor-pointer text-[14px]"
                          aria-label="Close sidebar"
                        >
                          <X width={18} height={18} />
                        </button>
                      )}
                      <div className="flex flex-col items-start ">
                        <h6 className="text-[12px]! font-normal! text-[#F2F2F2]">
                          Rex Pilot
                        </h6>
                        <p className="text-[12px] font-normal text-[#7A7A7A]">
                          Your AI Pilot for everything crypto
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setContentMinimized(true);
                          setSwapMinimized(false);
                        }}
                        className="flex items-center justify-center gap-1 z-51 px-2 py-1 cursor-pointer text-[14px]"
                        aria-label="Show only Swap"
                      >
                        <Minimize width={18} height={18} />
                        <span className="text-white">minimize</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {showLandingFallback ? (
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
                        className="pb-5 -ml-8"
                      />
                    </div>
                    <div className="flex flex-col gap-8 items-center justify-center">
                      <h1 className="max-w-150 w-full text-[18px]! font-normal! text-[#F2F2F2] text-center">
                        Rex Pilot. Your AI Pilot for everything crypto.
                      </h1>
                      <h4 className="max-w-150 w-full font-light text-[16px]! text-center text_white">
                        Click <span className="text-[#00b050]">Generate</span>{" "}
                        to generate Alpha reports for any coin on Solana & BNB!
                      </h4>
                    </div>
                    {serverReports.length > 0 && (
                      <button
                        onClick={() => setShowHistory(true)}
                        className="px-4 sm:px-6 py-2 sm:py-3 bg-[#ffc000] text-black rounded-lg font-semibold! text-xs sm:text-[14px] hover:bg-[#00b050] transition w-full sm:w-auto"
                      >
                        View Report History ({serverReports.length})
                      </button>
                    )}
                  </header>
                </div>
              ) : selectedReportId ? (
                <div
                  className={`relative overflow-hidden flex flex-col ${
                    swapMinimized 
                      ? "h-full min-h-0" 
                      : "h-[calc(100%-64px)] sm:h-[calc(100%-64px)] md:h-[calc(100%-64px)] min-h-0"
                  }`}
                  style={{
                    maxHeight: swapMinimized ? '100dvh' : 'calc(100dvh - 64px)', // Use dynamic viewport height for mobile
                  }}
                >
                  <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                    <RexChat
                      userId={userId}
                      selectedReportId={selectedReportId}
                      onReportChange={setSelectedReportId}
                      onBack={() => {
                        setSelectedReportId(null);
                        setCurrentIsViewingChart(false);
                        setShowHistory(false);
                      }}
                      reportType="crypto"
                      onViewHistory={() => setShowHistory(true)}
                    />
                  </div>
                </div>
              ) : !currentIsViewingChart ? (
                <div className="flex flex-col items-center justify-center h-[calc(100%-64px)] sm:h-[calc(100%-64px)] md:h-[calc(100%-64px)] gap-10 px-10" style={{
                  maxHeight: 'calc(100dvh - 64px)', // Use dynamic viewport height for mobile
                }}>
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
                        className="pb-5 -ml-8"
                      />
                    </div>
                    <div className="flex flex-col gap-10 items-center justify-center">
                      <div className="flex flex-col gap-8">
                        <h1 className="max-w-150 w-full text-[18px]! font-normal! text-[#F2F2F2] text-center">
                          Rex Pilot. Your AI Pilot for everything crypto.
                        </h1>
                        <h4 className="max-w-150 w_full text-[18px]! font-normal! text-[#F2F2F2] text-center">
                          Click <span className="text-[#00b050]">Generate</span>{" "}
                          to generate Alpha reports for any coin on Solana & BNB!
                        </h4>
                      </div>
                      {serverReports.length > 0 && (
                        <button
                          onClick={() => setShowHistory(true)}
                          className="px-4 sm:px-6 py-2 sm:py-3 bg-[#ffc000] text-black rounded-lg font-semibold! text-xs sm:text-[14px] hover:bg-[#00b050] transition w-full sm:w-auto"
                        >
                          View Report History ({serverReports.length})
                        </button>
                      )}
                    </div>
                  </header>
                </div>
              ) : (
                /* CASE 3: viewing chart (no report selected) -> indicators + analysis */
                <div className="h-full flex flex-col relative min-h-0 overflow-hidden" style={{
                  maxHeight: '100dvh', // Use dynamic viewport height for mobile
                }}>
                  {/* Scrollable container wrapping entire technical analysis section */}
                  <div 
                    className="flex-1 overflow-y-auto overflow-x-hidden custom-sidebar-scrollbar min-h-0"
                    style={{
                      WebkitOverflowScrolling: 'touch',
                      touchAction: 'pan-y',
                      overscrollBehavior: 'contain',
                    }}
                  >
                    {/* Header with minimize and report history */}
                    <div className="pt-2 pl-2">
                      {serverReports.length > 0 && (
                        <button
                          onClick={() => setShowHistory(true)}
                          className="cursor-pointer transition hover:scale-[1.05]"
                          aria-label="View Report History"
                        >
                          <Image
                            src={"/images/history.png"}
                            alt="report history"
                            width={140}
                            height={80}
                            className="w-25 h-10 sm:w-20 sm:h-8.5 md:w-25 md:h-10"
                          />
                        </button>
                      )}
                    </div>
                    <div className="p-3 pt-10 bg-black/30 w-full flex items-center justify-between gap-3">
                      <div className="flex-1 text-center">
                        <h1 className="text-xl font-semibold text-white">
                          Technical Analysis
                        </h1>
                        <p className="text-white/70 mb-0">
                          {currentTokenAddress
                            ? `Generate technical analysis for ${
                                currentSelectedToken?.name ||
                                currentTokenAddress.substring(0, 8)
                              }`
                            : "Select a coin from the chart view to enable analysis tools"}
                        </p>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="mb-6">
                        <div className="mb-8">
                          <TechnicalIndicators
                            userId={userId}
                            token={currentSelectedToken || undefined}
                            tokenAddress={currentTokenAddress || ""}
                            authenticated={true}
                            isGeneratingReport={false}
                            disabled={!currentTokenAddress}
                            isGeneratingMACD={isGeneratingMACD}
                            isGeneratingRSI={isGeneratingRSI}
                            isGeneratingCupHandle={isGeneratingCupHandle}
                            isGeneratingAll={isGeneratingAll}
                            hasMACD={!!macdAnalysis}
                            hasRSI={!!rsiAnalysis}
                            hasCupHandle={!!cupHandleAnalysis}
                            hasAll={!!allAnalysis}
                            onGenerateMACD={() =>
                              currentTokenAddress &&
                              generateMACD(currentTokenAddress)
                            }
                            onGenerateRSI={() =>
                              currentTokenAddress &&
                              generateRSI(currentTokenAddress)
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

                            {/* MACD */}
                            {macdAnalysis && (
                              <CollapsiblePanel
                                title="MACD"
                                open={macdOpen}
                                onToggle={() => setMacdOpen((v) => !v)}
                                onRefresh={
                                  currentTokenAddress
                                    ? () => generateMACD(currentTokenAddress)
                                    : undefined
                                }
                                refreshDisabled={isGeneratingMACD}
                                loading={isGeneratingMACD}
                              >
                                <div className="whitespace-pre-wrap text-white/90">
                                  {sanitizeAnalysis(macdAnalysis.analysis)}
                                </div>
                              </CollapsiblePanel>
                            )}

                            {/* RSI */}
                            {rsiAnalysis && (
                              <CollapsiblePanel
                                title="RSI"
                                open={rsiOpen}
                                onToggle={() => setRsiOpen((v) => !v)}
                                onRefresh={
                                  currentTokenAddress
                                    ? () => generateRSI(currentTokenAddress)
                                    : undefined
                                }
                                refreshDisabled={isGeneratingRSI}
                                loading={isGeneratingRSI}
                              >
                                <div className="whitespace-pre-wrap text-white/90">
                                  {sanitizeAnalysis(rsiAnalysis.analysis)}
                                </div>
                              </CollapsiblePanel>
                            )}

                            {/* Cup & Handle */}
                            {cupHandleAnalysis && (
                              <CollapsiblePanel
                                title="Cup & Handle"
                                open={cupOpen}
                                onToggle={() => setCupOpen((v) => !v)}
                                onRefresh={
                                  currentTokenAddress
                                    ? () => generateCupHandle(currentTokenAddress)
                                    : undefined
                                }
                                refreshDisabled={isGeneratingCupHandle}
                                loading={isGeneratingCupHandle}
                              >
                                <div className="whitespace-pre-wrap text-white/90">
                                  {sanitizeAnalysis(cupHandleAnalysis.analysis)}
                                </div>
                              </CollapsiblePanel>
                            )}

                            {/* All Indicators */}
                            {allAnalysis && (
                              <CollapsiblePanel
                                title="All Indicators"
                                open={allOpen}
                                onToggle={() => setAllOpen((v) => !v)}
                                onRefresh={
                                  currentTokenAddress
                                    ? () =>
                                        generateAllIndicators(currentTokenAddress)
                                    : undefined
                                }
                                refreshDisabled={isGeneratingAll}
                                loading={isGeneratingAll}
                              >
                                <div className="whitespace-pre-wrap text-white/90">
                                  {sanitizeAnalysis(allAnalysis.analysis)}
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
                </div>
              )}
            </div>

            <div className="w-full border-t border-[#ffc000] bg-black relative z-40 shrink-0">
              <div className="flex items-center justify-between">
                <div className="w-full flex items-center justify-center">
                  {!swapMinimized && (
                    <div className="w-full flex justify-between items-center bg-[#141414] px-5 py-3 shrink-0">
                      <div className="flex flex-col items-start ">
                        <h6 className="text-[12px]! font-normal! text-[#F2F2F2]">
                          Exchange Tokens Instantly
                        </h6>
                        <p className="text-[12px] font-normal text-[#7A7A7A]">
                          Fast, secure swaps powered by RaptorX.
                        </p>
                      </div>
                      <button
                        onClick={() => setSwapMinimized(true)}
                        className="flex items-center justify-center gap-1 px-2 py-1 z-60 rounded cursor-pointer text-[14px] text-white"
                        aria-label="Minimize Swap"
                      >
                        <Minimize width={18} height={18} />
                        <span className="text-white">minimize</span>
                      </button>
                    </div>
                  )}
                  {swapMinimized && (
                    <div className="px-3 py-2 shrink-0">
                      <button
                        onClick={() => {
                          setSwapMinimized(false);
                          setContentMinimized(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 cursor-pointer"
                        aria-label="Enter the Exchange"
                      >
                        <Image
                          src="/images/raptorxchange.png"
                          alt="exchange logo"
                          width={28}
                          height={28}
                        />
                        <span className="text-[#ffc000]">
                          Enter the Exchange
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center"></div>
              </div>
              <div
                className={`overflow-y-auto overflow-x-hidden mt-4 custom-sidebar-scrollbar transition-[max-height] duration-300 ease-in-out ${
                  swapMinimized
                    ? "max-h-0 h-0 mt-0! pointer-events-none"
                    : contentMinimized
                    ? "mt-0 max-h-[calc(100vh-120px)] sm:max-h-[calc(100vh-120px)]"
                    : selectedReportId
                    ? "mt-0 max-h-[50vh] min-h-75 sm:max-h-[40vh] sm:min-h-62.5 md:max-h-[40vh]"
                    : "mt-0 max-h-[40vh] min-h-75 sm:min-h-62.5"
                }`}
                aria-hidden={swapMinimized}
                style={{ 
                  WebkitOverflowScrolling: 'touch', 
                  touchAction: 'pan-y',
                  overscrollBehavior: 'contain',
                  maxHeight: swapMinimized 
                    ? '0' 
                    : contentMinimized
                    ? 'calc(100dvh - 120px)' // Use dynamic viewport height for mobile
                    : selectedReportId
                    ? '50vh'
                    : '40vh',
                }}
              >
                <DexSwapper
                  currentUserId={currentUser?.id ? currentUser.id : ""}
                  toTokenAddress={currentTokenAddress || undefined}
                  forceChain={
                    activeReport?.chain === "bsc" ||
                    activeReport?.chain === "bnb"
                      ? "bsc"
                      : activeReport?.chain === "solana"
                      ? "solana"
                      : selectedChain !== "all"
                      ? selectedChain
                      : undefined
                  }
                />
              </div>
            </div>
          </>
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
                  className="pb-5 -ml-8"
                />
              </div>
              <div className="flex flex-col gap-20 items-center justify-center">
                <h1 className="max-w-150 w-full text-[18px]! font-normal! text-[#F2F2F2] text-center">
                  Rex Pilot. Your AI Pilot for everything crypto.
                </h1>
                <h4 className="max-w-150 w-full text-[18px]! font-normal! text-[#F2F2F2] text-center">
                  Click <span className="text-[#00b050]">Generate</span> to
                  generate Alpha reports for any coin on Solana & BNB!
                </h4>
              </div>
            </header>
          </div>
        )}
      </div>
    </div>
  );
}
