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
import { User, Wallet, ClipboardList, X } from "lucide-react";
import { useTopbar } from "@/contexts/TopbarContext";
import { useDataSource } from "@/contexts/DataSourceContext";
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
  | "all"
  | "predictfun"
  | "kalshi"
  | "polymarket"
  | "limitless"
  | "myriad";

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
      className={clsx(
        "flex items-center justify-center gap-1 shrink-0 px-2.5 sm:px-4 h-10 text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors duration-200 border-b-2 sm:border-b-0 sm:rounded-[10px]",
        isActive
          ? clsx("font-semibold", theme.desktopActive)
          : "text-white/70 border-transparent hover:text-white/90",
      )}
      style={
        isActive
          ? ({
              color: theme.hex,
              borderBottomColor: theme.hex,
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
    <div className="w-full min-w-0 max-w-full overflow-x-auto scrollbar-none border-b border-white/10 sm:w-auto sm:overflow-visible sm:border-b-0">
      <div className="inline-flex min-w-max items-center sm:bg-white/12 sm:p-0.5 sm:rounded-xl">
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
    isRexMarketsPage &&
    pathname.split("/").filter(Boolean).length >= 3;
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
  const { isTopbarVisible: showTopbar, setTopbarVisible: setShowTopbar } =
    useTopbar();
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

  // Topbar uses mx-auto on full width; main column sits right of the chat sidebar — nudge right on md+ so the line tracks that column (collapsed vs expanded use different offsets).
  const CLAW_V5_TOPBAR_EXPANDED_EXTRA_SHIFT_PX = 20;
  const CLAW_V5_TOPBAR_COLLAPSED_SHIFT_PX = 16;
  const clawV5TopbarShiftPx =
    isClawV5Page && isMdUp && typeof clawV5MainNavShiftPx === "number"
      ? clawV5MainNavShiftPx !== 0
        ? clawV5MainNavShiftPx + CLAW_V5_TOPBAR_EXPANDED_EXTRA_SHIFT_PX
        : CLAW_V5_TOPBAR_COLLAPSED_SHIFT_PX
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
      className="shrink-0 cursor-pointer transition hover:scale-[1.05]"
      onClick={handleHistoryClick}
    >
      <Image
        src={"/images/btn_claw-ai.png"}
        alt="Claw AI — report history"
        width={120}
        height={50}
        className="w-22 h-10.25 sm:w-20 sm:h-8.25 md:w-25 md:h-10"
      />
    </button>
  );

  return (
    <>
      <div className="w-full flex flex-col z-20">
        {/* Topbar */}
        {showTopbar && (
          <div className="w-full flex items-center px-3 sm:px-5 py-2 bg-linear-to-b from-[#002008] to-[#00761E] relative">
            <div
              className="mx-auto flex min-w-0 max-w-[calc(100%-2.75rem)] items-center gap-2 px-1 transition-transform duration-300 ease-in-out"
              style={
                clawV5TopbarShiftPx !== 0
                  ? { transform: `translateX(${clawV5TopbarShiftPx}px)` }
                  : undefined
              }
            >
              {/* <Info className="w-4 h-4 text-white" /> */}
              <span className="text-center text-sm font-normal text-white [overflow-wrap:anywhere]">
                The Intelligent Terminal for Prediction Markets & Crypto.
              </span>
            </div>
            <button
              onClick={() => setShowTopbar(false)}
              className="absolute right-3 sm:right-5 p-1 hover:bg-white/10 rounded transition"
              aria-label="Close topbar"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        <div className="w-full flex justify-between items-center px-3 sm:px-5 py-2.5 bg-[#141414] border-b-[0.5px] border-[#B58405]">
          <div className="flex items-end shrink-0">
            <Image
              src={"/images/raptorx.png"}
              alt="RaptorX Logo"
              width={100}
              height={100}
              className="w-13 h-11 sm:w-17.75 sm:h-15 md:w-18.25 md:h-15.5"
            />
          </div>

          {/* Center navigation */}
          <div className="flex-1 min-w-0 px-2 sm:px-4">
            {/* Mobile: compact segmented control (no fixed widths) */}
            <div className="sm:hidden w-full">
              <div className="w-full max-w-65 mx-auto bg-white/12 p-1 rounded-xl flex items-center gap-1">
                <button
                  onClick={() => {
                    if (!isRexScreenerPage) router.push(REX_SCREENER_ALL_HREF);
                  }}
                  className={`flex-1 min-w-0 h-9 rounded-[10px] text-[11px] font-semibold transition-colors truncate ${
                    isRexScreenerPage
                      ? "bg-[#ffc000] text-black border border-[#B58405]"
                      : "bg-transparent text-white/80"
                  }`}
                >
                  RexScreener
                </button>
                <button
                  onClick={() => {
                    if (!isClawV5Page) router.push("/claw-v5");
                  }}
                  className={`flex-1 min-w-0 h-9 rounded-[10px] text-[11px] font-semibold transition-colors truncate ${
                    isClawV5Page
                      ? "bg-[#ffc000] text-black border border-[#B58405]"
                      : "bg-transparent text-white/80"
                  }`}
                >
                  Claw AI 5.0
                </button>
                <button
                  onClick={() => {
                    if (!isRexMarketsPage) router.push("/rexmarkets");
                  }}
                  className={`flex-1 min-w-0 h-9 rounded-[10px] text-[11px] font-semibold transition-colors truncate ${
                    isRexMarketsPage && !isClawV5Page
                      ? "bg-[#ffc000] text-black border border-[#B58405]"
                      : "bg-transparent text-white/80"
                  }`}
                >
                  Rex Predictions
                </button>
              </div>
            </div>

            {/* Desktop/tablet: existing animated slider; shift on claw-v5 so center tracks main column (md+). */}
            <div
              className="hidden sm:flex justify-center transition-transform duration-300 ease-in-out"
              style={
                clawV5DesktopNavShiftPx !== 0
                  ? { transform: `translateX(${clawV5DesktopNavShiftPx}px)` }
                  : undefined
              }
            >
              <div className="relative inline-flex items-center">
                <div
                  className="relative flex items-center bg-white/12 p-0.5"
                  style={{ width: "360px", borderRadius: "12px" }}
                >
                  <div
                    className="absolute top-1 bottom-1 bg-[#ffc000] shadow-md"
                    style={{
                      left: isRexScreenerPage
                        ? "3px"
                        : isClawV5Page
                          ? "126px"
                          : "237px",
                      width: isRexScreenerPage
                        ? "121px"
                        : isClawV5Page
                          ? "110px"
                          : "118px",
                      height: "40px",
                      borderRadius: "12px",
                      border: "0.5px solid #B58405",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      willChange: "left, width",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
                    }}
                  />

                  {/* Buttons Container — order: RexScreener, Claw AI 5.0, Rex Predictions */}
                  <div className="relative flex items-center justify-center w-full h-full py-0.5 px-0.5">
                    <button
                      onClick={() => {
                        if (!isRexScreenerPage) router.push(REX_SCREENER_ALL_HREF);
                      }}
                      className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center ${
                        isRexScreenerPage
                          ? "text-black font-semibold"
                          : "text-white/70 hover:text-white/90"
                      }`}
                      style={{
                        width: "121px",
                        height: "40px",
                        borderRadius: "12px",
                      }}
                    >
                      RexScreener
                    </button>
                    <button
                      onClick={() => {
                        if (!isClawV5Page) {
                          router.push("/claw-v5");
                        }
                      }}
                      className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center ${
                        isClawV5Page
                          ? "text-black font-semibold"
                          : "text-white/70 hover:text-white/90"
                      }`}
                      style={{
                        width: "110px",
                        height: "40px",
                        borderRadius: "12px",
                      }}
                    >
                      Claw AI 5.0
                    </button>
                    <button
                      onClick={() => {
                        if (!isRexMarketsPage) {
                          router.push("/rexmarkets");
                        }
                      }}
                      className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center ${
                        isRexMarketsPage && !isClawV5Page
                          ? "text-black font-semibold"
                          : "text-white/70 hover:text-white/90"
                      }`}
                      style={{
                        width: "118px",
                        height: "40px",
                        borderRadius: "12px",
                      }}
                    >
                      Rex Predictions
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Deposit & Login — above claw-v5 pill nav translateX overlap (pill would steal clicks) */}
          <div className="relative z-30 flex shrink-0 items-center gap-2 sm:gap-4">
            {/* Deposit Button - Only show when authenticated and on rexmarkets page; hidden on mobile (use avatar dropdown instead) */}
            {authenticated && isRexMarketsPage && (
              <button
                onClick={() => setShowDepositModal(true)}
                className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-[#ffc000] hover:bg-[#ffd000] text-black font-semibold text-sm transition"
                aria-label="Deposit"
                title="Deposit & Withdraw"
              >
                Deposit
              </button>
            )}

            {/* Login/Account Button */}
            {!authenticated ? (
              <button
                onClick={handleSignIn}
                className="w-14 sm:w-15 h-10 rounded-xl flex items-center justify-center bg-[#ffc000] text-black font-bold text-[14px] cursor-pointer transition hover:bg-[#ffd000]"
              >
                Login
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown((prev) => !prev)}
                  className="rounded-full border border-[#ffc000] p-1"
                >
                  <User color="#ffc000" />
                </button>
                {showUserDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowUserDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#0D0D0D] border border-white/10 rounded-lg shadow-xl z-40 overflow-hidden py-1">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowAccountModal(true);
                          fetchUser();
                        }}
                        className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors text-sm font-medium flex items-center gap-3"
                      >
                        <User className="w-4 h-4 shrink-0 text-white/70" />
                        Profile
                      </button>
                      {isRexMarketsPage && (
                        <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setShowDepositModal(true);
                          }}
                          className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors text-sm font-medium flex items-center gap-3 sm:hidden"
                        >
                          <Wallet className="w-4 h-4 shrink-0 text-white/70" />
                          Deposit
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          // If not on rexmarkets page, redirect first, then open modal
                          if (!isRexMarketsPage) {
                            router.push("/rexmarkets?openPolymarketModal=true");
                          } else {
                            setShowPolymarketModal(true);
                          }
                        }}
                        className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors text-sm font-medium flex items-center gap-3"
                      >
                        <ClipboardList className="w-4 h-4 shrink-0 text-white/70" />
                        My Orders
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {!isClawV5Page && (
          <div
            className={`w-full pt-6 px-3 sm:px-5 ${
              isRexMarketsPage
                ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                : "flex flex-row justify-between items-center gap-1 sm:gap-4"
            }`}
          >
            {isRexMarketsPage ? (
              <>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-start">
                  <div className="flex min-w-0 flex-col items-start text-left">
                    <h1 className="text-[14px]! sm:text-[18px]! font-semibold! text-[#ffc000]">
                      {displayTitle}
                    </h1>
                    <p className="block max-w-full text-[12px]! sm:text-[14px]! font-normal! text-[#7A7A7A]">
                      {displayDescription}
                    </p>
                  </div>
                  <div className="sm:hidden">{clawAiHeaderButton}</div>
                </div>

                <div className="flex w-full flex-row items-center justify-center gap-2 sm:w-auto sm:min-w-0 sm:justify-end sm:gap-3">
                  {!isMarketDetailPage && (
                    <RexMarketSourceTabs
                      dataSource={dataSource}
                      setDataSource={setDataSource}
                    />
                  )}
                  {showExchangeButton && (
                    <button
                      className="cursor-pointer transition hover:scale-[1.05]"
                      onClick={onExchangeClick}
                    >
                      <Image
                        src={"/images/exchange.png"}
                        alt="Enter The Exchange."
                        width={140}
                        height={80}
                        className="w-25 h-[39.5px] sm:w-20 sm:h-8 md:w-25 md:h-[38.5px]"
                      />
                    </button>
                  )}
                  <div className="hidden sm:block">{clawAiHeaderButton}</div>
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-col">
                  <h1 className="text-[14px]! sm:text-[18px]! font-semibold! text-[#ffc000]">
                    {displayTitle}
                  </h1>
                  <p className="block max-w-40 text-[12px]! sm:max-w-full sm:text-[14px]! font-normal! text-[#7A7A7A]">
                    {displayDescription}
                  </p>
                </div>

                <div className="flex flex-row items-center gap-1 sm:gap-3">
                  {showExchangeButton && (
                    <button
                      className="cursor-pointer transition hover:scale-[1.05]"
                      onClick={onExchangeClick}
                    >
                      <Image
                        src={"/images/exchange.png"}
                        alt="Enter The Exchange."
                        width={140}
                        height={80}
                        className="w-25 h-[39.5px] sm:w-20 sm:h-8 md:w-25 md:h-[38.5px]"
                      />
                    </button>
                  )}
                  {clawAiHeaderButton}
                </div>
              </>
            )}
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
