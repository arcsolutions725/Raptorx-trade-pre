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
  type TouchEvent as ReactTouchEvent,
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
import { AskClawFab } from "@/components/ui/AskClawFab";
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
import { REX_SCREENER_EXCHANGE_PARAM } from "@/components/ui/layout/shellActions";
import {
  PHONE_MQ,
  matchesMedia,
  useMediaQuery,
} from "@/app/(rexscreener)/_components/tokenside/useMediaQuery";
import {
  SidebarEdge,
  useSidebarWidth,
} from "@/app/(rexscreener)/_components/tokenside/sidebarWidth";
import {
  TokenPhoneBar,
  type SheetPane,
} from "@/app/(rexscreener)/_components/tokenside/TokenPhoneBar";
import { ParkedPanesRail } from "@/app/(rexscreener)/_components/tokenside/ParkedPanesRail";

/** After the first auto-open on RexScreener, skip auto-open on refresh; user can still open via the button. */
const DAILY_MISSION_MODAL_OPENED_KEY = "dailymission_modal_opened";

/** id of the sidebar (Exchange + Intelligence report): aria-controls of the buttons that open it. */
const SIDEBAR_ID = "rx-screener-sidebar";
/** The sidebar docks beside the page from 1024px; below it covers the page (tablets) or is a sheet (phones). */
const DESKTOP_MQ = "(min-width: 1024px)";
/** Swipe down this far on a sheet's grip or pane head to close it (prototype design/js/token.js). */
const SHEET_SWIPE_CLOSE_PX = 60;

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

/** A URL in this route group whose first segment is neither /rexscreener nor a chain (e.g. /foo or /foo/bar):
 *  its [chainSlug] page calls notFound(), so the shell renders only the 404 page (which has its own header and footer). */
function isUnknownScreenerPath(pathname: string | null): boolean {
  const first = (pathname ?? "").split("/").filter(Boolean)[0];
  return !!first && first.toLowerCase() !== "rexscreener" && !isScreenerChainSlug(first);
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
  /** Phones: which pane the bottom sheet shows (set by whatever opens the sidebar). */
  const [sheetPane, setSheetPane] = useState<SheetPane>("report");
  /** Desktop token view: both panes minimized, parked as tabs on the right edge (sidebar closed). */
  const [parked, setParked] = useState(false);
  /** Ask the sidebar for its panes (a parked tab: one pane; a token opening: both, like
   *  design/token.html); `seq` makes every request new. */
  const [paneRequest, setPaneRequest] = useState<{
    pane: SheetPane | "both";
    seq: number;
  } | null>(null);
  const paneRequestSeqRef = useRef(0);
  const isPhone = useMediaQuery(PHONE_MQ);
  const rootRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

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
    setSheetPane("exchange");
  }, []);

  /**
   * "Enter the Exchange" from another page (header button / phone tab bar) lands here with
   * `?exchange=1`: open the Exchange panel, then drop the flag from the address bar.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(REX_SCREENER_EXCHANGE_PARAM) !== "1") return;
    setShowReportSidebar(true);
    setForceShowExchange(true);
    setSheetPane("exchange");
    url.searchParams.delete(REX_SCREENER_EXCHANGE_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + (url.search ? url.search : "") + url.hash,
    );
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

  /**
   * Desktop token page (design/token.html): the side column is always there, Exchange and the
   * Intelligence report both open. A token picked from the list opens it in handleTokenSelect; a token
   * reached by its URL (a link, a refresh, back / forward) opens it here, once per token, so minimizing
   * both panes (parked as tabs) is not undone.
   */
  const autoOpenedTokenRef = useRef<string | null>(null);
  const chartTokenKey = chartToken?.tokenAddress?.trim().toLowerCase() ?? null;
  useEffect(() => {
    if (!viewingChart) {
      autoOpenedTokenRef.current = null;
      return;
    }
    if (!chartTokenKey || autoOpenedTokenRef.current === chartTokenKey) return;
    autoOpenedTokenRef.current = chartTokenKey;
    if (!matchesMedia(DESKTOP_MQ) || showReportSidebar || parked) return;
    setShowReportSidebar(true);
    setForceShowExchange(true);
    setSheetPane("exchange");
    paneRequestSeqRef.current += 1;
    setPaneRequest({ pane: "both", seq: paneRequestSeqRef.current });
  }, [viewingChart, chartTokenKey, showReportSidebar, parked]);

  const reportGenLookupAddress =
    selectedTokenAddress ?? resolvedToken?.tokenAddress ?? null;
  /** A report starts streaming on a phone / tablet: open the sidebar on the report (the sheet's report pane). */
  const openSidebarForReportGen = useCallback((open: boolean) => {
    if (open) setSheetPane("report");
    setShowReportSidebar(open);
  }, []);
  useOpenPilotSidebarOnMobileReportGen(
    reportGenLookupAddress,
    openSidebarForReportGen,
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
      // Phones: the sheet shows the report that was just generated
      setSheetPane("report");
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
          // Desktop token page (design/token.html): Exchange on top and the Intelligence report
          // below, both open. (The Exchange flag also picks this token's report from history.)
          setShowReportSidebar(true);
          setForceShowExchange(true);
          setSheetPane("exchange");
          paneRequestSeqRef.current += 1;
          setPaneRequest({ pane: "both", seq: paneRequestSeqRef.current });
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
    setSheetPane("report");
  }, []);

  const openExchangePanel = useCallback(() => {
    setForceShowExchange(true);
    setShowReportSidebar(true);
    setSheetPane("exchange");
  }, []);

  const closeReportSidebar = useCallback(() => {
    setShowReportSidebar(false);
    setForceShowExchange(false);
  }, []);

  /** Phone bar: open the report or the Exchange as a bottom sheet. */
  const openSheet = useCallback((pane: SheetPane) => {
    setSheetPane(pane);
    setForceShowExchange(pane === "exchange");
    setShowReportSidebar(true);
  }, []);

  /** Desktop token view, both panes minimized: close the sidebar and park them on the right edge. */
  const parkPanes = useCallback(() => {
    setShowReportSidebar(false);
    setParked(true);
  }, []);

  /** A parked tab: open the sidebar with that pane expanded (the other stays minimized). */
  const restorePane = useCallback((pane: SheetPane) => {
    paneRequestSeqRef.current += 1;
    setPaneRequest({ pane, seq: paneRequestSeqRef.current });
    setForceShowExchange(pane === "exchange");
    setSheetPane(pane);
    setParked(false);
    setShowReportSidebar(true);
  }, []);

  // Any other way back into the sidebar (Claw AI 5.0, Enter the Exchange, a new token) ends the parking,
  // and so does leaving the token view (the tabs belong to it).
  useEffect(() => {
    if (showReportSidebar) setParked(false);
  }, [showReportSidebar]);
  useEffect(() => {
    if (!viewingChart) setParked(false);
  }, [viewingChart]);

  /** Desktop: drag the sidebar's left edge to resize it (saved per viewer). A token page uses the
   *  design's token-page column (440px by default); the list keeps the Rex Pilot width (700px). */
  const sidebarWidth = useSidebarWidth(
    rootRef,
    sidebarRef,
    !isUnknownScreenerPath(pathname),
    viewingChart ? "token" : "list",
  );

  /**
   * Phone sheet / tablet overlay (below 1024px): Esc closes it; opening moves focus to its close button,
   * closing gives focus back to the button that opened it (prototype design/js/token.js).
   */
  const sheetReturnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!showReportSidebar || matchesMedia(DESKTOP_MQ)) return;
    const sb = sidebarRef.current;
    const ae = document.activeElement;
    sheetReturnFocusRef.current =
      ae instanceof HTMLElement && ae !== document.body && !sb?.contains(ae)
        ? ae
        : null;
    const raf = requestAnimationFrame(() => {
      const closers = sb?.querySelectorAll<HTMLElement>(
        'button[aria-label="Close sidebar"]',
      );
      const visible = Array.from(closers ?? []).find(
        (b) => b.offsetParent !== null,
      );
      visible?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || matchesMedia(DESKTOP_MQ)) return;
      closeReportSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      const back = sheetReturnFocusRef.current;
      sheetReturnFocusRef.current = null;
      const now = document.activeElement;
      if (
        back?.isConnected &&
        (!now || now === document.body || (sb && sb.contains(now)))
      ) {
        back.focus({ preventScroll: true });
      }
    };
  }, [showReportSidebar, closeReportSidebar]);

  /** Phones: swipe down on the sheet's grip or a pane head to close it. */
  const sheetSwipeY0 = useRef<number | null>(null);
  const onSheetTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const t = e.target as Element | null;
      sheetSwipeY0.current =
        isPhone && t?.closest?.(".rx-sheet-grip, .sb-head, .sb-min")
          ? e.touches[0]?.clientY ?? null
          : null;
    },
    [isPhone],
  );
  const onSheetTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const y0 = sheetSwipeY0.current;
      sheetSwipeY0.current = null;
      const y1 = e.changedTouches[0]?.clientY;
      if (y0 != null && y1 != null && y1 - y0 > SHEET_SWIPE_CLOSE_PX) {
        closeReportSidebar();
      }
    },
    [closeReportSidebar],
  );

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

  /** Daily missions + Leaderboard (signed in): the footer's left slot on desktop (phones: icon buttons in the Header). */
  const dockButtons = (
    <>
      <button
        type="button"
        onClick={openDailyTasksPopup}
        className="rx-btn h-[30px] shrink-0 gap-2 rounded-[15px] border-transparent bg-[linear-gradient(180deg,#2B150B,#150B07)] pl-[3px] pr-3 text-xs text-[#FFE7C2] shadow-[inset_0_0_0_1px_rgba(255,106,19,0.45),0_8px_20px_rgba(0,0,0,0.45)] hover:shadow-[inset_0_0_0_1px_rgba(255,184,0,0.7),0_8px_20px_rgba(0,0,0,0.45)]"
        aria-label="Open Daily Tasks"
        title="Daily Missions"
      >
        <span
          className="flex size-6 items-center justify-center rounded-full bg-[linear-gradient(180deg,#F04A2C,#B5101F)]"
          aria-hidden="true"
        >
          <Image
            src="/images/claw-logo-96.webp"
            alt=""
            width={18}
            height={18}
            className="claw-ico size-[18px] p-px"
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
    </>
  );

  // Unknown URL (e.g. /foo): only the 404 page, without the screener's header, table and footer
  if (isUnknownScreenerPath(pathname)) {
    return (
      <RexScreenerTableContext.Provider value={tableContext}>
        {children}
      </RexScreenerTableContext.Provider>
    );
  }

  /** Phones: the pane the bottom sheet shows (null on tablets / desktop, where the sidebar is a column). */
  const phoneSheetPane: SheetPane | null = isPhone ? sheetPane : null;
  /** Desktop token view: both panes parked as tabs on the right edge. */
  const showRail = parked && !showReportSidebar;

  return (
    <RexScreenerTableContext.Provider value={tableContext}>
      <div
        ref={rootRef}
        className="rx-screener relative w-full h-screen flex flex-col overflow-hidden"
        aria-busy={loadingUser}
        data-loading-user={loadingUser || undefined}
        // Token page (design/token.html): on desktop the header and token bar run full width and the
        // sidebar sits next to the chart (screener-side.css; DexscreenerView measures the chart).
        data-token-layout={viewingChart || undefined}
        data-sidebar-open={showReportSidebar || undefined}
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

            {/* room on the right for the parked pane tabs (design/css/pages.css has-rail) */}
            <div
              className={`flex min-h-0 flex-1 flex-col overflow-hidden${
                showRail ? " lg:pr-10" : ""
              }`}
            >
              {children}
            </div>

            {/* Phones, token view: Intelligence report | Trade SYM (opens the bottom sheets) */}
            {viewingChart ? (
              <TokenPhoneBar
                symbol={chartToken?.symbol}
                openPane={showReportSidebar && isPhone ? sheetPane : null}
                controls={SIDEBAR_ID}
                onOpen={openSheet}
              />
            ) : null}

            <Footer dock={currentUserId ? dockButtons : undefined} />
          </div>

          {/* The sidebar: a column on desktop (drag its left edge), a full-height overlay on tablets,
              a bottom sheet on phones (.rx-side in styles/pages/screener-side.css) */}
          <div
            ref={sidebarRef}
            id={SIDEBAR_ID}
            data-rx-sidebar
            data-open={showReportSidebar || undefined}
            data-sheet={phoneSheetPane ?? undefined}
            className={`rx-side fixed top-0 right-0 h-screen max-h-dvh lg:h-full w-full sm:w-[500px] lg:w-[700px] bg-rx-bg z-[60] lg:z-auto transform transition-transform duration-500 ease-in-out motion-reduce:transition-none ${
              showReportSidebar
                ? "translate-x-0 lg:relative lg:flex-shrink-0"
                : "translate-x-full lg:absolute"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={
              phoneSheetPane === "exchange"
                ? "Exchange"
                : phoneSheetPane === "report"
                  ? "Intelligence report"
                  : "Exchange and intelligence report"
            }
            aria-hidden={!showReportSidebar}
            inert={!showReportSidebar}
            onTouchStart={onSheetTouchStart}
            onTouchEnd={onSheetTouchEnd}
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }}
          >
            {/* phones: the sheet's grip (swipe down on it, or on a pane head, to close) */}
            <span className="rx-sheet-grip" aria-hidden="true" />
            {showReportSidebar ? (
              <SidebarEdge width={sidebarWidth} controls={SIDEBAR_ID} />
            ) : null}
            <div
              // .rx-pilot .rx-ss inside paints the panel (flat + 1px line docked, gradient + gold glint as an overlay)
              className="rx-side__scroll h-full max-h-dvh overflow-y-auto overflow-x-hidden custom-sidebar-scrollbar"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
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
                onParkBoth={viewingChart ? parkPanes : undefined}
                paneRequest={paneRequest}
                sheetPane={phoneSheetPane}
              />
            </div>
          </div>

          {showReportSidebar && (
            <div
              className="rx-sheet-scrim lg:hidden fixed inset-0 bg-black/50 z-50"
              onClick={closeReportSidebar}
              aria-hidden="true"
              style={{ touchAction: "none" }}
            />
          )}

          {/* Desktop token view: both panes minimized, parked as tabs on the right edge */}
          {showRail ? (
            <ParkedPanesRail onRestore={restorePane} sidebarId={SIDEBAR_ID} />
          ) : null}
        </div>

        {/* Floating Ask Claw (desktop + tablet, overview list only) */}
        {!showReportSidebar && !viewingChart && (
          <AskClawFab onClick={openClawAssistant} />
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
  const pathname = usePathname();
  if (isUnknownScreenerPath(pathname)) return null;

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
