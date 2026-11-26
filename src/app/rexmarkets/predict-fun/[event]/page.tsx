"use client";

import { useEffect, useLayoutEffect, useState, useCallback, Suspense } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { useParams, useRouter } from "next/navigation";
import { useDataSource } from "@/contexts/DataSourceContext";
import RexHeader from "@/components/ui/layout/Header";
import {
  MarketPageLoading,
  MarketPageMessage,
} from "../../_components/RexMarketsReport/RexMarketsReportData/shared/marketUi";
import Footer from "@/components/ui/layout/Footer";
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
import PredictFunTradingInterface from "../../_components/RexMarketsReport/RexMarketsReportData/PredictFunTradingInterface";

function PredictFunEventPageContent() {
  const params = useParams();
  const router = useRouter();
  const { authenticated: privyAuthenticated, user: privyUser, ready } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } = usePhantomConnect();

  const authenticated = privyAuthenticated || phantomAuthenticated;
  const { setDataSource } = useDataSource();

  useEffect(() => {
    setDataSource("predictfun");
  }, [setDataSource]);

  const rawSegment = params?.event as string | undefined;
  let marketId = rawSegment?.trim() || "";
  try {
    if (marketId) marketId = decodeURIComponent(marketId);
  } catch {
    /* use raw */
  }

  const [generatedReport, setGeneratedReport] = useState<MarketReport | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [marketTitle, setMarketTitle] = useState<string | null>(null);
  const [totalVolume, setTotalVolume] = useState<number>(0);
  // Rex Pilot sidebar: open on desktop, closed on phones / tablets (decided before the first paint)
  const pilotSidebar = usePilotSidebar();
  const {
    open: showReportSidebar,
    setOpen: setShowReportSidebar,
    toggle: togglePilot,
  } = pilotSidebar;

  const { marketDetails, isLoading: isLoadingDetails, isError, error } = useMarketDetails(
    marketId || null,
    null,
    marketId || null
  );

  useEffect(() => {
    if (marketDetails) {
      setMarketTitle(marketDetails.title || null);
      const outcomeVol = (marketDetails.markets ?? []).reduce(
        (sum, m) => sum + (m.volume_24h ?? m.volume ?? 0),
        0
      );
      setTotalVolume(
        marketDetails.total_volume ||
          outcomeVol ||
          marketDetails.total_series_volume ||
          0
      );
    }
  }, [marketDetails]);

  useEffect(() => {
    const fetchUser = async () => {
      if (!ready && !phantomAuthenticated) return;
      if (!authenticated) {
        setCurrentUserId("");
        return;
      }
      const authId = privyUser?.id || phantomUser?.id;
      if (!authId) {
        setCurrentUserId("");
        return;
      }
      setLoadingUser(true);
      try {
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
            email,
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

  useOpenPilotSidebarOnMobileReportGen(marketId || null, setShowReportSidebar);

  if (isLoadingDetails) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="h-full flex flex-col w-full">
            <RexHeader
              onHistoryClick={() => {}}
              showExchangeButton={false}
              onLogout={() => setCurrentUserId("")}
            />
            <div className="flex-1 flex items-center justify-center">
              <MarketPageLoading />
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  if (!marketId) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="h-full flex flex-col w-full">
            <RexHeader
              onHistoryClick={() => {}}
              showExchangeButton={false}
              onLogout={() => setCurrentUserId("")}
            />
            <div className="flex-1 flex items-center justify-center">
              <MarketPageMessage title="Invalid market URL" />
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
              onLogout={() => setCurrentUserId("")}
            />
            <div className="flex-1 flex items-center justify-center">
              <MarketPageMessage title={error?.message || "Market not found"} />
            </div>
            <Footer />
          </div>
        </div>
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
            onLogout={() => setCurrentUserId("")}
          />
        }
        footer={<Footer />}
        report={
          <RexMarketsReport
            generatedReport={generatedReport}
            userId={currentUserId}
            selectedMarketTicker={marketId}
            selectedMarketTitle={marketTitle}
            selectedMarketVolume={totalVolume}
            selectedMarketEventId={null}
            onClose={pilotSidebar.close}
            onClearSessionReport={() => setGeneratedReport(null)}
            onParkBoth={pilotSidebar.park}
            paneRequest={pilotSidebar.paneRequest}
          />
        }
      >
        <PredictFunTradingInterface
          marketId={marketId}
          marketTitle={marketTitle || undefined}
          totalVolume={totalVolume}
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

export default function PredictFunEventPage() {
  return (
    <Suspense
      fallback={
        <div className="relative w-full h-screen flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center">
            <MarketPageLoading label="Loading..." />
          </div>
        </div>
      }
    >
      <PredictFunEventPageContent />
    </Suspense>
  );
}
