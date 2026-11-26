"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { useRouter, usePathname } from "next/navigation";
import AccountModal from "@/components/ui/modal/AccountModal";
import LoginModal from "@/components/ui/modal/LoginModal";
import DepositWithdrawModal from "@/components/ui/modal/DepositWithdrawModal";
import MarketInfoModal from "@/components/ui/modal/MarketInfoModal";
import type { OrdersTabKey } from "@/components/ui/modal/accountUi";
import { DailyTasksPopup } from "@/components/leaderboard/DailyTaskPopup";
import { LeaderboardModal } from "@/components/leaderboard/LeaderboradModal";
import type { DailyTasksStatus } from "@/app/api/daily-tasks/route";
import PredictionsTicker from "@/components/ui/layout/PredictionsTicker";
import { User, ArrowRight } from "lucide-react";
import { useTopbar } from "@/contexts/TopbarContext";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useEthereumWalletAddress } from "@/hooks/useEthereumWalletAddress";
import {
  isRexScreenerPathname,
  parseRexScreenerPath,
  REX_SCREENER_ALL_HREF,
} from "@/lib/rexscreenerRoutes";
import {
  RX_SHELL_ACTION_EVENT,
  REX_SCREENER_EXCHANGE_HREF,
  setShellRewards,
  type RxShellActionDetail,
} from "@/components/ui/layout/shellActions";
import { markClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";
// Daily missions + Leaderboard buttons: phone header icons (here) and the desktop dock (Footer)
import "@/styles/pages/shell-dock.css";
import clsx from "clsx";

type User = {
  id: string;
  username: string;
  email: string | null;
  privyId: string;
  points: number;
  referralCode?: string;
  createdAt: string;
  updatedAt: string;
};

interface RexHeaderProps {
  onHistoryClick?: () => void;
  /** "Enter the Exchange" (header) and the phone tab bar's Exchange: opens this page's swap panel.
   *  Without it, both go to RexScreener and open the Exchange there. */
  onExchangeClick?: () => void;
  /** Kept for existing callers. The header shows Exchange on every page (design), so this no longer hides it. */
  showExchangeButton?: boolean;
  onLogout?: () => void;
  title?: string;
  description?: string;
  mobileMenuButton?: React.ReactNode;
}

const SCREENER_CHAIN_EYEBROW: Record<string, string> = {
  base: "Base",
  robinhood: "Robinhood",
  ethereum: "Ethereum",
  solana: "Solana",
  bsc: "BNB Chain",
  monad: "Monad",
  all: "All chains",
};

/** Account button initials ("Admin0000" → "AD"); falls back to the user icon. */
function initialsOf(name?: string | null): string {
  const clean = (name ?? "").replace(/[^A-Za-z0-9]/g, "");
  return clean.slice(0, 2).toUpperCase();
}

/** Missions done today, counted like the Daily missions popup (a mission is done once its steps are). */
function missionsCountOf(t: DailyTasksStatus): { done: number; total: number } {
  const missions: [done: number, of: number][] = [
    [t.reportsCompleted, t.reportsRequired],
    [t.queriesCompleted, t.queriesRequired],
  ];
  return {
    done: missions.filter(([done, of]) => done >= of).length,
    total: missions.length,
  };
}

/** Daily missions (check) and Leaderboard (crown) glyphs, same strokes as the design's icon sprite. */
function DockIcon({ kind }: { kind: "check" | "crown" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {kind === "check" ? (
        <path
          d="M5 12l5 5 9-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function RexHeader({
  onHistoryClick,
  onExchangeClick,
  showExchangeButton: _showExchangeButton = false,
  onLogout: externalOnLogout,
  title,
  description,
  mobileMenuButton,
}: RexHeaderProps) {
  const {
    authenticated: privyAuthenticated,
    ready,
    user: privyUser,
    login: privyLogin,
    logout: privyLogout,
  } = usePrivy();
  const {
    isAuthenticated: phantomAuthenticated,
    user: phantomUser,
    disconnect: phantomDisconnect,
  } = usePhantomConnect();
  const router = useRouter();
  const pathname = usePathname();
  const isRexMarketsPage =
    pathname === "/rexmarkets" || pathname.startsWith("/rexmarkets/");
  const isClawV5Page =
    pathname === "/claw-v5" || pathname.startsWith("/claw-v5/");
  const isRexScreenerPage = isRexScreenerPathname(pathname);
  /** /<chain>/<token>: the token view brings its own head (design/token.html has no page title) */
  const isScreenerTokenPage =
    isRexScreenerPage && parseRexScreenerPath(pathname).routeTokenSlug != null;
  const { solanaAddress } = useSolanaWalletAddress();
  const { ethereumAddress } = useEthereumWalletAddress();

  // Combined authentication state
  const authenticated = privyAuthenticated || phantomAuthenticated;
  const currentAuthUser = privyUser || phantomUser;

  // Set title and description based on current page if not provided
  const displayTitle =
    title ||
    (isClawV5Page
      ? "Claw AI 5.0"
      : isRexMarketsPage
        ? "Rex Predictions"
        : "Market overview");
  const displayDescription =
    description ||
    (isClawV5Page
      ? "AI-powered chat assistant."
      : isRexMarketsPage
        ? "Prediction Intelligence by your side."
        : "Live tokens, read in real time by Claw AI 5.0.");
  // RexScreener eyebrow: which chain the list shows ("RexScreener · Base")
  const screenerEyebrow = isRexScreenerPage
    ? `RexScreener · ${SCREENER_CHAIN_EYEBROW[parseRexScreenerPath(pathname).routeChain] ?? "All chains"}`
    : null;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  /** Tab the account popup opens on ("referrals" shell action → Referrals) */
  const [accountTab, setAccountTab] = useState<"profile" | "referral">("profile");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showPolymarketModal, setShowPolymarketModal] = useState(false);
  /** Tab My orders opens on (account links). Unset: the dialog's own default. */
  const [ordersTab, setOrdersTab] = useState<OrdersTabKey | undefined>(
    undefined,
  );
  const [showMissions, setShowMissions] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  /** Today's missions (null until /api/daily-tasks answers): the count on the dock buttons. */
  const [missionsCount, setMissionsCount] = useState<{
    done: number;
    total: number;
  } | null>(null);
  // Redesign: the green topbar strip is no longer rendered. Report it as hidden so
  // layouts that size around it (e.g. the screener table height) use the no-strip values.
  const { setTopbarVisible } = useTopbar();
  useEffect(() => {
    setTopbarVisible(false);
  }, [setTopbarVisible]);
  const handleSignIn = () => {
    setShowLoginModal(true);
  };

  const fetchUser = useCallback(async () => {
    if (!authenticated) {
      setCurrentUser(null);
      return;
    }

    // Determine which auth provider to use (based on stable IDs)
    const privyId = privyUser?.id;
    const phantomId = phantomUser?.id;
    const authId = privyId || phantomId;

    if (!authId) {
      setCurrentUser(null);
      return;
    }

    setIsLoadingUser(true);
    try {
      // Get email from appropriate provider
      let email: string | undefined;
      if (phantomUser?.email) {
        email = phantomUser.email;
      } else if (privyUser) {
        const privyUserWithEmail = privyUser as {
          email?: { address?: string } | string;
        };
        email =
          (typeof privyUserWithEmail.email === "object" &&
            privyUserWithEmail.email?.address) ||
          (typeof privyUserWithEmail.email === "string" &&
            privyUserWithEmail.email) ||
          undefined;
      }

      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(privyId ? { privyId } : { phantomId }),
          email,
          ...(solanaAddress ? { solanaWallet: solanaAddress } : {}),
          ...(ethereumAddress ? { ethereumWallet: ethereumAddress } : {}),
        }),
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
    } finally {
      setIsLoadingUser(false);
    }
  }, [
    authenticated,
    privyUser?.id,
    phantomUser?.id,
    phantomUser?.email,
    privyUser,
    solanaAddress,
    ethereumAddress,
  ]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // When Solana or Ethereum address becomes available (e.g. after Privy linkedAccounts load), refetch so we persist to DB
  const prevSolanaRef = useRef<string | null>(null);
  const prevEthereumRef = useRef<string | null>(null);
  useEffect(() => {
    const solanaNew =
      authenticated && solanaAddress && solanaAddress !== prevSolanaRef.current;
    const ethereumNew =
      authenticated &&
      ethereumAddress &&
      ethereumAddress !== prevEthereumRef.current;
    if (solanaNew) prevSolanaRef.current = solanaAddress;
    if (ethereumNew) prevEthereumRef.current = ethereumAddress;
    if (solanaNew || ethereumNew) fetchUser();
  }, [authenticated, solanaAddress, ethereumAddress, fetchUser]);

  useEffect(() => {
    if (showAccountModal) {
      fetchUser();
    }
  }, [showAccountModal, fetchUser]);

  /* ---------- Daily missions + Leaderboard (signed in) ----------
     The Header owns both popups on every page: its phone icons open them, and the Footer's dock
     asks for them through the "missions" / "leaderboard" shell actions. */
  const rewardsUserId = authenticated ? (currentUser?.id ?? "") : "";

  const loadMissionsCount = useCallback(async () => {
    if (!rewardsUserId) {
      setMissionsCount(null);
      return;
    }
    try {
      const res = await fetch("/api/daily-tasks", {
        headers: { "x-user-id": rewardsUserId },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { tasks?: DailyTasksStatus };
      if (data?.tasks) setMissionsCount(missionsCountOf(data.tasks));
    } catch {
      /* keep the last count; the buttons work without it */
    }
  }, [rewardsUserId]);

  useEffect(() => {
    void loadMissionsCount();
  }, [loadMissionsCount]);

  // Reports and questions made on other tabs or pages count too: refresh when the tab comes back
  useEffect(() => {
    if (!rewardsUserId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadMissionsCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [rewardsUserId, loadMissionsCount]);

  // Publish for the Footer's dock; cleared when signed out or when this header unmounts
  const rewardsOwnerRef = useRef<symbol | null>(null);
  if (rewardsOwnerRef.current === null) rewardsOwnerRef.current = Symbol("rx-header");
  useEffect(() => {
    const owner = rewardsOwnerRef.current!;
    setShellRewards(
      owner,
      rewardsUserId
        ? {
            userId: rewardsUserId,
            missionsDone: missionsCount?.done ?? null,
            missionsTotal: missionsCount?.total ?? null,
          }
        : null,
    );
  }, [rewardsUserId, missionsCount]);
  useEffect(() => {
    const owner = rewardsOwnerRef.current!;
    return () => setShellRewards(owner, null);
  }, []);

  const closeMissions = useCallback(() => {
    setShowMissions(false);
    void loadMissionsCount();
  }, [loadMissionsCount]);

  const missionsLabel = missionsCount
    ? `Daily missions, ${missionsCount.done} of ${missionsCount.total} done`
    : "Daily missions";

  // Check for query parameter to open Polymarket modal after redirect
  // Using client-side only approach to avoid Suspense boundary requirement
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isRexMarketsPage) {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("openPolymarketModal") === "true") {
        const tab = searchParams.get("ordersTab");
        if (tab === "positions" || tab === "trades") setOrdersTab(tab);
        setShowPolymarketModal(true);
        // Remove query parameter from URL without page reload
        router.replace("/rexmarkets", { scroll: false });
      }
    }
  }, [isRexMarketsPage, router]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // Clear all localStorage data
      if (typeof window !== "undefined") {
        localStorage.clear();
      }

      // Logout from the appropriate provider
      if (privyAuthenticated) {
        await privyLogout();
      }
      if (phantomAuthenticated) {
        await phantomDisconnect();
      }
      setCurrentUser(null);
      setShowAccountModal(false);
      if (externalOnLogout) {
        externalOnLogout();
      }

      // Redirect to main page after logout
      router.push("/");
    } finally {
      setIsLoggingOut(false);
    }
  };

  /** My orders and positions / Trade history. The dialog needs the Rex Predictions trading
   *  context, so other pages go to /rexmarkets first and it opens there (on the same tab). */
  const openOrders = useCallback(
    (tab: OrdersTabKey) => {
      setShowAccountModal(false);
      if (!isRexMarketsPage) {
        router.push(`/rexmarkets?openPolymarketModal=true&ordersTab=${tab}`);
        return;
      }
      setOrdersTab(tab);
      setShowPolymarketModal(true);
    },
    [isRexMarketsPage, router],
  );

  const handleHistoryClick = () => {
    if (onHistoryClick) {
      onHistoryClick();
      return;
    }
    // If no handler provided and not authenticated, prompt sign in
    if (!authenticated) {
      handleSignIn();
    }
  };
  // Latest handler for the "pilot" shell action (token bar's Claw AI 5.0 button)
  const historyClickRef = useRef(handleHistoryClick);
  historyClickRef.current = handleHistoryClick;

  /** "Enter the Exchange": this page's swap panel, or RexScreener's Exchange from other pages. */
  const handleExchangeClick = useCallback(() => {
    if (onExchangeClick) {
      onExchangeClick();
      return;
    }
    router.push(REX_SCREENER_EXCHANGE_HREF);
  }, [onExchangeClick, router]);

  /** Phone tab bar (in the Footer): Account opens login or the account popup, Exchange as above.
   *  The Footer's dock: Daily missions / Leaderboard. */
  useEffect(() => {
    const onShellAction = (e: Event) => {
      const detail = (e as CustomEvent<RxShellActionDetail>).detail;
      if (!detail || detail.handled) return;
      detail.handled = true;
      if (detail.action === "exchange") {
        handleExchangeClick();
        return;
      }
      if (detail.action === "pilot") {
        historyClickRef.current();
        return;
      }
      if (!authenticated) {
        setShowLoginModal(true);
        return;
      }
      if (detail.action === "deposit") {
        setShowDepositModal(true);
        return;
      }
      if (detail.action === "missions") {
        setShowMissions(true);
        return;
      }
      if (detail.action === "leaderboard") {
        setShowLeaderboard(true);
        return;
      }
      setAccountTab(detail.action === "referrals" ? "referral" : "profile");
      setShowAccountModal(true);
    };
    window.addEventListener(RX_SHELL_ACTION_EVENT, onShellAction);
    return () =>
      window.removeEventListener(RX_SHELL_ACTION_EVENT, onShellAction);
  }, [authenticated, handleExchangeClick]);

  const clawAiHeaderButton = (
    <button
      type="button"
      className="rx-btn rx-btn--claw rx-btn--s shrink-0"
      onClick={handleHistoryClick}
      aria-label="Claw AI 5.0: report history"
    >
      <Image
        src="/images/claw-logo-96.webp"
        alt=""
        width={20}
        height={20}
        className="claw-ico"
      />
      Claw AI 5.0
    </button>
  );

  const accountInitials = initialsOf(currentUser?.username);

  return (
    <>
      <div className="w-full flex flex-col z-20">
        {/* Live prediction markets bar above the header (crypto prices run in the footer) */}
        <PredictionsTicker />
        <header className="rx-header">
          <Link
            href={REX_SCREENER_ALL_HREF}
            className="rx-header__logo"
            aria-label="RaptorX home"
          >
            <Image
              src="/images/raptorx-logo.svg"
              alt="RaptorX"
              width={64}
              height={50}
              priority
            />
          </Link>

          {/* Desktop / tablet navigation (phones use the tab bar in the footer) */}
          <nav className="rx-header__nav" aria-label="Main">
            <button
              type="button"
              onClick={() => {
                if (!isRexScreenerPage) router.push(REX_SCREENER_ALL_HREF);
              }}
              aria-current={isRexScreenerPage ? "page" : undefined}
              className="rx-nav-link"
            >
              RexScreener
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isRexMarketsPage) router.push("/rexmarkets");
              }}
              aria-current={
                isRexMarketsPage && !isClawV5Page ? "page" : undefined
              }
              className="rx-nav-link"
            >
              Rex Predictions
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isClawV5Page) {
                  markClawV5ScrollToInput();
                  router.push("/claw-v5");
                }
              }}
              aria-current={isClawV5Page ? "page" : undefined}
              className="rx-nav-link"
            >
              <Image
                src="/images/claw-logo-96.webp"
                alt=""
                width={20}
                height={20}
                className="claw-ico"
              />
              Claw AI 5.0
            </button>
          </nav>

          {/* Right: (phones) Daily missions + Leaderboard, Exchange, Deposit & account */}
          <div className="rx-header__actions relative z-30 shrink-0">
            {rewardsUserId ? (
              <>
                <button
                  type="button"
                  className="rx-icon-btn rx-hdr-dock rx-hdr-dock--missions"
                  onClick={() => setShowMissions(true)}
                  aria-label={missionsLabel}
                  title="Daily missions"
                >
                  <DockIcon kind="check" />
                  {missionsCount ? (
                    <span className="rx-hdr-dock__count rx-num" aria-hidden="true">
                      {missionsCount.done}/{missionsCount.total}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="rx-icon-btn rx-hdr-dock"
                  onClick={() => setShowLeaderboard(true)}
                  aria-label="Leaderboard"
                  title="Leaderboard"
                >
                  <DockIcon kind="crown" />
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="rx-btn rx-btn--exchange"
              onClick={handleExchangeClick}
            >
              <span className="rx-hdr-long">Enter the&nbsp;</span>Exchange
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>

            {!authenticated ? (
              <button
                type="button"
                onClick={handleSignIn}
                className="rx-btn rx-btn--primary"
              >
                Log in
              </button>
            ) : (
              <>
                {/* Every page (design). Hidden on phones like the design (shell-dock.css). */}
                <button
                  type="button"
                  onClick={() => setShowDepositModal(true)}
                  className="rx-btn rx-btn--primary rx-hdr-deposit"
                  title="Deposit & Withdraw"
                >
                  Deposit
                </button>
                {/* Avatar opens the account popup (Profile, Portfolio, My orders, Trade history, referrals) */}
                <button
                  type="button"
                  onClick={() => {
                    setAccountTab("profile");
                    setShowAccountModal(true);
                  }}
                  className="rx-account-btn"
                  aria-label="Account and referrals"
                  aria-haspopup="dialog"
                >
                  {accountInitials ? (
                    <span aria-hidden="true">{accountInitials}</span>
                  ) : (
                    <User className="size-5" aria-hidden="true" />
                  )}
                </button>
              </>
            )}
          </div>
        </header>

        {/* Rex Predictions (list + market pages) and token pages have no page head in the prototype:
            market and token pages bring their own (breadcrumbs, title, Claw AI 5.0 toggle) */}
        {!isClawV5Page && !isRexMarketsPage && !isScreenerTokenPage && (
          <div className="rx-page-head">
            <div className="rx-page-head__title">
              {screenerEyebrow ? (
                <span className="rx-eyebrow">{screenerEyebrow}</span>
              ) : null}
              <h1>{displayTitle}</h1>
              <p>{displayDescription}</p>
            </div>
            <div className="rx-page-head__actions">
              {clawAiHeaderButton}
            </div>
          </div>
        )}
      </div>
      <AccountModal
        isOpen={showAccountModal}
        initialTab={accountTab}
        onClose={() => setShowAccountModal(false)}
        currentUser={currentUser}
        isLoadingUser={isLoadingUser}
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
        onOpenOrders={openOrders}
      />

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <DepositWithdrawModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        defaultPlatform={
          pathname.startsWith("/rexmarkets/kalshi")
            ? "kalshi"
            : pathname.startsWith("/rexmarkets/limitless")
              ? "limitless"
              : pathname.startsWith("/rexmarkets/myriad")
                ? "myriad"
                : pathname.startsWith("/rexmarkets/predict-fun")
                  ? "predictfun"
                  : "polymarket"
        }
      />

      <MarketInfoModal
        isOpen={showPolymarketModal}
        onClose={() => setShowPolymarketModal(false)}
        initialTab={ordersTab}
      />

      <DailyTasksPopup
        userId={rewardsUserId}
        isOpen={showMissions && Boolean(rewardsUserId)}
        onClose={closeMissions}
      />

      <LeaderboardModal
        currentUserId={rewardsUserId || undefined}
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />
    </>
  );
}
