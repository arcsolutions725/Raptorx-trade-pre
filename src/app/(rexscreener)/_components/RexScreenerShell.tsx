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

  const toggleReportSidebar = useCallback(() => {
    setShowReportSidebar((v) => !v);
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
        className="relative w-full h-screen flex flex-col overflow-hidden"
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
            className={`fixed bottom-20 sm:bottom-12 left-4 z-40 gap-2 flex-col ${
              showReportSidebar ? "hidden lg:flex" : "flex"
            }`}
          >
            <button
              onClick={openDailyTasksPopup}
              className="text-white font-semibold shadow-lg transition-all duration-200 cursor-pointer shrink-0"
              aria-label="Open Daily Tasks"
              title="Daily Missions"
            >
              <Image
                src={"/images/dailymissions.png"}
                alt="Daily Missions"
                width={105}
                height={51}
                className="w-[88px] h-11 sm:w-[105px] sm:h-[51px] object-contain"
              />
            </button>

            <button
              onClick={openLeaderboard}
              className="text-white font-semibold shadow-lg transition-all duration-200 cursor-pointer shrink-0"
              aria-label="Open Leaderboard"
              title="Global Leaderboard"
            >
              <Image
                src={"/images/leaderboard.png"}
                alt="Leaderboard"
                width={105}
                height={51}
                className="w-[88px] h-11 sm:w-[105px] sm:h-[51px] object-contain"
              />
            </button>
          </div>
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
