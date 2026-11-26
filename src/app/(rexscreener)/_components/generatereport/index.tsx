/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import ChatSidebar from "../rexchat/ChatSidebar";
import { RexChat } from "../rexchat";
import { PilotReportHistoryButton } from "../rexchat/PilotReportHistoryButton";
import { useReports, useReportWithConversation } from "@/hooks/useReports";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { StorageManager } from "@/lib/storage/storage-util";
import { DexSwapper } from "@/components/swap/DexSwapper";
import RexHeader from "@/components/ui/layout/Header";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useEthereumWalletAddress } from "@/hooks/useEthereumWalletAddress";
import { consumePhantomResumeSwap } from "@/lib/phantomReturnUrl";
import { resolveSwapChain } from "@/lib/swapChain";

/* Technical Indicators + Analysis */
import TechnicalIndicators from "@/app/(rexscreener)/_components/technicalindicators/TechnicalIndicators";
import { useTechnicalAnalysis } from "@/hooks/useTechnicalAnalysis";
import { RexScreenerStreamingReport } from "@/app/(rexscreener)/_components/rexchat/RexScreenerStreamingReport";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import {
  ClawIco,
  ClawMark,
  IconChev,
  IconExpand,
  IconMin,
  IconX,
} from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/pilotUi";
import {
  IconRefresh,
  ReportPaneHead,
  SwapMark,
} from "@/app/(rexscreener)/_components/rexchat/screenerSideUi";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import { matchesMedia } from "@/app/(rexscreener)/_components/tokenside/useMediaQuery";
import type { SheetPane } from "@/app/(rexscreener)/_components/tokenside/TokenPhoneBar";
import "@/styles/pages/pilot.css";
import "@/styles/pages/screener-side.css";

/** Exchange / report split height, saved per viewer (prototype RXResize key "tk-ex-h"). */
const EX_H_KEY = "rx-size-tk-ex-h";
const EX_MIN_H = 200;
const REPORT_MIN_H = 200;

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
    | "robinhood"
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
  /**
   * Desktop token view: minimizing the second pane parks both as tabs on the right edge — the shell
   * closes the sidebar and shows the tabs (prototype design/js/token.js .side-rail).
   */
  onParkBoth?: () => void;
  /** Show one pane from outside (a parked tab): that pane expanded, the other minimized. `seq` makes every request new. */
  paneRequest?: { pane: SheetPane; seq: number } | null;
  /** Phones: the sidebar is a bottom sheet that shows only this pane (prototype .tk-side[data-sheet]). */
  sheetPane?: SheetPane | null;
}

/** The sidebar docks beside the page (>=1024px) instead of covering it. */
const DESKTOP_MQ = "(min-width: 1024px)";

/** One analysis result (MACD, RSI, …): a Rex Pilot disclosure with a Refresh action (pilot.css .disc-box). */
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
  children: ReactNode;
}) {
  return (
    <div className="disc-box">
      <div className="ss-res__head">
        <button
          type="button"
          onClick={onToggle}
          className="disc"
          aria-expanded={open}
        >
          <IconChev />
          <span>{title}</span>
        </button>
        {loading && <span className="ss-res__busy">Regenerating…</span>}
        {onRefresh && (
          <button
            type="button"
            onClick={() => {
              onRefresh();
            }}
            disabled={!!refreshDisabled}
            className="rx-btn rx-btn--secondary rx-btn--s"
            title={refreshDisabled ? "Please wait…" : "Refresh analysis"}
          >
            {loading ? (
              <span className="rx-spin" aria-hidden="true" />
            ) : (
              <IconRefresh size={13} />
            )}
            Refresh
          </button>
        )}
      </div>

      {open && <div className="ss-res__body">{children}</div>}
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
  onParkBoth,
  paneRequest = null,
  sheetPane = null,
}: Props) {
  const [swapMinimized, setSwapMinimized] = useState(!forceShowExchange);
  const [contentMinimized, setContentMinimized] = useState(false);
  const { authenticated: privyAuthenticated, user: privyUser } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();
  
  // Combined authentication state
  const authenticated = privyAuthenticated || phantomAuthenticated;

  /**
   * Returning from the Phantom app: surface the Exchange, not the report.
   *
   * The user left this page mid-connect and lands back in a fresh tab, so put them
   * where they were going rather than at the top of the chart they scrolled past.
   */
  const phantomResumedRef = useRef(false);
  useEffect(() => {
    if (consumePhantomResumeSwap()) {
      phantomResumedRef.current = true;
      setSwapMinimized(false);
      setContentMinimized(true);
    }
  }, []);

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

  /** What the panes show: a phone sheet always shows its own pane expanded (the other one is hidden). */
  const swapHidden = sheetPane === "exchange" ? false : swapMinimized;
  const contentHidden = sheetPane === "report" ? false : contentMinimized;

  const showLandingFallback = contentHidden && swapHidden;

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

  /**
   * One panel at a time — show the user what they actually asked for.
   *
   * "Enter the Exchange" sets forceShowExchange, "Claw AI" clears it. Previously the
   * former un-collapsed BOTH panels, so a user who clicked Exchange got the AI report
   * stacked on top of it and had to scroll past a chart to reach the swap.
   */
  useEffect(() => {
    // ...unless we just came back from Phantom. This effect runs after the resume
    // effect on the same mount and would otherwise stomp the view it positioned.
    // Consume the flag so genuine later changes still take effect.
    if (phantomResumedRef.current) {
      phantomResumedRef.current = false;
      return;
    }
    if (forceShowExchange) {
      setSwapMinimized(false);
      setContentMinimized(true); // Exchange only
    } else {
      setSwapMinimized(true);
      setContentMinimized(false); // Intelligence report only
    }
  }, [forceShowExchange]);

  // Prevent both content and swap being minimized simultaneously. If both true, show content.
  // (Desktop token view never gets here from the minimize buttons: they park both panes instead.)
  useEffect(() => {
    if (swapMinimized && contentMinimized && !forceShowExchange) {
      setContentMinimized(false);
    }
  }, [swapMinimized, contentMinimized, forceShowExchange]);

  // A pane asked for from outside (a parked tab on the right edge): that pane expanded, the other minimized.
  useEffect(() => {
    if (!paneRequest) return;
    const ex = paneRequest.pane === "exchange";
    setSwapMinimized(!ex);
    setContentMinimized(ex);
    setShowHistory(false);
  }, [paneRequest]);

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

    if (selectedReportId) {
      // Trust an explicitly-selected report id when the reports list is momentarily
      // empty (e.g. a background refetch briefly clears it). Flipping pilotReportId
      // to null here unmounts the chat panel, which aborts an in-flight follow-up
      // mid-stream — the response then never renders. Only fall through if the list
      // IS loaded and genuinely no longer contains this id (e.g. after a delete).
      if (!serverReports.length) return String(selectedReportId);
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
  // The chain must describe the token the swap targets — see resolveSwapChain for why
  // the report's own `chain` cannot be trusted ahead of the charted token.
  const dexForceChain = resolveSwapChain({
    swapTokenAddress: currentTokenAddress,
    token: currentSelectedToken,
    reportChain: activeReport?.chain,
    reportContractAddress: activeReport?.contractAddress,
    routeChain: selectedChain,
  });
  const dexWalletAddress =
    dexForceChain === "solana"
      ? solanaAddress
      : dexForceChain
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

  /** The panel's swap is set to the token of the report Rex Pilot shows. */
  const swapMatchesPilotReport =
    !!currentTokenAddress &&
    !!activeReport?.contractAddress &&
    currentTokenAddress.trim().toLowerCase() ===
      String(activeReport.contractAddress).trim().toLowerCase();

  /* ---- drag the line between the Exchange and the report (prototype RXResize on #gRep) ---- */
  const panesRef = useRef<HTMLDivElement>(null);
  const exPaneRef = useRef<HTMLElement>(null);
  const [exH, setExH] = useState<number | null>(null);
  const [splitActive, setSplitActive] = useState(false);

  useEffect(() => {
    try {
      const v = parseFloat(localStorage.getItem(EX_H_KEY) ?? "");
      if (!Number.isNaN(v)) setExH(v);
    } catch {
      /* storage blocked: keep the default split */
    }
  }, []);

  const clampExH = useCallback((v: number) => {
    const total = panesRef.current?.clientHeight ?? 0;
    const max = Math.max(EX_MIN_H, total - REPORT_MIN_H);
    return Math.round(Math.max(EX_MIN_H, Math.min(max, v)));
  }, []);

  const saveExH = useCallback((v: number | null) => {
    try {
      if (v == null) localStorage.removeItem(EX_H_KEY);
      else localStorage.setItem(EX_H_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const currentExH = useCallback(
    () => exPaneRef.current?.getBoundingClientRect().height ?? 0,
    [],
  );

  const onSplitPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const base = currentExH();
      let last = base;
      setSplitActive(true);
      document.body.classList.add("is-resizing", "is-resizing-y");
      const move = (ev: globalThis.PointerEvent) => {
        last = clampExH(base + ev.clientY - startY);
        setExH(last);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        document.body.classList.remove("is-resizing", "is-resizing-y");
        setSplitActive(false);
        saveExH(last);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    },
    [clampExH, currentExH, saveExH],
  );

  const onSplitKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 64 : 16;
      let next: number | null | undefined;
      if (e.key === "ArrowDown") next = clampExH(currentExH() + step);
      else if (e.key === "ArrowUp") next = clampExH(currentExH() - step);
      else if (e.key === "Home") next = null;
      if (next === undefined) return;
      e.preventDefault();
      setExH(next);
      saveExH(next);
    },
    [clampExH, currentExH, saveExH],
  );

  const resetSplit = useCallback(() => {
    setExH(null);
    saveExH(null);
  }, [saveExH]);

  /** both · ex (report minimized) · rep (Exchange minimized) · none */
  const paneState = swapHidden
    ? contentHidden
      ? "none"
      : "rep"
    : contentHidden
      ? "ex"
      : "both";

  const splitStyle =
    exH != null && paneState === "both" && !sheetPane
      ? ({ "--ex-h": `${clampExH(exH)}px` } as CSSProperties)
      : undefined;

  const closeButton = onClose ? (
    <button
      type="button"
      className="rx-icon-btn panel-ctl"
      onClick={onClose}
      aria-label="Close sidebar"
      title="Close"
    >
      <IconX />
    </button>
  ) : null;

  const historyCount = serverReports.length;
  const openHistory = () => setShowHistory(true);

  /**
   * Desktop token view (prototype design/js/token.js): minimizing a pane while the other one is already
   * minimized parks both as tabs on the right edge and closes the sidebar. They are reset here so any
   * other way back in (Claw AI 5.0, Enter the Exchange) finds open panes; a parked tab asks for its pane.
   */
  const parkIfOtherMinimized = (otherMinimized: boolean) => {
    if (!onParkBoth || !otherMinimized || sheetPane || !matchesMedia(DESKTOP_MQ)) return false;
    setSwapMinimized(false);
    setContentMinimized(false);
    setShowHistory(false);
    onParkBoth();
    return true;
  };
  const minimizeSwap = () => {
    if (parkIfOtherMinimized(contentMinimized)) return;
    setSwapMinimized(true);
  };
  const minimizeReport = () => {
    if (parkIfOtherMinimized(swapMinimized)) return;
    setContentMinimized(true);
    setSwapMinimized(false);
  };
  /** Phone sheets have no minimize: each sheet shows one pane and closes instead. */
  const reportMinimize = sheetPane ? undefined : minimizeReport;
  /** Phone sheets: the report pane head carries the sheet's close. */
  const reportClose = sheetPane ? onClose : undefined;

  /** Rex Pilot intro (no chart / no report): claw mark, the pitch and Report history. */
  const pilotIntro = (
    <div className="sb-body">
      <div className="empty">
        <span className="empty__mark" aria-hidden="true">
          <ClawIco size={34} />
        </span>
        <b>Rex Pilot</b>
        <p>
          Your AI pilot for everything crypto. Click <b>Generate</b> to generate
          Alpha reports for any coin on Solana, Ethereum, Binance, Base and Monad!
        </p>
        <PilotReportHistoryButton
          count={historyCount}
          onOpen={openHistory}
          className="mt-1"
        />
      </div>
    </div>
  );

  return (
    // .rx-pilot (styles/pages/pilot.css) + .rx-ss (styles/pages/screener-side.css):
    // the token page's side column — Exchange on top, Intelligence report below (design/token.html).
    // data-sheet (phones): a bottom sheet that shows only that pane.
    <div className="rx-pilot rx-ss" data-sheet={sheetPane ?? undefined}>
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

      {/* Report history: covers the whole panel (cards on phones, table rows in the 700px desktop panel) */}
      <div
        className={`absolute top-0 left-0 h-full w-full z-[60] transform transition-transform duration-300 ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!showHistory}
        inert={!showHistory}
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
              {!swapMinimized && !sheetPane && (
                <button
                  onClick={() => {
                    setContentMinimized(true);
                    setSwapMinimized(false);
                    setShowHistory(false);
                  }}
                  className="rx-btn rx-btn--secondary rx-btn--s absolute bottom-3 left-3 z-50 shadow-[0_8px_20px_rgba(0,0,0,0.5)] max-md:h-10"
                  aria-label="Show only Swap"
                >
                  <IconMin size={13} />
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
      {/* the sidebar's close stays reachable over the history drawer */}
      {showHistory && closeButton ? (
        <button
          type="button"
          className="rx-icon-btn panel-ctl ss-float-close"
          onClick={onClose}
          aria-label="Close sidebar"
          title="Close"
        >
          <IconX />
        </button>
      ) : null}

      {authenticated && userId ? (
        <div
          className="ss-panes"
          data-state={paneState}
          data-sized={splitStyle ? "" : undefined}
          ref={panesRef}
          style={splitStyle}
        >
          {/* ---------- Exchange ---------- */}
          <section className="ss-pane ss-pane--ex" aria-label="Exchange" ref={exPaneRef}>
            {swapHidden ? (
              <div className="sb-min">
                {closeButton}
                <button
                  type="button"
                  className="sb-bar"
                  onClick={() => {
                    setSwapMinimized(false);
                    setContentMinimized(true);
                  }}
                  aria-label="Enter the Exchange"
                >
                  <SwapMark size={12} />
                  <span>
                    Enter the <b>Exchange</b>
                  </span>
                  <IconExpand />
                </button>
              </div>
            ) : (
              <div className="sb-head">
                {/* docked / overlay: close on the left; phone sheet: close on the right, no minimize */}
                {sheetPane ? null : closeButton}
                <SwapMark />
                <div className="panel__title">
                  <b>
                    <span className="t">Exchange</span>
                  </b>
                  <span className="panel__sub">
                    Swap tokens instantly · powered by RaptorX
                  </span>
                </div>
                {sheetPane ? (
                  closeButton
                ) : (
                  <button
                    type="button"
                    className="rx-icon-btn panel-ctl"
                    onClick={minimizeSwap}
                    aria-expanded="true"
                    aria-label="Minimize Swap"
                    title="Minimize"
                  >
                    <IconMin />
                  </button>
                )}
              </div>
            )}
            {/* The swap stays mounted while minimized (its widget events + in-flight routes) */}
            <div
              className={`ss-ex__body${swapHidden ? " is-hidden" : ""}`}
              aria-hidden={swapHidden}
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
              }}
            >
              <DexSwapper
                currentUserId={currentUser?.id ? currentUser.id : ""}
                toTokenAddress={currentTokenAddress || undefined}
                forceChain={dexForceChain}
                walletAddress={dexWalletAddress}
              />
            </div>
          </section>

          {/* line between the panes; drag it (or use the arrow keys) to resize, double-click to reset */}
          {paneState === "both" ? (
            <div
              className={`sb-split${splitActive ? " is-active" : ""}`}
              role="separator"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-label="Resize exchange and intelligence report"
              aria-valuenow={exH != null ? clampExH(exH) : undefined}
              title="Drag to resize · double-click to reset"
              onPointerDown={onSplitPointerDown}
              onKeyDown={onSplitKeyDown}
              onDoubleClick={resetSplit}
            />
          ) : (
            <div className="sb-split" aria-hidden="true" />
          )}

          {/* ---------- Intelligence report (Rex Pilot) ---------- */}
          <section className="ss-pane ss-pane--rep" aria-label="Intelligence report">
            {contentHidden ? (
              <div className="sb-min">
                <button
                  type="button"
                  className="sb-bar"
                  onClick={() => setContentMinimized(false)}
                  aria-label="Expand intelligence report"
                  title="Expand intelligence report"
                >
                  <ClawMark size={15} />
                  <span>
                    Expand <b>Intelligence report</b>
                  </span>
                  <IconExpand />
                </button>
              </div>
            ) : null}

            {/* Minimized, the report stays mounted (an answer that is streaming keeps going) */}
            <div
              className={`ss-pane__main${
                contentHidden && !showLandingFallback ? " is-hidden" : ""
              }`}
              aria-hidden={contentHidden && !showLandingFallback ? true : undefined}
            >
              {showLandingFallback ? (
                pilotIntro
              ) : pilotReportId && !reportGenActive ? (
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
                  onViewHistory={openHistory}
                  onMinimize={reportMinimize}
                  onCloseSidebar={reportClose}
                  onOpenExchange={
                    // What's New "Trade" card: bring the swap up next to this report; its
                    // "Full Exchange" link shows the Exchange on its own. Only when the
                    // swap targets this report's token (the chart can be another token).
                    // Phone sheet: switch to the Exchange sheet.
                    swapMatchesPilotReport
                      ? (opts) => {
                          setShowHistory(false);
                          if (sheetPane) {
                            requestShellAction("exchange");
                            return;
                          }
                          setSwapMinimized(false);
                          if (opts?.full) setContentMinimized(true);
                        }
                      : undefined
                  }
                />
              ) : !currentIsViewingChart ? (
                <>
                  {/* Report history sits in the intro itself (like the market sidebar's empty state) */}
                  <ReportPaneHead onMinimize={reportMinimize} onClose={reportClose} />
                  {pilotIntro}
                </>
              ) : (
                /* viewing chart (no report selected) -> streaming report + technical analysis */
                <>
                  <ReportPaneHead
                    onHistory={!reportGenActive ? openHistory : undefined}
                    historyCount={historyCount}
                    onMinimize={reportMinimize}
                    onClose={reportClose}
                  />
                  <div
                    className="sb-body"
                    style={{
                      WebkitOverflowScrolling: "touch",
                      touchAction: "pan-y",
                      overscrollBehavior: "contain",
                    }}
                  >
                    <RexScreenerStreamingReport
                      tokenAddress={currentTokenAddress}
                      token={currentSelectedToken}
                      completedReport={generatedReport}
                    />
                    {!reportGenActive ? (
                      <div className="ss-ta">
                        <div className="ss-ta__intro">
                          <h3>Technical analysis</h3>
                          <p>
                            {currentTokenAddress
                              ? `Generate technical analysis for ${
                                  currentSelectedToken?.name ||
                                  currentTokenAddress.substring(0, 8)
                                }`
                              : "Select a coin from the chart view to enable analysis tools"}
                          </p>
                        </div>

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

                        {hasAnyAnalysis && (
                          <div className="ss-results">
                            <span className="rx-eyebrow">Analysis results</span>

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
                                {sanitizeAnalysis(macdAnalysis.analysis)}
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
                                {sanitizeAnalysis(rsiAnalysis.analysis)}
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
                                {sanitizeAnalysis(cupHandleAnalysis.analysis)}
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
                                {sanitizeAnalysis(allAnalysis.analysis)}
                              </CollapsiblePanel>
                            )}
                          </div>
                        )}

                        {/* Loading state */}
                        {!hasAnyAnalysis && isGeneratingAny && (
                          <div className="ss-loading" role="status">
                            <span className="rx-spin" aria-hidden="true" />
                            <p className="m-0">Generating technical analysis...</p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : (
        /* Unauthenticated landing */
        <>
          <div className="sb-head">
            {sheetPane ? null : closeButton}
            <ClawMark size={17} />
            <div className="panel__title">
              <b>
                <span className="t">Intelligence report</span>
              </b>
              <span className="panel__sub">
                Rex Pilot · your AI pilot for everything crypto
              </span>
            </div>
            {sheetPane ? closeButton : null}
          </div>
          <div className="sb-body">
            <div className="empty">
              <span className="empty__mark" aria-hidden="true">
                <ClawIco size={34} />
              </span>
              <b>Rex Pilot</b>
              <p>
                Your AI pilot for everything crypto. Click <b>Generate</b> to
                generate Alpha reports for any coin on Solana, BNB &amp; Base!
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
