/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import ChatSidebar from "../rexchat/ChatSidebar";
import { RexChat } from "../rexchat";
import { PilotReportHistoryButton } from "../rexchat/PilotReportHistoryButton";
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
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useEthereumWalletAddress } from "@/hooks/useEthereumWalletAddress";

/* Technical Indicators + Analysis */
import TechnicalIndicators from "@/app/(rexscreener)/_components/technicalindicators/TechnicalIndicators";
import { useTechnicalAnalysis } from "@/hooks/useTechnicalAnalysis";
import { RexScreenerStreamingReport } from "@/app/(rexscreener)/_components/rexchat/RexScreenerStreamingReport";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";

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
  generatedReport?: {
    id?: string;
    contractAddress?: string;
    content?: string;
  } | null;
  selectedToken?: TrendingToken | null;
  tokenAddress?: string | null;
  isViewingChart?: boolean;
  onTokenSelect?: (token: TrendingToken | null) => void;
  selectedChain?:
    | "solana"
    | "bsc"
    | "ethereum"
    | "base"
    | "monad"
    | "all";
  hideHeader?: boolean; // Hide header when used as sidebar
  onClose?: () => void; // Callback to close the sidebar
  forceShowExchange?: boolean; // Force show the exchange panel when true
  /** Clear shell `generatedReport` when user leaves the report view so the chart/TA state can show. */
  onDismissGeneratedReport?: () => void;
  /** Shell prisma user id (`/api/user`); avoids waiting on sidebar's own user fetch before RexChat can load. */
  shellUserId?: string | null;
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
          className="flex items-center gap-2 text-left font-semibold"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="w-5 h-5 text-white/80" />
          ) : (
            <ChevronRight className="w-5 h-5 text-white/80" />
          )}
          <span className="text-lg text-[#ffc000]">{title}</span>
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
  onDismissGeneratedReport,
  shellUserId = null,
}: Props) {
  const [swapMinimized, setSwapMinimized] = useState(!forceShowExchange);
  const [contentMinimized, setContentMinimized] = useState(false);
  const { authenticated: privyAuthenticated, user: privyUser } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();
  
  // Combined authentication state
  const authenticated = privyAuthenticated || phantomAuthenticated;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  /** After Back from Rex Pilot, block re-auto-opening the same token's report from history until chart changes or user picks a report. */
  const [allowAutoPickPilotReport, setAllowAutoPickPilotReport] = useState(true);
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

  /** Canonical chart contract from shell props (do not follow a mismatched RexChat report). */
  const chartAddrNorm = useMemo(() => {
    const fromProps = (tokenAddress ?? selectedToken?.tokenAddress ?? "")
      .trim()
      .toLowerCase();
    if (fromProps) return fromProps;
    return (currentTokenAddress ?? "").trim().toLowerCase();
  }, [tokenAddress, selectedToken?.tokenAddress, currentTokenAddress]);

  // Sync local state from shell props.
  // Keep this one-way to avoid stale fallback values when a token is selected.
  useEffect(() => {
    if (selectedToken !== undefined) {
      setCurrentSelectedToken(selectedToken ?? null);
    }
    if (tokenAddress !== undefined) {
      setCurrentTokenAddress(tokenAddress ?? null);
    }
    if (isViewingChart !== undefined) {
      setCurrentIsViewingChart(Boolean(isViewingChart));
    }
  }, [
    selectedToken,
    tokenAddress,
    isViewingChart,
  ]);

  // Safety: when shell provides a chart token/address, ensure we stay in chart view mode.
  useEffect(() => {
    const hasChartSelection = Boolean(tokenAddress || selectedToken?.tokenAddress);
    if (hasChartSelection && !currentIsViewingChart) {
      setCurrentIsViewingChart(true);
    }
  }, [tokenAddress, selectedToken?.tokenAddress, currentIsViewingChart]);

  useEffect(() => {
    setAllowAutoPickPilotReport(true);
  }, [chartAddrNorm]);

  // Handle forceShowExchange prop changes - show both report view and trading view
  useEffect(() => {
    if (forceShowExchange) {
      setSwapMinimized(false);
      setContentMinimized(false);
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

  const userId = currentUser?.id || shellUserId || null;
  const { isGenerating: reportGenActive } = useReportGenStatus(
    currentTokenAddress || undefined,
  );
  const prevViewingRef = useRef<boolean>(isViewingChart);

  useEffect(() => {
    if (!reportGenActive) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    setContentMinimized(false);
  }, [reportGenActive]);

  useEffect(() => {
    // Detect transition from viewing → not viewing
    if (prevViewingRef.current === true && isViewingChart === false) {
      clearAllStates(); // wipe MACD/RSI/CupHandle/All + errors + loading
    }
    prevViewingRef.current = isViewingChart;
  }, [isViewingChart, clearAllStates]);

  const { data: serverReports = [] } = useReports(
    userId || undefined,
    "crypto"
  );

  /**
   * Which report Rex Pilot should load. User's history/sidebar selection wins if that report exists;
   * otherwise fall back to shell `generatedReport` when it matches the chart (avoids stale snapshots).
   */
  const pilotReportId = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase();
    const chart = chartAddrNorm;

    const gr = generatedReport as
      | { id?: string; contractAddress?: string }
      | null
      | undefined;
    const grId =
      gr?.id != null && `${gr.id}`.trim().length > 0 ? String(gr.id) : null;
    const grContract = gr?.contractAddress ? norm(String(gr.contractAddress)) : "";
    const shellReportMatchesChart =
      !!chart && !!grContract && grContract === chart;
    const gidForPilot = shellReportMatchesChart ? grId : null;

    if (selectedReportId && serverReports.length) {
      const row = (
        serverReports as { id?: string; contractAddress?: string }[]
      ).find((x) => x?.id != null && String(x.id) === String(selectedReportId));
      if (row) return String(selectedReportId);
    }

    return gidForPilot ?? null;
  }, [
    chartAddrNorm,
    generatedReport,
    selectedReportId,
    serverReports,
  ]);

  useEffect(() => {
    StorageManager.saveNavigationState({
      selectedTokenData: selectedToken ?? currentSelectedToken,
      currentTokenAddress: tokenAddress ?? currentTokenAddress,
      currentIsViewingChart: isViewingChart ?? currentIsViewingChart,
      hasReportOpen: !!pilotReportId,
      lastReportId: pilotReportId,
    });
  }, [
    selectedToken,
    tokenAddress,
    isViewingChart,
    currentSelectedToken,
    currentTokenAddress,
    currentIsViewingChart,
    pilotReportId,
  ]);

  /** When the chart token changes (navigation), clear a report selection that doesn't match the new token. */
  const prevChartAddrForPilotRef = useRef<string | null>(null);
  useEffect(() => {
    const chart = chartAddrNorm;
    const prev = prevChartAddrForPilotRef.current;

    if (!chart) {
      prevChartAddrForPilotRef.current = null;
      return;
    }

    const chartChanged = prev !== null && prev !== chart;
    prevChartAddrForPilotRef.current = chart;
    if (!chartChanged) return;

    if (!selectedReportId || !serverReports.length) return;
    const row = (
      serverReports as { id?: string; contractAddress?: string }[]
    ).find((x) => x?.id != null && String(x.id) === String(selectedReportId));
    if (!row?.contractAddress) return;
    if (row.contractAddress.trim().toLowerCase() !== chart) {
      setSelectedReportId(null);
    }
  }, [chartAddrNorm, selectedReportId, serverReports]);

  /** When a new report finishes generating for this chart, select it; ignore shell snapshots for other tokens. */
  const lastSyncedGeneratedIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const chart = chartAddrNorm;
    const gr = generatedReport as
      | { id?: string; contractAddress?: string }
      | null
      | undefined;
    const gid =
      gr?.id != null && `${gr.id}`.trim().length > 0 ? String(gr.id) : null;
    const grContract = gr?.contractAddress
      ? gr.contractAddress.trim().toLowerCase()
      : "";
    if (!gid || !chart || !grContract || grContract !== chart) {
      if (!gid) lastSyncedGeneratedIdRef.current = null;
      return;
    }
    if (gid !== lastSyncedGeneratedIdRef.current) {
      lastSyncedGeneratedIdRef.current = gid;
      setAllowAutoPickPilotReport(true);
      setSelectedReportId(gid);
      setShowHistory(false);
      if (!forceShowExchange) {
        setSwapMinimized(false);
      }
    }
  }, [
    generatedReport?.id,
    generatedReport?.contractAddress,
    chartAddrNorm,
    forceShowExchange,
  ]);

  const { data: activeReport } = useReportWithConversation(
    userId || undefined,
    pilotReportId
  );

  const { solanaAddress } = useSolanaWalletAddress();
  const { ethereumAddress } = useEthereumWalletAddress();
  const dexForceChain =
    activeReport?.chain === "bsc" || activeReport?.chain === "bnb"
      ? "bsc"
      : activeReport?.chain === "ethereum" || activeReport?.chain === "eth"
        ? "ethereum"
      : activeReport?.chain === "solana"
        ? "solana"
        : activeReport?.chain === "base"
          ? "base"
    : activeReport?.chain === "monad"
      ? "monad"
          : selectedChain === "bsc"
            ? "bsc"
            : selectedChain === "ethereum"
              ? "ethereum"
            : selectedChain === "base"
              ? "base"
              : selectedChain === "solana"
        ? "solana"
        : selectedChain === "monad"
          ? "monad"
          : undefined;
  const dexWalletAddress =
    dexForceChain === "solana"
      ? solanaAddress
      : dexForceChain === "bsc" ||
          dexForceChain === "ethereum" ||
          dexForceChain === "base" ||
          dexForceChain === "monad"
        ? ethereumAddress
        : null;

  // Do not overwrite the chart token with a mismatched RexChat report's contract (fixes wrong swap + TA target).
  useEffect(() => {
    if (tokenAddress || selectedToken?.tokenAddress) return;
    if (activeReport?.contractAddress) {
      setCurrentTokenAddress(activeReport.contractAddress);
    }
  }, [tokenAddress, selectedToken?.tokenAddress, activeReport?.contractAddress]);

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

  useEffect(() => {
    if (!allowAutoPickPilotReport) return;
    if (pilotReportId) return;
    if (!userId) return;

    const gr = generatedReport as
      | { id?: string; contractAddress?: string; content?: string }
      | null
      | undefined;

    const hasUsableId =
      gr?.id != null && `${gr.id}`.trim().length > 0;
    if (hasUsableId) return;

    const fromShell = gr?.contractAddress?.trim();
    const fromShellContent =
      gr?.content != null && String(gr.content).trim().length > 0;
    const chartAddr =
      tokenAddress ?? selectedToken?.tokenAddress ?? currentTokenAddress ?? null;
    const addrRaw =
      fromShell ||
      (fromShellContent ? chartAddr : null) ||
      (forceShowExchange ? chartAddr : null);

    if (!addrRaw) return;

    const norm = (s: string) => s.trim().toLowerCase();
    const addrN = norm(String(addrRaw));

    for (const r of serverReports as { id?: string; contractAddress?: string }[]) {
      if (!r?.id || !r?.contractAddress) continue;
      if (norm(String(r.contractAddress)) === addrN) {
        setSelectedReportId(String(r.id));
        setShowHistory(false);
        return;
      }
    }
  }, [
    allowAutoPickPilotReport,
    generatedReport,
    serverReports,
    pilotReportId,
    userId,
    currentTokenAddress,
    tokenAddress,
    selectedToken?.tokenAddress,
    forceShowExchange,
  ]);

  /** RexChat shows Back / history / close in one bar; hide duplicate floating close. */
  const integratedPilotCloseBar =
    !!onClose &&
    (swapMinimized || contentMinimized) &&
    !!pilotReportId &&
    !reportGenActive;

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

      {/* Close button — hidden when RexChat renders the same control in its top bar */}
      {(swapMinimized || contentMinimized) && onClose && !integratedPilotCloseBar && (
        <div
          className={`absolute top-2 right-5 ${
            showHistory ? "z-[70]" : "z-50"
          }`}
        >
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
            aria-label="Expand Intelligence Report."
            title="Expand Intelligence Report."
          >
            <Image
              src={"/images/banner.png"}
              alt="RaptorX"
              width={34}
              height={34}
              className="rounded-full"
            />
            <span className="text-[#ffc000] text-base sm:text-lg">
              Expand Intelligence Report.
            </span>
          </button>
        </div>
      )}

      <div
        className={`absolute top-0 left-0 h-full z-[60] transform transition-transform duration-300 ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full relative">
          {authenticated && userId ? (
            <>
              <ChatSidebar
                userId={userId}
                currentReportId={pilotReportId || undefined}
                onSelectReport={(rid: any) => {
                  setAllowAutoPickPilotReport(true);
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
          className="absolute inset-0 z-[50] bg-black/50"
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
                  <div className="w-full flex justify-between items-center bg-[#141414] pl-5 pr-6 py-3">
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
                        <div className="flex items-center gap-2">
                          <h6 className="text-[12px]! font-normal! text-[#F2F2F2]">
                            Rex Pilot
                          </h6>
                        </div>
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
                <div className="flex flex-col items-center justify-center h-full gap-6 px-10">
                  <header className="flex flex-col items-center justify-center">
                    <div className="flex items-end">
                      <Image
                        src="/images/home-logo.png"
                        alt="RaptorX Logo"
                        width={!swapMinimized ? 72 : 200}
                        height={!swapMinimized ? 72 : 200}
                        className={!swapMinimized ? "w-14 h-14 sm:w-16 sm:h-16" : ""}
                        priority
                      />
                      <Image
                        src={"/images/beta.png"}
                        alt="Beta version"
                        width={!swapMinimized ? 16 : 28}
                        height={!swapMinimized ? 16 : 28}
                        className={!swapMinimized ? "w-4 h-4 pb-2 -ml-3 sm:pb-2.5 sm:-ml-3.5" : "pb-5 -ml-8"}
                      />
                    </div>
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <div className="flex flex-col gap-8 items-center justify-center">
                        <h1 className="max-w-150 w-full text-[18px]! font-normal! text-[#F2F2F2] text-center mb-0">
                          Rex Pilot. Your AI Pilot for everything crypto.
                        </h1>
                        <h4 className="max-w-150 w-full font-light text-[16px]! text-center text_white mb-0">
                          Click <span className="text-[#00b050]">Generate</span>{" "}
                          to generate Alpha reports for any coin on Solana, Ethereum, Binance, Base and Monad!
                        </h4>
                      </div>
                      <PilotReportHistoryButton
                        count={serverReports.length}
                        onOpen={() => setShowHistory(true)}
                        className="w-full sm:w-auto flex items-center justify-center"
                      />
                    </div>
                  </header>
                </div>
              ) : pilotReportId && !reportGenActive ? (
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
                      selectedReportId={pilotReportId}
                      onReportChange={(rid) => {
                        if (rid) setAllowAutoPickPilotReport(true);
                        setSelectedReportId(rid);
                      }}
                      onBack={() => {
                        setAllowAutoPickPilotReport(false);
                        setSelectedReportId(null);
                        onDismissGeneratedReport?.();
                        setShowHistory(false);
                      }}
                      reportType="crypto"
                      onViewHistory={() => setShowHistory(true)}
                      onCloseSidebar={
                        integratedPilotCloseBar ? onClose : undefined
                      }
                    />
                  </div>
                </div>
              ) : !currentIsViewingChart ? (
                <div className="flex flex-col items-center justify-center h-[calc(100%-64px)] sm:h-[calc(100%-64px)] md:h-[calc(100%-64px)] gap-6 px-10" style={{
                  maxHeight: 'calc(100dvh - 64px)', // Use dynamic viewport height for mobile
                }}>
                  <header className="flex flex-col items-center justify-center">
                    <div className="flex items-end">
                      <Image
                        src="/images/home-logo.png"
                        alt="RaptorX Logo"
                        width={!swapMinimized ? 72 : 200}
                        height={!swapMinimized ? 72 : 200}
                        className={!swapMinimized ? "w-32 h-30 sm:w-48 sm:h-48" : ""}
                        priority
                      />
                      <Image
                        src={"/images/beta.png"}
                        alt="Beta version"
                        width={!swapMinimized ? 16 : 28}
                        height={!swapMinimized ? 16 : 28}
                        className={!swapMinimized ? "w-8 h-6 pb-2 -ml-3 sm:pb-2.5 sm:-ml-3.5" : "pb-5 -ml-8"}
                      />
                    </div>
                    <div className="mt-3 flex flex-col items-center gap-2">
                      <div
                        className={
                          !swapMinimized
                            ? "flex flex-col gap-2 items-center justify-center"
                            : "flex flex-col gap-6 items-center justify-center"
                        }
                      >
                        <h1
                          className={
                            !swapMinimized
                              ? "max-w-80 sm:max-w-150 w-full text-[16px]! sm:text-[18px]! font-normal! text-[#F2F2F2] text-center mb-0"
                              : "max-w-150 w-full text-[18px]! font-normal! text-[#F2F2F2] text-center mb-0"
                          }
                        >
                          Rex Pilot. Your AI Pilot for everything crypto.
                        </h1>
                        <h4
                          className={
                            !swapMinimized
                              ? "max-w-70 sm:max-w-150 w-full text-[14px]! sm:text-[18px]! font-normal! text-[#F2F2F2]/80 text-center mb-0"
                              : "max-w-150 w-full text-[16px]! sm:text-[18px]! font-normal! text-[#F2F2F2]/80 text-center mb-0"
                          }
                        >
                          Click <span className="text-[#00b050]">Generate</span>{" "}
                          to generate Alpha reports for any coin on Solana, Ethereum, Binance, Base and Monad!
                        </h4>
                      </div>
                      <PilotReportHistoryButton
                        count={serverReports.length}
                        onOpen={() => setShowHistory(true)}
                        className="max-w-[80%] sm:max-w-full w-full sm:w-auto flex items-center justify-center"
                      />
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
                    <div className="px-2 pt-3 sm:px-3">
                      <RexScreenerStreamingReport
                        tokenAddress={currentTokenAddress}
                        token={currentSelectedToken}
                        completedReport={generatedReport}
                      />
                    </div>
                    {/* Report history (hidden while AI report is streaming — same as Technical Analysis) */}
                    <div className="pt-2 pl-2">
                      {!reportGenActive && (
                        <PilotReportHistoryButton
                          count={serverReports.length}
                          onOpen={() => setShowHistory(true)}
                        />
                      )}
                    </div>
                    {!reportGenActive ? (
                      <>
                        <div className="p-3 pt-10 bg-black/30 w-full flex items-center justify-between gap-3">
                          <div className="flex-1 text-center">
                            <h1 className="text-xl font-semibold text-[#ffc000]">
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
                                <h2 className="text-xl font-semibold text-[#ffc000] mb-4">
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
                                        ? () =>
                                            generateCupHandle(currentTokenAddress)
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
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="w-full border-t-[0.5px] border-[#ffc000] bg-black relative z-40 shrink-0">
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
                    <div className="px-3 py-[13.665px] shrink-0">
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
                          Enter The Exchange.
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
                    : pilotReportId
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
                    : pilotReportId
                    ? '50vh'
                    : '40vh',
                }}
              >
                <DexSwapper
                  currentUserId={currentUser?.id ? currentUser.id : ""}
                  toTokenAddress={currentTokenAddress || undefined}
                  forceChain={dexForceChain}
                  walletAddress={dexWalletAddress}
                />
              </div>
            </div>
          </>
        ) : (
          /* Unauthenticated landing */
          <div className="relative flex flex-col items-center justify-center h-full gap-10 px-10">
            {onClose && (
              <div className="absolute top-2 right-5 z-50">
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 bg-[#3C3C3C] rounded-lg cursor-pointer hover:bg-[#4C4C4C] transition-colors"
                  aria-label="Close sidebar"
                >
                  <X width={18} height={18} />
                </button>
              </div>
            )}
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
                  generate Alpha reports for any coin on Solana, BNB & Base!
                </h4>
              </div>
            </header>
          </div>
        )}
      </div>
    </div>
  );
}
