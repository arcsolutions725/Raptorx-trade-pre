"use client";

import { useEffect, useLayoutEffect, useState, useCallback, Suspense } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { useParams, useRouter } from "next/navigation";
import RexHeader from "@/components/ui/layout/Header";
import {
  MarketPageLoading,
  MarketPageMessage,
} from "../../_components/RexMarketsReport/RexMarketsReportData/shared/marketUi";
import Footer from "@/components/ui/layout/Footer";
import LimitlessTradingInterface from "../../_components/RexMarketsReport/RexMarketsReportData/LimitlessTradingInterface";
import { RexMarketsReport } from "../../_components";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useMarketDetails } from "@/hooks/useMarketDetails";
import {
  peekPendingGeneratedReport,
  clearPendingGeneratedReport,
} from "@/lib/rexmarkets/pendingGeneratedReport";
import { useOpenPilotSidebarOnMobileReportGen } from "@/hooks/useOpenPilotSidebarOnMobileReportGen";
import { RexMarketsGenerateReportProvider } from "../../_components/RexMarketsGenerateReportContext";
import {
  PILOT_SIDEBAR_ID,
  PilotSidebarLayout,
  usePilotSidebar,
} from "../../_components/RexMarketsReport/shared/PilotSidebarLayout";

function LimitlessEventPageContent() {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [marketTitle, setMarketTitle] = useState<string | null>(null);
  const [totalVolume, setTotalVolume] = useState<number>(0);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventTicker, setEventTicker] = useState<string | null>(null);
  // Rex Pilot sidebar: open on desktop, closed on phones / tablets (decided before the first paint)
  const pilotSidebar = usePilotSidebar();
  const {
    open: showReportSidebar,
    setOpen: setShowReportSidebar,
    toggle: togglePilot,
  } = pilotSidebar;
  const [generatedReport, setGeneratedReport] = useState<MarketReport | null>(null);

  const params = useParams();
  const router = useRouter();
  const {
    authenticated: privyAuthenticated,
    user: privyUser,
    ready,
  } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } =
    usePhantomConnect();

  const authenticated = privyAuthenticated || phantomAuthenticated;
  const event_slug = params?.event as string | undefined;

  const {
    marketDetails,
    isLoading: isLoadingDetails,
    isError,
    error,
  } = useMarketDetails(null, null, event_slug || null);

  useEffect(() => {
    if (marketDetails) {
      setMarketTitle(marketDetails.title || null);
      setTotalVolume(marketDetails.total_volume || marketDetails.total_series_volume || 0);
      setEventId(marketDetails.event_id || marketDetails.id || null);
      setEventTicker(marketDetails.ticker || marketDetails.series_ticker || event_slug || null);
    }
  }, [marketDetails, event_slug]);

  useEffect(() => {
    const fetchUser = async () => {
      if (!authenticated) {
        setCurrentUserId("");
        return;
      }

      const privyId = privyUser?.id;
      const phantomId = phantomUser?.id;
      const authId = privyId || phantomId;

      if (!authId) {
        setCurrentUserId("");
        return;
      }

      setLoadingUser(true);
      try {
        const res = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(privyId ? { privyId } : { phantomId }),
          }),
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data.user?.id || "");
        } else {
          setCurrentUserId("");
        }
      } catch {
        setCurrentUserId("");
      } finally {
        setLoadingUser(false);
      }
    };

    if (ready) {
      fetchUser();
    }
  }, [authenticated, ready, privyUser?.id, phantomUser?.id]);

  useLayoutEffect(() => {
    const report = peekPendingGeneratedReport();
    if (!report) return;
    setGeneratedReport(report);
    setShowReportSidebar(true);
    const t = window.setTimeout(() => clearPendingGeneratedReport(), 400);
    return () => clearTimeout(t);
  }, []);

  const handleReportGenerated = useCallback((report: MarketReport) => {
    setGeneratedReport(report);
    setShowReportSidebar(true);
  }, []);

  const handleBack = useCallback(() => {
    router.push("/rexmarkets");
  }, [router]);

  useOpenPilotSidebarOnMobileReportGen(eventTicker, setShowReportSidebar);

  if (isLoadingDetails) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <RexHeader showExchangeButton={false} />
        <div className="flex-1 flex items-center justify-center">
          <MarketPageLoading />
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !marketDetails) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <RexHeader showExchangeButton={false} />
        <div className="flex-1 flex items-center justify-center">
          <MarketPageMessage title={error?.message || "Failed to load market data"} />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <RexMarketsGenerateReportProvider>
      <PilotSidebarLayout
        sidebar={pilotSidebar}
        busy={loadingUser}
        header={
          <RexHeader
            onHistoryClick={togglePilot}
            showExchangeButton={false}
            onLogout={() => {
              setCurrentUserId("");
            }}
          />
        }
        footer={<Footer />}
        report={
          <RexMarketsReport
            generatedReport={generatedReport}
            userId={currentUserId}
            selectedMarketTicker={eventTicker}
            selectedMarketTitle={marketTitle}
            selectedMarketVolume={totalVolume}
            selectedMarketEventId={eventId}
            onClose={pilotSidebar.close}
            onClearSessionReport={() => setGeneratedReport(null)}
            onParkBoth={pilotSidebar.park}
            paneRequest={pilotSidebar.paneRequest}
          />
        }
      >
        <LimitlessTradingInterface
          eventTicker={eventTicker}
          marketTitle={marketTitle}
          totalVolume={totalVolume}
          eventId={eventId}
          onBack={handleBack}
          onReportGenerated={handleReportGenerated}
          userId={currentUserId}
          sessionSavedReportId={generatedReport?.id ?? null}
          onPilotToggle={togglePilot}
          pilotOpen={showReportSidebar}
          pilotControlsId={PILOT_SIDEBAR_ID}
        />
      </PilotSidebarLayout>
    </RexMarketsGenerateReportProvider>
  );
}

export default function LimitlessEventPage() {
  return (
    <Suspense fallback={
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <RexHeader showExchangeButton={false} />
        <div className="flex-1 flex items-center justify-center">
          <MarketPageLoading label="Loading..." />
        </div>
      </div>
    }>
      <LimitlessEventPageContent />
    </Suspense>
  );
}
