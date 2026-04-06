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
}

export default function RexHeader({
  onHistoryClick,
  onExchangeClick,
  showExchangeButton = false,
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
  const isMarketDetailPage =
    isRexMarketsPage &&
    pathname.split("/").filter(Boolean).length >= 3;
  const isClawV5Page =
    pathname === "/claw-v5" || pathname.startsWith("/claw-v5/");
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
        ? "Rex Markets"
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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // 640px is Tailwind's sm breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  return (
    <>
      <div className="w-full flex flex-col z-20">
        {/* Topbar */}
        {showTopbar && (
          <div className="w-full flex items-center px-3 sm:px-5 py-2 bg-linear-to-b from-[#002008] to-[#00761E] relative">
            <div className="flex items-center gap-2 mx-auto">
              {/* <Info className="w-4 h-4 text-white" /> */}
              <span className="text-white text-sm font-normal">
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
                    if (isClawV5Page || isRexMarketsPage) router.push("/");
                  }}
                  className={`flex-1 min-w-0 h-9 rounded-[10px] text-[11px] font-semibold transition-colors truncate ${
                    !isRexMarketsPage && !isClawV5Page
                      ? "bg-[#ffc000] text-black border border-[#B58405]"
                      : "bg-transparent text-white/80"
                  }`}
                >
                  RexScreener
                </button>
                <button
                  onClick={() => {
                    if (!isRexMarketsPage && !isClawV5Page)
                      router.push("/rexmarkets");
                  }}
                  className={`flex-1 min-w-0 h-9 rounded-[10px] text-[11px] font-semibold transition-colors truncate ${
                    isRexMarketsPage && !isClawV5Page
                      ? "bg-[#ffc000] text-black border border-[#B58405]"
                      : "bg-transparent text-white/80"
                  }`}
                >
                  Markets
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
              </div>
            </div>

            {/* Desktop/tablet: existing animated slider */}
            <div className="hidden sm:flex justify-center">
              <div className="relative inline-flex items-center">
                <div
                  className="relative flex items-center bg-white/12 p-0.5"
                  style={{ width: "340px", borderRadius: "12px" }}
                >
                  <div
                    className="absolute top-1 bottom-1 bg-[#ffc000] shadow-md"
                    style={{
                      left: isClawV5Page
                        ? "225px"
                        : isRexMarketsPage
                          ? "124px"
                          : "3px",
                      width: isClawV5Page
                        ? "110px"
                        : isRexMarketsPage
                          ? "100px"
                          : "119px",
                      height: "40px",
                      borderRadius: "12px",
                      border: "0.5px solid #B58405",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      willChange: "left, width",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
                    }}
                  />

                  {/* Buttons Container */}
                  <div className="relative flex items-center justify-center w-full h-full py-0.5 px-0.5">
                    <button
                      onClick={() => {
                        if (isClawV5Page || isRexMarketsPage) {
                          router.push("/");
                        }
                      }}
                      className={`relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center ${
                        !isRexMarketsPage && !isClawV5Page
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
                        width: "100px",
                        height: "40px",
                        borderRadius: "12px",
                      }}
                    >
                      Rex Markets
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
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Deposit & Login */}
          <div className="flex items-center gap-2 sm:gap-4">
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
          <div className="w-full flex flex-row sm:flex-row justify-between items-center gap-1 sm:gap-4 pt-6 px-3 sm:px-5">
            <div className="flex flex-col">
              <h1 className="text-[18px]! font-semibold! text-[#ffc000]">
                {displayTitle}
              </h1>
              <p className={`block text-[12px]! sm:text-[14px]! font-normal! text-[#7A7A7A] ${isRexMarketsPage ? "max-w-30" : "max-w-40" } sm:max-w-full`}>
                {displayDescription}
              </p>
            </div>

            {/* Right: Exchange Button & Report History Button */}
            <div className="flex flex-row gap-1 sm:gap-3 items-center">
              {isRexMarketsPage && !isMarketDetailPage && (
                <>
                  <div className="inline-flex items-center bg-white/12 p-0.5 rounded-xl">
                    <button
                      onClick={() => setDataSource("all")}
                      className={`font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center px-3 sm:px-4 h-10 rounded-[10px] ${
                        dataSource === "all"
                          ? "bg-[#ffc000] text-black font-semibold"
                          : "text-white/70 hover:text-white/90"
                      }`}
                    >
                      <span>All</span>
                    </button>
                    <button
                      onClick={() => setDataSource("kalshi")}
                        className={`font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center gap-0 sm:gap-1.5 px-3 sm:px-4 h-10 rounded-[10px] ${
                          dataSource === "kalshi"
                            ? "bg-[#17cb91] text-black font-semibold"
                            : "text-white/70 hover:text-white/90"
                        }`}
                      >
                        <span className="text-white font-bold text-lg">K</span>
                        <span className="hidden sm:inline ml-1">Kalshi</span>
                      </button>
                      <button
                        onClick={() => setDataSource("polymarket")}
                        className={`font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center gap-0 sm:gap-1.5 px-3 sm:px-4 h-10 rounded-[10px] ${
                          dataSource === "polymarket"
                            ? "bg-[#2C59F7] text-white font-semibold"
                            : "text-white/70 hover:text-white/90"
                        }`}
                      >
                        <Image
                          src="/images/polymarket.png"
                          alt="Polymarket"
                          width={16}
                          height={16}
                          className="w-4 h-4"
                        />
                        <span className="hidden sm:inline ml-1">
                          Polymarket
                        </span>
                      </button>
                      <button
                        onClick={() => setDataSource("limitless")}
                        className={`font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center gap-1 px-3 sm:px-4 h-10 rounded-[10px] ${
                          dataSource === "limitless"
                            ? "bg-black text-white font-semibold"
                            : "text-white/70 hover:text-white/90"
                        }`}
                      >
                        <Image
                          src="/images/limitless-logo.png"
                          alt="Limitless logo"
                          width={16}
                          height={16}
                          className="w-4 h-4"
                        />
                        <span className="hidden sm:inline">Limitless</span>
                      </button>
                  </div>
                </>
              )}
              {showExchangeButton && (
                <button
                  className="cursor-pointer transition hover:scale-[1.05]"
                  onClick={onExchangeClick}
                >
                  <Image
                    src={"/images/exchange.png"}
                    alt="Enter the exchange"
                    width={140}
                    height={80}
                    className="w-25 h-10 sm:w-20 sm:h-8.5 md:w-25 md:h-10"
                  />
                </button>
              )}
              <button
                className="cursor-pointer transition hover:scale-[1.05]"
                onClick={handleHistoryClick}
              >
                <Image
                  src={"/images/AI-pilot.png"}
                  alt="report history"
                  width={120}
                  height={50}
                  className="w-22 h-10.25 sm:w-20 sm:h-8.25 md:w-25 md:h-10"
                />
              </button>
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
