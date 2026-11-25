"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { useRouter, usePathname } from "next/navigation";
import AccountModal from "@/components/ui/modal/AccountModal";
import LoginModal from "@/components/ui/modal/LoginModal";
import DepositWithdrawModal from "@/components/ui/modal/DepositWithdrawModal";
import MarketInfoModal from "@/components/ui/modal/MarketInfoModal";
import PredictionsTicker from "@/components/ui/layout/PredictionsTicker";
import { User, Wallet, ClipboardList, ArrowRight } from "lucide-react";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useTopbar } from "@/contexts/TopbarContext";
import { useSolanaWalletAddress } from "@/hooks/useSolanaWalletAddress";
import { useEthereumWalletAddress } from "@/hooks/useEthereumWalletAddress";
import {
  isRexScreenerPathname,
  REX_SCREENER_ALL_HREF,
} from "@/lib/rexscreenerRoutes";
import {
  PREDICT_FUN_LOGO_SRC,
  PREDICT_FUN_TAB_ICON_SRC,
} from "@/lib/predictfun/assets";
import { markClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";
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
  onExchangeClick?: () => void;
  showExchangeButton?: boolean;
  onLogout?: () => void;
  title?: string;
  description?: string;
  mobileMenuButton?: React.ReactNode;
  /** On claw-v5 (md+), nudge the pill nav so it stays centered over the main column vs the chat sidebar. */
  clawV5MainNavShiftPx?: number;
}

type MarketDataSource =
  "all" | "predictfun" | "kalshi" | "polymarket" | "limitless" | "myriad";

const MARKET_SOURCE_TAB_THEME: Record<
  MarketDataSource,
  { hex: string; desktopActive: string }
> = {
  all: {
    hex: "#ffc000",
    desktopActive: "sm:bg-[#ffc000] sm:!text-black sm:!border-transparent",
  },
  predictfun: {
    hex: "#A855F7",
    desktopActive: "sm:bg-[#A855F7] sm:!text-white sm:!border-transparent",
  },
  kalshi: {
    hex: "#17cb91",
    desktopActive: "sm:bg-[#17cb91] sm:!text-black sm:!border-transparent",
  },
  polymarket: {
    hex: "#2C59F7",
    desktopActive: "sm:bg-[#2C59F7] sm:!text-white sm:!border-transparent",
  },
  limitless: {
    hex: "#c3ff01",
    desktopActive: "sm:bg-[#c3ff01] sm:!text-black sm:!border-transparent",
  },
  myriad: {
    hex: "#ffffff",
    desktopActive: "sm:bg-black sm:!text-white sm:!border-transparent",
  },
};

function RexMarketSourceTab({
  source,
  label,
  isActive,
  onClick,
  icon,
}: {
  source: MarketDataSource;
  label: string;
  isActive: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  const theme = MARKET_SOURCE_TAB_THEME[source];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={clsx("rx-seg__item shrink-0", isActive && "is-active")}
      style={
        isActive
          ? ({
              color: source === "myriad" ? "var(--rx-text)" : theme.hex,
              boxShadow: `inset 0 -2px 0 ${theme.hex}, 0 2px 6px rgba(0,0,0,.4)`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function RexMarketSourceTabs({
  dataSource,
  setDataSource,
}: {
  dataSource: MarketDataSource;
  setDataSource: (source: MarketDataSource) => void;
}) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto scrollbar-none sm:w-auto sm:overflow-visible">
      <div className="rx-seg min-w-max" role="group" aria-label="Market source">
        <RexMarketSourceTab
          source="all"
          label="All"
          isActive={dataSource === "all"}
          onClick={() => setDataSource("all")}
        />
        <RexMarketSourceTab
          source="predictfun"
          label="Predict.fun"
          isActive={dataSource === "predictfun"}
          onClick={() => setDataSource("predictfun")}
          icon={
            <span className="flex size-4 sm:size-5 shrink-0 items-center justify-center">
              <Image
                src={
                  dataSource === "predictfun"
                    ? PREDICT_FUN_LOGO_SRC
                    : PREDICT_FUN_TAB_ICON_SRC
                }
                alt=""
                width={20}
                height={20}
                className="max-h-4 max-w-4 sm:max-h-5 sm:max-w-5 object-contain"
              />
            </span>
          }
        />
        <RexMarketSourceTab
          source="kalshi"
          label="Kalshi"
          isActive={dataSource === "kalshi"}
          onClick={() => setDataSource("kalshi")}
          icon={
            <span className="flex size-4 sm:size-5 shrink-0 items-center justify-center font-bold leading-none text-[15px] sm:text-[18px] text-inherit">
              K
            </span>
          }
        />
        <RexMarketSourceTab
          source="polymarket"
          label="Polymarket"
          isActive={dataSource === "polymarket"}
          onClick={() => setDataSource("polymarket")}
          icon={
            <span className="flex size-4 sm:size-5 shrink-0 items-center justify-center">
              <Image
                src="/images/polymarket.png"
                alt=""
                width={20}
                height={20}
                className="max-h-4 max-w-4 sm:max-h-5 sm:max-w-5 object-contain"
              />
            </span>
          }
        />
        <RexMarketSourceTab
          source="limitless"
          label="Limitless"
          isActive={dataSource === "limitless"}
          onClick={() => setDataSource("limitless")}
          icon={
            <span className="flex size-4 sm:size-5 shrink-0 items-center justify-center">
              <Image
                src="/images/limitless-logo-new-white.webp"
                alt=""
                width={20}
                height={20}
                className="max-h-4 max-w-4 sm:max-h-5 sm:max-w-5 object-contain"
              />
            </span>
          }
        />
        <RexMarketSourceTab
          source="myriad"
          label="Myriad"
          isActive={dataSource === "myriad"}
          onClick={() => setDataSource("myriad")}
          icon={
            <span className="flex size-4 sm:size-5 shrink-0 items-center justify-center">
              <Image
                src="/images/myriad.webp"
                alt=""
                width={20}
                height={20}
                className="max-h-4 max-w-4 sm:max-h-5 sm:max-w-5 object-contain"
              />
            </span>
          }
        />
      </div>
    </div>
  );
}

export default function RexHeader({
  onHistoryClick,
  onExchangeClick,
  showExchangeButton = false,
  onLogout: externalOnLogout,
  title,
  description,
  mobileMenuButton,
  clawV5MainNavShiftPx,
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
  const isMarketDetailPage =
    isRexMarketsPage && pathname.split("/").filter(Boolean).length >= 3;
  const isClawV5Page =
    pathname === "/claw-v5" || pathname.startsWith("/claw-v5/");
  const isRexScreenerPage = isRexScreenerPathname(pathname);
  const { dataSource, setDataSource } = useDataSource();
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
        : "Market Overview");
  const displayDescription =
    description ||
    (isClawV5Page
      ? "AI-powered chat assistant."
      : isRexMarketsPage
        ? "Prediction Intelligence by your side."
        : "Real time insights powered by Claw AI 5.0.");

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showPolymarketModal, setShowPolymarketModal] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  // Redesign: the green topbar strip is no longer rendered. Report it as hidden so
  // layouts that size around it (e.g. the screener table height) use the no-strip values.
  const { setTopbarVisible } = useTopbar();
  useEffect(() => {
    setTopbarVisible(false);
  }, [setTopbarVisible]);
  const [isMobile, setIsMobile] = useState(false);
  const [isMdUp, setIsMdUp] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // 640px is Tailwind's sm breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsMdUp(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const clawV5DesktopNavShiftPx =
    isClawV5Page && isMdUp && typeof clawV5MainNavShiftPx === "number"
      ? clawV5MainNavShiftPx
      : 0;

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

  // Check for query parameter to open Polymarket modal after redirect
  // Using client-side only approach to avoid Suspense boundary requirement
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isRexMarketsPage) {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("openPolymarketModal") === "true") {
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

  const clawAiHeaderButton = (
    <button
      type="button"
      className="rx-btn rx-btn--claw rx-btn--s shrink-0"
      onClick={handleHistoryClick}
      aria-label="Claw AI 5.0: report history"
    >
      <Image
        src="/images/claw-mini.svg"
        alt=""
        width={17}
        height={17}
        className="claw-ico"
      />
      Claw AI 5.0
    </button>
  );

  const exchangeButton = showExchangeButton ? (
    <button
      type="button"
      className="rx-btn rx-btn--exchange rx-btn--s"
      onClick={onExchangeClick}
    >
      Enter the Exchange
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </button>
  ) : null;

  return (
    <>
      <div className="w-full flex flex-col z-20">
        {/* Redesign: the green "Intelligent Terminal" strip is removed per the brief (slide 2). */}
        {/* Live prediction odds strip above the header (hidden on phones) */}
        <PredictionsTicker className="hidden md:flex" />
        <header className="rx-header">
          <div className="rx-header__logo">
            <Image
              src="/images/raptorx-logo.svg"
              alt="RaptorX"
              width={64}
              height={50}
              priority
            />
          </div>

          {/* Desktop / tablet navigation */}
          <nav
            className="rx-header__nav hidden sm:flex"
            aria-label="Main"
            style={
              clawV5DesktopNavShiftPx !== 0
                ? { transform: `translateX(${clawV5DesktopNavShiftPx}px)` }
                : undefined
            }
          >
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
                if (!isClawV5Page) {
                  markClawV5ScrollToInput();
                  router.push("/claw-v5");
                }
              }}
              aria-current={isClawV5Page ? "page" : undefined}
              className="rx-nav-link"
            >
              Claw AI 5.0
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
          </nav>

          {/* Mobile navigation: compact segmented control */}
          <nav className="sm:hidden flex-1 min-w-0" aria-label="Main">
            <div className="rx-seg rx-seg--gold w-full max-w-[300px] mx-auto">
              <button
                type="button"
                onClick={() => {
                  if (!isRexScreenerPage) router.push(REX_SCREENER_ALL_HREF);
                }}
                aria-current={isRexScreenerPage ? "page" : undefined}
                className={clsx(
                  "rx-seg__item flex-1 min-w-0 justify-center px-1.5 text-[12px]",
                  isRexScreenerPage && "is-active",
                )}
              >
                Screener
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
                className={clsx(
                  "rx-seg__item flex-1 min-w-0 justify-center px-1.5 text-[12px]",
                  isClawV5Page && "is-active",
                )}
              >
                Claw AI
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isRexMarketsPage) router.push("/rexmarkets");
                }}
                aria-current={
                  isRexMarketsPage && !isClawV5Page ? "page" : undefined
                }
                className={clsx(
                  "rx-seg__item flex-1 min-w-0 justify-center px-1.5 text-[12px]",
                  isRexMarketsPage && !isClawV5Page && "is-active",
                )}
              >
                Predictions
              </button>
            </div>
          </nav>

          {/* Right: Deposit & account; above the claw-v5 nav shift so it keeps its clicks */}
          <div className="rx-header__actions relative z-30 shrink-0">
            {authenticated && isRexMarketsPage && (
              <button
                type="button"
                onClick={() => setShowDepositModal(true)}
                className="rx-btn rx-btn--primary hidden sm:inline-flex"
                title="Deposit & Withdraw"
              >
                Deposit
              </button>
            )}

            {!authenticated ? (
              <button
                type="button"
                onClick={handleSignIn}
                className="rx-btn rx-btn--primary"
              >
                Log in
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserDropdown((prev) => !prev)}
                  className="rx-account-btn"
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={showUserDropdown}
                >
                  <User className="size-5" aria-hidden="true" />
                </button>

                {showUserDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowUserDropdown(false)}
                    />
                    <div className="rx-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowAccountModal(true);
                          fetchUser();
                        }}
                        className="rx-menu__item"
                      >
                        <User aria-hidden="true" />
                        Profile
                      </button>
                      {isRexMarketsPage && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowUserDropdown(false);
                            setShowDepositModal(true);
                          }}
                          className="rx-menu__item sm:hidden"
                        >
                          <Wallet aria-hidden="true" />
                          Deposit
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserDropdown(false);
                          // If not on rexmarkets page, redirect first, then open modal
                          if (!isRexMarketsPage) {
                            router.push("/rexmarkets?openPolymarketModal=true");
                          } else {
                            setShowPolymarketModal(true);
                          }
                        }}
                        className="rx-menu__item"
                      >
                        <ClipboardList aria-hidden="true" />
                        My Orders
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {!isClawV5Page && (
          <div className="rx-page-head">
            <div className="rx-page-head__title">
              <h1>{displayTitle}</h1>
              <p>{displayDescription}</p>
            </div>
            <div className="rx-page-head__actions">
              {isRexMarketsPage && !isMarketDetailPage && (
                <RexMarketSourceTabs
                  dataSource={dataSource}
                  setDataSource={setDataSource}
                />
              )}
              {exchangeButton}
              {clawAiHeaderButton}
            </div>
          </div>
        )}
      </div>
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        currentUser={currentUser}
        isLoadingUser={isLoadingUser}
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
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
      />
    </>
  );
}
