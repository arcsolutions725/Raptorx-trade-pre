/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { GenerateRexscreenerReport } from "@/components/rexscreener/generatereport";
import { TrendingTable } from "@/components/rexscreener/trendingtable";
import { DailyTasksPopup } from "@/components/leaderboard/DailyTaskPopup";
import { LeaderboardModal } from "@/components/leaderboard/LeaderboradModal";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import type { Report } from "@/lib/storage/storage-util";
import Image from "next/image";
import { X } from "lucide-react";

export default function Home() {
  const { authenticated, user: privyUser, ready } = usePrivy();

  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showCompactReport, setShowCompactReport] = useState(false);
  const [showDailyTasksPopup, setShowDailyTasksPopup] = useState(false);
  const [hasShownDailyTasks, setHasShownDailyTasks] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  /* ------------------------------------------------------------------ */
  /*  Technical-indicator: coin-selection state                         */
  /* ------------------------------------------------------------------ */
  const [selectedToken, setSelectedToken] = useState<TrendingToken | null>(
    null
  );
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<
    string | null
  >(null);
  const [isViewingChart, setIsViewingChart] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      if (!ready) return;
      if (!authenticated || !privyUser?.id) {
        setCurrentUserId("");
        setIsAdmin(false);
        return;
      }
      setLoadingUser(true);
      try {
        const email =
          // adjust if your Privy object structures email differently
          (privyUser as any)?.email?.address ||
          (privyUser as any)?.email ||
          undefined;

        // Check for referral code in URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const referralCode = urlParams.get("referralcode");

        const res = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            privyId: privyUser.id,
            email,
            ...(referralCode && { referralCode }),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data?.user?.id || "");
          setIsAdmin(!!data?.isAdmin);

          // Show daily tasks popup on login (only once per session)
          if (data?.user?.id && !hasShownDailyTasks) {
            setTimeout(() => {
              setShowDailyTasksPopup(true);
              setHasShownDailyTasks(true);
            }, 1500); // Show after 1.5 seconds
          }

          // Clear referral code from URL after processing (for new users)
          if (referralCode && data?.isNewUser) {
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
          }
        } else {
          setCurrentUserId("");
          setIsAdmin(false);
        }
      } catch {
        setCurrentUserId("");
        setIsAdmin(false);
      } finally {
        setLoadingUser(false);
      }
    };
    fetchUser();
  }, [authenticated, privyUser?.id, ready]);

  const handleReportGenerated = (report: Report) => {
    setGeneratedReport(report);
    setShowCompactReport(true);
  };

  const handleTokenSelect = (
    token: TrendingToken | null,
    address: string | null,
    viewing: boolean
  ) => {
    console.log(
      "[handleTokenSelect]",
      viewing ? "SELECT" : "DESELECT",
      token?.name ?? token?.symbol ?? "unknown",
      address
    );

    setSelectedToken(token);
    setSelectedTokenAddress(address);
    setIsViewingChart(viewing);
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col md:flex-row items-start"
      aria-busy={loadingUser} // ✅ read the state so TS is happy
      data-loading-user={loadingUser || undefined} // optional hook for styling/debug
    >
      <div className="w-full lg:w-[55%]">
        <TrendingTable
          onReportGenerated={handleReportGenerated}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onTokenSelect={handleTokenSelect}
        />
      </div>

      <div className="w-full lg:w-[45%] lg:block max-[1440px]:hidden bg-black">
        <GenerateRexscreenerReport
          generatedReport={generatedReport}
          selectedToken={selectedToken}
          tokenAddress={selectedTokenAddress}
          isViewingChart={isViewingChart}
        />
      </div>

      <div
        className={[
          "lg:hidden fixed inset-0 z-30 bg-black transition-transform duration-300 ease-out",
          showCompactReport ? "translate-y-0" : "-translate-y-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={() => setShowCompactReport(false)}
          className="absolute top-3 right-3 z-40 px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white"
          aria-label="Close AI Report"
        >
          ✕
        </button>

        <div className="absolute inset-0 overflow-auto">
          <GenerateRexscreenerReport
            generatedReport={generatedReport}
            selectedToken={selectedToken}
            tokenAddress={selectedTokenAddress}
            isViewingChart={isViewingChart}
          />
        </div>
      </div>

      {/* Fixed Action Buttons - Always visible when user is logged in */}
      {currentUserId && (
        <div className="fixed bottom-12 left-4 z-40 flex flex-col gap-3">
          {/* Daily Tasks Button */}
          <button
            onClick={() => setShowDailyTasksPopup(true)}
            className="text-white font-semibold shadow-lg transition-all duration-200 cursor-pointer"
            aria-label="Open Daily Tasks"
            title="Daily Missions"
          >
            <Image
              src={"/images/dailymissions.png"}
              alt="leaderboard"
              width={105}
              height={51}
            />
          </button>

          {/* Leaderboard Button */}
          <button
            onClick={() => setShowLeaderboard(true)}
            className="text-white font-semibold shadow-lg transition-all duration-200 cursor-pointer"
            aria-label="Open Leaderboard"
            title="Global Leaderboard"
          >
            <Image
              src={"/images/leaderboard.png"}
              alt="leaderboard"
              width={105}
              height={51}
            />
          </button>
        </div>
      )}

      <button
        onClick={() => setShowCompactReport((v) => !v)}
        className="lg:hidden fixed bottom-4 right-4 z-40 px-[10px] py-2 rounded-full border border-white bg-black text-white font-semibold shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
        aria-label="Toggle AI Report"
        disabled={loadingUser} // ✅ another read; prevents toggling during user fetch
      >
        {showCompactReport ? (
          <X width={30} height={30} color="#fff" />
        ) : (
          <Image
            src={"/images/report-btn.png"}
            alt="AI Report"
            width={45}
            height={45}
          />
        )}
      </button>

      {/* Daily Tasks Popup */}
      <DailyTasksPopup
        userId={currentUserId}
        isOpen={showDailyTasksPopup}
        onClose={() => setShowDailyTasksPopup(false)}
      />

      {/* Leaderboard Modal */}
      <LeaderboardModal
        currentUserId={currentUserId}
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />
    </div>
  );
}
