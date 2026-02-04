"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { useParams, useRouter } from "next/navigation";
import RexHeader from "@/components/ui/layout/Header";
import Footer from "@/components/ui/layout/Footer";
import PolymarketTradingInterface from "../../_components/RexMarketsReport/RexMarketsReportData/PolymarketTradingInterface";
import { RexMarketsReport } from "../../_components";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useMarketDetails } from "@/hooks/useMarketDetails";

function PolymarketEventPageContent() {
  const params = useParams();
  const router = useRouter();
  const { authenticated: privyAuthenticated, user: privyUser, ready } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();
  
  // Combined authentication state
  const authenticated = privyAuthenticated || phantomAuthenticated;

  const eventSlug = params?.event as string | undefined;
  
  const [generatedReport, setGeneratedReport] = useState<MarketReport | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [marketTitle, setMarketTitle] = useState<string | null>(null);
  const [totalVolume, setTotalVolume] = useState<number>(0);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventTicker, setEventTicker] = useState<string | null>(null);
  const [showReportSidebar, setShowReportSidebar] = useState(true);

  const { marketDetails, isLoading: isLoadingDetails, isError, error } = useMarketDetails(
    null, // eventTicker - not needed when using slug
    undefined, // eventId - not needed when using slug
    eventSlug || null // slug - this is the route parameter
  );

  // Update state when market details are loaded
  useEffect(() => {
    if (marketDetails) {
      setMarketTitle(marketDetails.title || null);
      setTotalVolume(marketDetails.total_volume || 0);
      setEventId(marketDetails.event_id || null);
      setEventTicker(marketDetails.ticker || marketDetails.series_ticker || null);
    }
  }, [marketDetails]);

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

  const handleBack = useCallback(() => {
    router.push("/rexmarkets");
  }, [router]);

  if (isLoadingDetails) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="h-full flex flex-col w-full">
            <RexHeader
              onHistoryClick={() => {}}
              showExchangeButton={false}
              onLogout={() => {
                setCurrentUserId("");
              }}
            />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-white text-lg">Loading market data...</div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  if (!eventSlug) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="h-full flex flex-col w-full">
            <RexHeader
              onHistoryClick={() => {}}
              showExchangeButton={false}
              onLogout={() => {
                setCurrentUserId("");
              }}
            />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-white text-lg">Invalid market URL</div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  if (isError || (!isLoadingDetails && !marketDetails)) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="h-full flex flex-col w-full">
            <RexHeader
              onHistoryClick={() => {}}
              showExchangeButton={false}
              onLogout={() => {
                setCurrentUserId("");
              }}
            />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-white text-lg">
                {error?.message || "Market not found"}
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      aria-busy={loadingUser}
      data-loading-user={loadingUser || undefined}
    >
      <div className="flex-1 flex overflow-hidden">
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
            <PolymarketTradingInterface
              eventTicker={eventTicker}
              marketTitle={marketTitle || undefined}
              totalVolume={totalVolume}
              eventId={eventId || undefined}
              onBack={handleBack}
              onReportGenerated={handleReportGenerated}
              userId={currentUserId}
            />
          </div>
          <Footer />
        </div>

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
              selectedMarketTicker={eventTicker}
              selectedMarketTitle={marketTitle}
              selectedMarketVolume={totalVolume}
              selectedMarketEventId={eventId}
              onClose={() => setShowReportSidebar(false)}
            />
          </div>
        </div>

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

export default function PolymarketEventPage() {
  return (
    <Suspense fallback={
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white text-lg">Loading...</div>
        </div>
      </div>
    }>
      <PolymarketEventPageContent />
    </Suspense>
  );
}

