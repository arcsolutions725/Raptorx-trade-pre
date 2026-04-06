"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { GenerateRexscreenerReport } from "@/components/rexscreener/generatereport";
import { TrendingTable } from "@/components/rexscreener/trendingtable";
import { DailyTasksPopup } from "@/components/leaderboard/DailyTaskPopup";
import { LeaderboardModal } from "@/components/leaderboard/LeaderboradModal";
import RexHeader from "@/components/ui/layout/Header";
import type { TrendingToken, Chain } from "@/hooks/useTrendingTokens";
import type { Report } from "@/lib/storage/storage-util";
import Image from "next/image";
import Footer from "@/components/ui/layout/Footer";

interface PrivyUserWithEmail {
  id: string;
  email?:
    | {
        address?: string;
      }
    | string;
}

export default function Home() {
  const { authenticated: privyAuthenticated, user: privyUser, ready } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();
  
  // Combined authentication state
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
  const [selectedChain, setSelectedChain] = useState<Chain>("all");

  const hasShownDailyTasksRef = useRef(false);

  const userEmail = useMemo(() => {
    // Check Phantom user first, then Privy
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

      // Determine which auth provider to use
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
            ...(privyUser?.id ? { privyId: privyUser.id } : { phantomId: phantomUser!.id }),
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
            setTimeout(() => {
              setShowDailyTasksPopup(true);
            }, 1500);
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
  }, [ready, authenticated, privyUser?.id, phantomUser?.id, userEmail, referralCode, privyAuthenticated, phantomAuthenticated]);

  const handleReportGenerated = useCallback(
    (report: Report, token?: TrendingToken | null) => {
      setGeneratedReport(report);
      setShowReportSidebar(true);
      setForceShowExchange(true);
      // When generating from table row, open chart in left panel and set token for swap widget
      if (token) {
        setSelectedToken(token);
        setSelectedTokenAddress(token?.tokenAddress ?? null);
        setIsViewingChart(true);
      }
    },
    []
  );

  const handleTokenSelect = useCallback(
    (token: TrendingToken | null, address: string | null, viewing: boolean) => {
      setSelectedToken(token);
      setSelectedTokenAddress(address);
      setIsViewingChart(viewing);
      if (viewing) {
        // On mobile, keep sidebar closed so the chart (DexscreenerView) shows full screen.
        // On desktop (lg+), show sidebar side-by-side with chart.
        const isMobile =
          typeof window !== "undefined" && window.innerWidth < 1024;
        if (!isMobile) {
          setShowReportSidebar(true);
          setForceShowExchange(true);
        } else {
          setShowReportSidebar(false);
          setForceShowExchange(false);
        }
      } else {
        setShowReportSidebar(false);
        setForceShowExchange(false);
      }
    },
    []
  );

  const handleLogout = useCallback(() => {
    setCurrentUserId("");
    setIsAdmin(false);
    hasShownDailyTasksRef.current = false;
  }, []);

  const toggleReportSidebar = useCallback(() => {
    setShowReportSidebar((v) => !v);
  }, []);

  const openReportSidebar = useCallback(() => {
    setShowReportSidebar(true);
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

  // Prevent body scroll on mobile when sidebar is open
  useEffect(() => {
    if (showReportSidebar && typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        // Store the current scroll position
        const scrollY = window.scrollY;
        // Lock body scroll
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        
        return () => {
          // Restore scroll position
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          window.scrollTo(0, scrollY);
        };
      }
    }
  }, [showReportSidebar]);

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      aria-busy={loadingUser}
      data-loading-user={loadingUser || undefined}
    >
      <div className="flex-1 flex relative overflow-hidden">
        {/* Main content - Left side on desktop when sidebar is open */}
        <div
          className={`h-full flex flex-col w-full transition-[width] duration-500 ease-in-out ${
            showReportSidebar ? "main-content-shrink" : ""
          }`}
        >
          {/* Header */}
          <RexHeader
            onHistoryClick={toggleReportSidebar}
            onExchangeClick={openExchangePanel}
            showExchangeButton={true}
            onLogout={handleLogout}
          />

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            <TrendingTable
              onReportGenerated={handleReportGenerated}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onTokenSelect={handleTokenSelect}
              onChainChange={setSelectedChain}
              externalTokenForChart={selectedToken}
              externalViewingChart={isViewingChart}
            />
          </div>
          <Footer />
        </div>

        {/* Rex Pilot - Right side on desktop, overlay on mobile */}
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
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            maxHeight: '100dvh', // Use dynamic viewport height for mobile
          }}
        >
          <div className="h-full overflow-y-auto overflow-x-hidden bg-[#141414] custom-sidebar-scrollbar" style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
            maxHeight: '100dvh', // Use dynamic viewport height for mobile
          }}>
            <GenerateRexscreenerReport
              generatedReport={generatedReport}
              selectedToken={selectedToken}
              tokenAddress={selectedTokenAddress}
              isViewingChart={isViewingChart}
              selectedChain={selectedChain}
              hideHeader={true}
              onClose={closeReportSidebar}
              forceShowExchange={forceShowExchange}
            />
          </div>
        </div>

        {/* Overlay - only on mobile */}
        {showReportSidebar && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-50"
            onClick={closeReportSidebar}
            aria-hidden="true"
            style={{ touchAction: 'none' }}
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
  );
}
