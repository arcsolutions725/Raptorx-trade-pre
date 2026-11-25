"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { peekPhantomResumeSwap } from "@/lib/phantomReturnUrl";
import { GenerateRexscreenerReport } from "@/app/(rexscreener)/_components/generatereport";
import { TrendingTable } from "@/app/(rexscreener)/_components/trendingtable";
import { DailyTasksPopup } from "@/components/leaderboard/DailyTaskPopup";
import { LeaderboardModal } from "@/components/leaderboard/LeaderboradModal";
import RexHeader from "@/components/ui/layout/Header";
import type { TrendingToken, Chain } from "@/hooks/useTrendingTokens";
import type { Report } from "@/lib/storage/storage-util";
import Image from "next/image";
import Footer from "@/components/ui/layout/Footer";
import { useResolveScreenerTokenSlug } from "@/hooks/useResolveScreenerTokenSlug";
import {
  chainFromToken,
  chainPathSegmentForToken,
  hrefForScreenerChain,
  isScreenerChainSlug,
  parseRexScreenerPath,
  pathSegmentForChain,
  pushScreenerTokenPathThenNavigate,
  slugToChain,
  tokenMatchesChain,
  tokenToPathSegment,
} from "@/lib/rexscreenerRoutes";
import { useOpenPilotSidebarOnMobileReportGen } from "@/hooks/useOpenPilotSidebarOnMobileReportGen";
import { markClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";

/** After the first auto-open on RexScreener, skip auto-open on refresh; user can still open via the button. */
const DAILY_MISSION_MODAL_OPENED_KEY = "dailymission_modal_opened";

function browserPathMatchesTarget(
  currentPathname: string,
  targetPath: string,
): boolean {
  const cur = (currentPathname.split("?")[0] ?? "").replace(/\/$/, "") || "/";
  const tgt = (targetPath.split("?")[0] ?? "").replace(/\/$/, "") || "/";
  return cur === tgt;
}

interface PrivyUserWithEmail {
  id: string;
  email?:
    | {
        address?: string;
      }
    | string;
}

export type RexScreenerTableContextValue = {
  routeChain: Chain;
  routeTokenSlug: string | null;
  chartToken: TrendingToken | null;
  viewingChart: boolean;
  deepLinkTableOverlay: null | "loading" | "not-found";
  handleReportGenerated: (report: Report, token?: TrendingToken | null) => void;
  handleTokenSelect: (
    token: TrendingToken | null,
    address: string | null,
    viewing: boolean
  ) => void;
  navigateScreenerChain: (chain: Chain) => void;
  currentUserId: string;
  isAdmin: boolean;
};

const RexScreenerTableContext =
  createContext<RexScreenerTableContextValue | null>(null);

export function useRexScreenerTableContext() {
  const ctx = useContext(RexScreenerTableContext);
  if (!ctx)
    throw new Error(
      "useRexScreenerTableContext must be used within RexScreenerShellProvider"
    );
  return ctx;
}

export function RexScreenerShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { routeChain, routeTokenSlug } = useMemo(
    () => parseRexScreenerPath(pathname),
    [pathname]
  );

  const { authenticated: privyAuthenticated, user: privyUser, ready } =
    usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } =
    usePhantomConnect();

  const authenticated = privyAuthenticated || phantomAuthenticated;

  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showReportSidebar, setShowReportSidebar] = useState(false);
  const [showDailyTasksPopup, setShowDailyTasksPopup] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [forceShowExchange, setForceShowExchange] = useState(false);

  /**
   * Coming back from the Phantom app, land the user on the Exchange.
   *
   * The report sidebar (which hosts the swap widget) is always mounted and merely
   * translated off-screen, so the report component happily consumed the resume flag
   * and set itself up correctly — inside a panel the user could not see. Opening
   * that panel is this component's job.
   *
   * PEEK during render, don't consume: React runs child effects BEFORE parent
   * effects, so by the time any effect here could run, the report below has already
   * eaten the flag. Reading it in the render pass gets us in first, and leaves the
   * child's own consume intact.
   *
   * Applied from an effect rather than as the initial state so the first client
   * render still matches the server's (closed) markup and hydration stays clean.
   */
  const phantomResumeRef = useRef<boolean | null>(null);
  if (phantomResumeRef.current === null) {
    phantomResumeRef.current = peekPhantomResumeSwap();
  }
  useEffect(() => {
    if (!phantomResumeRef.current) return;
    setShowReportSidebar(true);
    setForceShowExchange(true);
  }, []);
  const [selectedToken, setSelectedToken] = useState<TrendingToken | null>(
    null
  );
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<
    string | null
  >(null);
  const [isViewingChart, setIsViewingChart] = useState(false);

  const hasShownDailyTasksRef = useRef(false);
  /** Set before router.push to /[chain]/[token] until pathname catches up (or timeout). */
  const pendingScreenerTokenPathRef = useRef<string | null>(null);
  /** True when the last pathname change came from browser back/forward. */
  const screenerPopStateRef = useRef(false);

  const { data: resolvedToken, isFetching: resolvingSlug } =
    useResolveScreenerTokenSlug(routeChain, routeTokenSlug);

  const userEmail = useMemo(() => {
    if (phantomUser?.email) return phantomUser.email;
    if (!privyUser) return undefined;
    const user = privyUser as PrivyUserWithEmail;
    if (typeof user.email === "string") return user.email;
    if (typeof user.email === "object" && user.email?.address) {
      return user.email.address;
    }
    return undefined;
  }, [privyUser, phantomUser]);

  const referralCode = useMemo(() => {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("referralcode");
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      if (!ready && !phantomAuthenticated) return;
      if (!authenticated) {
        setCurrentUserId("");
        setIsAdmin(false);
        return;
      }

      const authId = privyUser?.id || phantomUser?.id;
      if (!authId) {
        setCurrentUserId("");
        setIsAdmin(false);
        return;
      }

      setLoadingUser(true);
      try {
        const res = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(privyUser?.id
              ? { privyId: privyUser.id }
              : { phantomId: phantomUser!.id }),
            email: userEmail,
            referralCode: referralCode,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const userId = data?.user?.id || "";
          const adminStatus = !!data?.isAdmin;

          setCurrentUserId(userId);
          setIsAdmin(adminStatus);

          if (userId && !hasShownDailyTasksRef.current) {
            hasShownDailyTasksRef.current = true;
            if (
              typeof window !== "undefined" &&
              localStorage.getItem(DAILY_MISSION_MODAL_OPENED_KEY) !== "true"
            ) {
              setTimeout(() => {
                try {
                  localStorage.setItem(DAILY_MISSION_MODAL_OPENED_KEY, "true");
                } catch {
                  /* ignore quota / private mode */
                }
                setShowDailyTasksPopup(true);
              }, 1500);
            }
          }

          if (
            referralCode &&
            data?.isNewUser &&
            typeof window !== "undefined"
          ) {
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
          }
        } else {
          setCurrentUserId("");
          setIsAdmin(false);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
        setCurrentUserId("");
        setIsAdmin(false);
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUser();
  }, [
    ready,
    authenticated,
    privyUser?.id,
    phantomUser?.id,
    userEmail,
    referralCode,
    privyAuthenticated,
    phantomAuthenticated,
  ]);

  useEffect(() => {
    const onPopState = () => {
      screenerPopStateRef.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const pending = pendingScreenerTokenPathRef.current;
    if (!pending) return;
    const pathOnly = pathname.split("?")[0] ?? pathname;
    if (pathOnly === pending || pathOnly.startsWith(`${pending}/`)) {
      pendingScreenerTokenPathRef.current = null;
    }
  }, [pathname]);

  /**
   * Keep the address bar aligned with chart UI: repair missing /[token] after a token click, and drop
   * stale chart state when the user returns to a chain-only path via history (back/forward).
   */
  useEffect(() => {
    const parts = pathname.split("/").filter(Boolean);
    const isChainOnly =
      parts.length === 1 && isScreenerChainSlug(parts[0]!.toLowerCase());

    if (!isChainOnly) return;

    if (!selectedToken?.tokenAddress || !isViewingChart) return;

    const chainFromPath = slugToChain(parts[0]!);
    if (
      !chainFromPath ||
      chainFromPath === "all" ||
      !tokenMatchesChain(selectedToken, chainFromPath)
    ) {
      return;
    }

    if (pendingScreenerTokenPathRef.current) return;

    if (screenerPopStateRef.current) {
      screenerPopStateRef.current = false;
      setSelectedToken(null);
      setSelectedTokenAddress(null);
      setIsViewingChart(false);
      setShowReportSidebar(false);
      setForceShowExchange(false);
      return;
    }

    const chainSeg = parts[0]!;
    const target = `/${chainSeg}/${tokenToPathSegment(selectedToken)}`;
    router.replace(target);
  }, [pathname, selectedToken, isViewingChart, router]);

  const chartToken = selectedToken ?? resolvedToken ?? null;
  const showChartFromUrl =
    Boolean(routeTokenSlug) && routeChain !== "all" && routeTokenSlug !== "";
  const viewingChart =
    isViewingChart ||
    (showChartFromUrl && (!!chartToken || resolvingSlug));

  const reportGenLookupAddress =
    selectedTokenAddress ?? resolvedToken?.tokenAddress ?? null;
  useOpenPilotSidebarOnMobileReportGen(
    reportGenLookupAddress,
    setShowReportSidebar,
  );

  const reportChain: Chain = useMemo(() => {
    if (routeChain !== "all") return routeChain;
    if (chartToken) return chainFromToken(chartToken);
    return "solana";
  }, [routeChain, chartToken]);

  const handleReportGenerated = useCallback(
    (report: Report, token?: TrendingToken | null) => {
      if (token?.tokenAddress) {
        const seg =
          routeChain === "all"
            ? chainPathSegmentForToken(token)
            : pathSegmentForChain(routeChain);
        const nextPath = `/${seg}/${tokenToPathSegment(token)}`;
        if (
          typeof window !== "undefined" &&
          browserPathMatchesTarget(window.location.pathname, nextPath)
        ) {
          pendingScreenerTokenPathRef.current = null;
        } else {
          pendingScreenerTokenPathRef.current = nextPath;
          pushScreenerTokenPathThenNavigate(router, nextPath);
          window.setTimeout(() => {
            if (pendingScreenerTokenPathRef.current === nextPath) {
              pendingScreenerTokenPathRef.current = null;
            }
          }, 2500);
        }
        setSelectedToken(token);
        setSelectedTokenAddress(token.tokenAddress);
        setIsViewingChart(true);
      }
      setGeneratedReport(report);
      setShowReportSidebar(true);
      setForceShowExchange(true);
    },
    [routeChain, router]
  );

  const handleTokenSelect = useCallback(
    (token: TrendingToken | null, address: string | null, viewing: boolean) => {
      if (viewing && token?.tokenAddress) {
        const openAddr = token.tokenAddress;
        // Avoid Rex Pilot showing the previous token's report while the chart is already a new one.
        setGeneratedReport((prev) => {
          if (!prev?.contractAddress) return prev;
          const a = prev.contractAddress.trim().toLowerCase();
          const b = openAddr.trim().toLowerCase();
          return a === b ? prev : null;
        });
        const pathSeg =
          routeChain === "all"
            ? chainPathSegmentForToken(token)
            : pathSegmentForChain(routeChain);
        const nextPath = `/${pathSeg}/${tokenToPathSegment(token)}`;
        if (
          typeof window !== "undefined" &&
          browserPathMatchesTarget(window.location.pathname, nextPath)
        ) {
          pendingScreenerTokenPathRef.current = null;
        } else {
          pendingScreenerTokenPathRef.current = nextPath;
          pushScreenerTokenPathThenNavigate(router, nextPath);
          window.setTimeout(() => {
            if (pendingScreenerTokenPathRef.current === nextPath) {
              pendingScreenerTokenPathRef.current = null;
            }
          }, 2500);
        }
        setSelectedToken(token);
        setSelectedTokenAddress(address);
        setIsViewingChart(true);

        const isMobile =
          typeof window !== "undefined" && window.innerWidth < 1024;
        if (!isMobile) {
          setShowReportSidebar(true);
          setForceShowExchange(true);
        } else {
          setShowReportSidebar(false);
          setForceShowExchange(false);
        }
        return;
      }

      pendingScreenerTokenPathRef.current = null;
      router.push(hrefForScreenerChain(routeChain));
      setSelectedToken(token);
      setSelectedTokenAddress(address);
      setIsViewingChart(viewing);

      if (!viewing) {
        setShowReportSidebar(false);
        setForceShowExchange(false);
      }
    },
    [routeChain, router]
  );

  const handleLogout = useCallback(() => {
    setCurrentUserId("");
    setIsAdmin(false);
    hasShownDailyTasksRef.current = false;
  }, []);

  /** "Claw AI" — opens the intelligence report, so it must also clear the Exchange
   *  force-flag. Without this the flag stays true from an earlier "Enter the Exchange"
   *  click and the user gets the swap panel back instead of the report they asked for. */
  const toggleReportSidebar = useCallback(() => {
    setShowReportSidebar((v) => !v);
    setForceShowExchange(false);
  }, []);

  const openExchangePanel = useCallback(() => {
    setForceShowExchange(true);
    setShowReportSidebar(true);
  }, []);

  const closeReportSidebar = useCallback(() => {
    setShowReportSidebar(false);
    setForceShowExchange(false);
  }, []);

  const openDailyTasksPopup = useCallback(() => {
    setShowDailyTasksPopup(true);
  }, []);

  const closeDailyTasksPopup = useCallback(() => {
    setShowDailyTasksPopup(false);
  }, []);

  const openLeaderboard = useCallback(() => {
    setShowLeaderboard(true);
  }, []);

  const closeLeaderboard = useCallback(() => {
    setShowLeaderboard(false);
  }, []);

  /** Floating "Ask Claw": same destination as the header's Claw AI 5.0 nav link. */
  const openClawAssistant = useCallback(() => {
    markClawV5ScrollToInput();
    router.push("/claw-v5");
  }, [router]);

  const navigateScreenerChain = useCallback(
    (chain: Chain) => {
      pendingScreenerTokenPathRef.current = null;
      setSelectedToken(null);
      setSelectedTokenAddress(null);
      setIsViewingChart(false);
      router.push(hrefForScreenerChain(chain));
    },
    [router]
  );

  const deepLinkTableOverlay = useMemo<null | "loading" | "not-found">(() => {
    if (!showChartFromUrl || chartToken) return null;
    if (resolvingSlug) return "loading";
    return "not-found";
  }, [showChartFromUrl, chartToken, resolvingSlug]);

  const tableContext = useMemo<RexScreenerTableContextValue>(
    () => ({
      routeChain,
      routeTokenSlug,
      chartToken,
      viewingChart,
      deepLinkTableOverlay,
      handleReportGenerated,
      handleTokenSelect,
      navigateScreenerChain,
      currentUserId,
      isAdmin,
    }),
    [
      routeChain,
      routeTokenSlug,
      chartToken,
      viewingChart,
      deepLinkTableOverlay,
      handleReportGenerated,
      handleTokenSelect,
      navigateScreenerChain,
      currentUserId,
      isAdmin,
    ]
  );

  useEffect(() => {
    if (showReportSidebar && typeof window !== "undefined") {
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        const scrollY = window.scrollY;
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = "100%";

        return () => {
          document.body.style.overflow = "";
          document.body.style.position = "";
          document.body.style.top = "";
          document.body.style.width = "";
          window.scrollTo(0, scrollY);
        };
      }
    }
  }, [showReportSidebar]);

  return (
    <RexScreenerTableContext.Provider value={tableContext}>
      <div
        className="rx-screener relative w-full h-screen flex flex-col overflow-hidden"
        aria-busy={loadingUser}
        data-loading-user={loadingUser || undefined}
      >
        <div className="flex-1 flex relative overflow-hidden">
          <div
            className={`h-full flex flex-col w-full transition-[width] duration-500 ease-in-out ${
              showReportSidebar ? "main-content-shrink" : ""
            }`}
          >
            <RexHeader
              onHistoryClick={toggleReportSidebar}
              onExchangeClick={openExchangePanel}
              showExchangeButton={true}
              onLogout={handleLogout}
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>

            <Footer />
          </div>

          <div
            className={`fixed top-0 right-0 h-screen lg:h-full border-l-0 sm:border-l border-[#ffc000] w-full sm:w-[500px] lg:w-[700px] bg-black z-[60] lg:z-auto transform transition-transform duration-500 ease-in-out ${
              showReportSidebar
                ? "translate-x-0 lg:relative lg:flex-shrink-0"
                : "translate-x-full lg:absolute"
            }`}
            role="dialog"
            aria-modal="true"
            aria-hidden={!showReportSidebar}
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              maxHeight: "100dvh",
            }}
          >
            <div
              className="h-full overflow-y-auto overflow-x-hidden bg-[#141414] custom-sidebar-scrollbar"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
                maxHeight: "100dvh",
              }}
            >
              <GenerateRexscreenerReport
                generatedReport={generatedReport}
                selectedToken={selectedToken ?? resolvedToken}
                tokenAddress={
                  selectedTokenAddress ?? resolvedToken?.tokenAddress ?? null
                }
                isViewingChart={viewingChart}
                selectedChain={reportChain}
                hideHeader={true}
                onClose={closeReportSidebar}
                forceShowExchange={forceShowExchange}
                onDismissGeneratedReport={() => setGeneratedReport(null)}
                shellUserId={currentUserId}
              />
            </div>
          </div>

          {showReportSidebar && (
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-50"
              onClick={closeReportSidebar}
              aria-hidden="true"
              style={{ touchAction: "none" }}
            />
          )}
        </div>

        {currentUserId && (
          <div
            className={`fixed bottom-20 left-3 z-40 flex-col items-start gap-2 sm:bottom-[114px] sm:left-5 sm:flex-row sm:items-center ${
              showReportSidebar ? "hidden lg:flex" : "flex"
            }`}
          >
            <button
              type="button"
              onClick={openDailyTasksPopup}
              className="rx-btn h-[30px] shrink-0 gap-2 rounded-[15px] border-rx-gold-line bg-[linear-gradient(180deg,#261D0B,#15100A)] pl-[3px] pr-3 text-xs text-[#FFE2A0] shadow-[inset_0_1px_0_rgba(255,236,205,0.14),0_8px_20px_rgba(0,0,0,0.45)] hover:border-[#6A511B]"
              aria-label="Open Daily Tasks"
              title="Daily Missions"
            >
              <span
                className="flex size-6 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFD670,#E3A300)]"
                aria-hidden="true"
              >
                <Image
                  src="/images/claw-mini.svg"
                  alt=""
                  width={14}
                  height={14}
                  className="size-3.5 brightness-0 opacity-85"
                />
              </span>
              Daily missions
            </button>

            <button
              type="button"
              onClick={openLeaderboard}
              className="rx-btn h-[30px] shrink-0 gap-1.5 rounded-[15px] border-rx-gold-line bg-[linear-gradient(180deg,#261D0B,#15100A)] px-3 text-xs text-rx-gold-hi shadow-[inset_0_1px_0_rgba(255,236,205,0.14),0_8px_20px_rgba(0,0,0,0.45)] hover:border-[#6A511B]"
              aria-label="Open Leaderboard"
              title="Global Leaderboard"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
              Leaderboard
            </button>
          </div>
        )}

        {/* Floating Ask Claw (desktop + tablet, overview list only) */}
        {!showReportSidebar && !viewingChart && (
          <button
            type="button"
            onClick={openClawAssistant}
            className="rx-ask-claw fixed bottom-[114px] right-5 z-40 hidden h-[52px] items-center gap-2.5 rounded-full border-0 bg-[linear-gradient(180deg,#F04A2C_0%,#D81F2A_55%,#B5101F_100%)] pl-3.5 pr-5 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,190,170,0.45),0_14px_34px_rgba(200,16,46,0.38),0_4px_10px_rgba(0,0,0,0.4)] transition-[transform,filter] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 hover:brightness-[1.08] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#FFE7A6] md:inline-flex"
            aria-label="Ask Claw: open Claw AI 5.0"
          >
            <Image
              src="/images/claw-mini.svg"
              alt=""
              width={22}
              height={22}
              className="size-[22px] brightness-0 invert drop-shadow-[0_1px_0_rgba(90,0,10,0.35)]"
            />
            Ask Claw
          </button>
        )}

        <DailyTasksPopup
          userId={currentUserId}
          isOpen={showDailyTasksPopup}
          onClose={closeDailyTasksPopup}
        />

        <LeaderboardModal
          currentUserId={currentUserId}
          isOpen={showLeaderboard}
          onClose={closeLeaderboard}
        />
      </div>
    </RexScreenerTableContext.Provider>
  );
}

/** Renders only the trending table; shell (layout) stays mounted when routes change. */
export function RexScreenerTableOutlet() {
  const ctx = useRexScreenerTableContext();

  return (
    <TrendingTable
      onReportGenerated={ctx.handleReportGenerated}
      currentUserId={ctx.currentUserId}
      isAdmin={ctx.isAdmin}
      onTokenSelect={ctx.handleTokenSelect}
      screenerChain={ctx.routeChain}
      onScreenerChainNavigate={ctx.navigateScreenerChain}
      externalTokenForChart={ctx.chartToken}
      externalViewingChart={ctx.viewingChart}
      deepLinkTableOverlay={ctx.deepLinkTableOverlay}
    />
  );
}
