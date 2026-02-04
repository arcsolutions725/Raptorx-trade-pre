"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { RexMarketsReport, RexMarketsTable } from "./_components";
import RexHeader from "@/components/ui/layout/Header";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import Footer from "@/components/ui/layout/Footer";

export default function RexMarketsPage() {
  const { authenticated: privyAuthenticated, user: privyUser, ready } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();
  
  // Combined authentication state
  const authenticated = privyAuthenticated || phantomAuthenticated;

  const [generatedReport, setGeneratedReport] = useState<MarketReport | null>(
    null
  );
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [selectedMarketTicker, setSelectedMarketTicker] = useState<
    string | null
  >(null);
  const [selectedMarketTitle, setSelectedMarketTitle] = useState<string | null>(
    null
  );
  const [showReportSidebar, setShowReportSidebar] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      if (!ready && !phantomAuthenticated) return;
      if (!authenticated) {
        setCurrentUserId("");
        return;
      }

      // Determine which auth provider to use
      const authId = privyUser?.id || phantomUser?.id;
      if (!authId) {
        setCurrentUserId("");
        return;
      }

      setLoadingUser(true);
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
            ...(privyUser?.id ? { privyId: privyUser.id } : { phantomId: phantomUser!.id }),
            email: email,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data?.user?.id || "");
        } else {
          setCurrentUserId("");
        }
      } catch {
        setCurrentUserId("");
      } finally {
        setLoadingUser(false);
      }
    };
    fetchUser();
  }, [ready, authenticated, privyUser?.id, phantomUser?.id, privyAuthenticated, phantomAuthenticated]);

  const handleReportGenerated = useCallback((report: MarketReport) => {
    setGeneratedReport(report);
    setShowReportSidebar(true);
  }, []);

  const [selectedMarketVolume, setSelectedMarketVolume] = useState<number>(0);

  const [selectedMarketEventId, setSelectedMarketEventId] = useState<string | null>(null);

  const handleMarketSelected = useCallback(
    (eventTicker: string, marketTitle: string, totalVolume: number, eventId?: string) => {
      setSelectedMarketTicker(eventTicker);
      setSelectedMarketTitle(marketTitle);
      setSelectedMarketVolume(totalVolume);
      setSelectedMarketEventId(eventId || null);
      setShowReportSidebar(true);
    },
    []
  );

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      aria-busy={loadingUser}
      data-loading-user={loadingUser || undefined}
    >
      <div className="flex-1 flex overflow-hidden">
        {/* Main content - Left side on desktop when sidebar is open */}
        <div
          className={`h-full flex flex-col w-full transition-[width] duration-500 ease-in-out ${
            showReportSidebar ? "main-content-shrink" : ""
          }`}
        >
          <RexHeader
            onHistoryClick={() => setShowReportSidebar((v) => !v)}
            showExchangeButton={false}
            onLogout={() => {
              setCurrentUserId("");
            }}
          />

          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<div className="flex items-center justify-center h-full">Loading markets...</div>}>
              <RexMarketsTable
                onReportGenerated={handleReportGenerated}
                currentUserId={currentUserId}
                onMarketSelected={handleMarketSelected}
              />
            </Suspense>
          </div>
          <Footer />
        </div>

        {/* Rex Pilot - Right side on desktop, overlay on mobile */}
        <div
          className={`fixed top-0 right-0 h-screen lg:h-full w-full sm:w-[500px] lg:w-[700px] bg-black z-[60] lg:z-auto transform transition-transform duration-500 ease-in-out ${
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
            <RexMarketsReport
              generatedReport={generatedReport}
              userId={currentUserId}
              selectedMarketTicker={selectedMarketTicker}
              selectedMarketTitle={selectedMarketTitle}
              selectedMarketVolume={selectedMarketVolume}
              selectedMarketEventId={selectedMarketEventId}
              onClose={() => setShowReportSidebar(false)}
            />
          </div>
        </div>

        {/* Overlay - only on mobile */}
        {showReportSidebar && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowReportSidebar(false)}
            aria-hidden="true"
            style={{ touchAction: 'none' }}
          />
        )}
      </div>
    </div>
  );
}
