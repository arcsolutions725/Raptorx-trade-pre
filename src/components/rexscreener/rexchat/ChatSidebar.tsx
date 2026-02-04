/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useReports, useDeleteReport } from "@/hooks/useReports";
import { useRegenerateReport } from "@/hooks/useRegenerateReport";

interface ChatSidebarProps {
  userId: string;
  currentReportId?: string;
  onSelectReport: (reportId: string) => void;
  onClose?: () => void;
  reportType?: "crypto" | "market" | "all";
}

export default function ChatSidebar({
  userId,
  currentReportId,
  onSelectReport,
  onClose,
  reportType = "all",
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasRegenerated, setHasRegenerated] = useState<Record<string, boolean>>(
    {}
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Add ref to track regeneration timeouts
  const regenTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  const { data: reports = [], isLoading, refetch } = useReports(userId, reportType);
  const { mutateAsync: deleteReport, isPending: deleting } =
    useDeleteReport(userId);

  const {
    isRegenerating,
    error: regenerateError,
    regenerateReport,
  } = useRegenerateReport({
    userId,
    onReportRegenerated: () => {
      setHasRegenerated((prev) => ({
        ...prev,
        [regeneratingId as string]: true,
      }));
      setRegeneratingId(null);
      refetch();
    },
  });

  // Auto-hide "Regenerated!" message after 2 seconds
  useEffect(() => {
    // Check for any newly regenerated reports
    Object.entries(hasRegenerated).forEach(([reportId, isRegenerated]) => {
      if (isRegenerated) {
        // Clear any existing timeout for this report
        if (regenTimeoutsRef.current[reportId]) {
          clearTimeout(regenTimeoutsRef.current[reportId]);
        }

        // Set a new timeout to hide the "Regenerated!" message after 2 seconds
        regenTimeoutsRef.current[reportId] = setTimeout(() => {
          setHasRegenerated((prev) => ({
            ...prev,
            [reportId]: false,
          }));
        }, 2000);
      }
    });

    // Cleanup function
    return () => {
      // Clear all timeouts when component unmounts or dependencies change
      Object.values(regenTimeoutsRef.current).forEach((timeout) =>
        clearTimeout(timeout)
      );
    };
  }, [hasRegenerated]);

  // Start countdown when regeneration begins
  useEffect(() => {
    if (regeneratingId && countdown === null) {
      setCountdown(100);
    } else if (!regeneratingId && countdown !== null) {
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [regeneratingId, countdown]);

  // Countdown timer logic
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return regeneratingId ? 100 : null;
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [countdown, regeneratingId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // clear all regen timers
      Object.values(regenTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  const filtered = useMemo(() => {
    // First filter by reportType (client-side safety check)
    let filteredReports = reports;
    if (reportType !== "all") {
      filteredReports = reports.filter((r: any) => r.reportType === reportType);
    }
    
    // Then filter by search query
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredReports;
    return filteredReports.filter((r: any) => {
      const pName = (r.projectName || "").toLowerCase();
      return (
        r.ticker.toLowerCase().includes(q) ||
        r.contractAddress.toLowerCase().includes(q) ||
        pName.includes(q)
      );
    });
  }, [reports, searchQuery, reportType]);

  const formatAbsolute = (date: Date) =>
    `${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })} ${date.toLocaleDateString("en-US")}`;

  async function handleDelete(id: string) {
    await deleteReport(id);
    setConfirmDelete(null);
    await refetch();
  }

  async function handleRegenerate(id: string) {
    try {
      setRegeneratingId(id);
      setCountdown(100);
      // Reset hasRegenerated state for this report
      setHasRegenerated((prev) => ({
        ...prev,
        [id]: false,
      }));
      await regenerateReport({ reportId: id });
      // refetch is called in the onReportRegenerated callback
    } catch (err) {
      console.error("Failed to regenerate report:", err);
      setRegeneratingId(null);
      setCountdown(null);
    }
  }

  function formatRelativeTime(iso: string | Date): string {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return (
    <div className="w-80 shrink-0 bg-[#1D1D22] border-r border-white/10 flex flex-col h-full shadow-2xl">
      <div className="relative p-4 border-b border-black/10">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
            aria-label="Close sidebar"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
        <input
          type="text"
          placeholder="Search reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-white text-black text-[14px] placeholder-black rounded-lg outline-none focus:ring-2 focus:ring-white/50 mt-15"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-[#1D1D22] custom-sidebar-scrollbar">
        {isLoading ? (
          <div className="text-gray-400 text-center py-10">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="font-medium">
              {searchQuery ? "No reports match your search" : "No reports yet"}
            </p>
            <p className="text-sm mt-1">
              Generate your first report to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r: any) => {
              const updated = new Date(r.updatedAt);
              const isRegeneratingThis = regeneratingId === r.id;
              const hasRegeneratedThis = hasRegenerated[r.id];
              return (
                <div key={r.id} className="relative">
                  <button
                    onClick={() => onSelectReport(r.id)}
                    className={`w-full text-left p-3 rounded-lg transition-all duration-200 group ${
                      currentReportId === r.id
                        ? "bg-[#ffc000] border-2 border-white shadow-md"
                        : "bg-[#ffc000] hover:bg-gray-100 border-2 border-transparent hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] uppercase tracking-wide text-black/70">
                        last generated
                      </p>
                      <span
                        className="text-[11px] uppercase tracking-wide text-black/70"
                        aria-label={`Last generated ${formatRelativeTime(
                          updated
                        )} ago`}
                      >
                        {formatRelativeTime(updated)}
                      </span>
                    </div>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Show report title prominently */}
                        {r.reportType === "market" && r.projectName ? (
                          <div className="mb-1">
                            <span className="text-black font-bold text-[16px] block truncate">
                              {r.projectName}
                            </span>
                            <span className="text-black/70 text-[12px]">
                              {r.ticker}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-black font-bold text-[16px]">
                              ${r.ticker}
                            </span>
                            {r.projectName ? (
                              <span className="text-black/70 text-[12px] truncate">
                                {r.projectName}
                              </span>
                            ) : null}
                          </div>
                        )}
                        {r.reportType !== "market" && (
                          <div className="text-gray-700 font-mono text-[12px]">
                            {r.contractAddress.slice(0, 6)}…
                            {r.contractAddress.slice(-4)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className="text-black text-[11px]"
                          title={formatAbsolute(new Date(r.createdAt))}
                        >
                          {formatAbsolute(new Date(r.createdAt))}
                        </span>

                        <div className="flex items-center">
                          {/* Regenerate button with countdown */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isRegeneratingThis) {
                                handleRegenerate(r.id);
                              }
                            }}
                            className={`opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 rounded transition-all mr-1 ${
                              isRegeneratingThis || hasRegeneratedThis
                                ? "opacity-100"
                                : "cursor-pointer"
                            }`}
                            title="Re-generate report"
                            role="button"
                          >
                            {isRegeneratingThis && countdown !== null ? (
                              <div className="flex flex-col items-center">
                                <div className="text-black font-bold text-sm animate-pulse">
                                  {countdown}s
                                </div>
                              </div>
                            ) : hasRegeneratedThis ? (
                              <div className="flex items-center justify-center rounded-sm bg-[#FFD700] px-1">
                                <span className="text-black !font-bold text-xs">
                                  Regenerated!
                                </span>
                              </div>
                            ) : (
                              <svg
                                className="w-4 h-4 text-blue-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                              </svg>
                            )}
                          </div>

                          {/* Delete button */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(r.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                            title="Delete report"
                            role="button"
                          >
                            <svg
                              className="w-4 h-4 text-red-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {confirmDelete === r.id && (
                    <div className="absolute inset-0 bg-white/95 rounded-lg flex items-center justify-center z-10 backdrop-blur">
                      <div className="text-center p-4">
                        <p className="text-gray-700 font-medium mb-1">
                          Delete this report?
                        </p>
                        <p className="text-gray-500 text-sm mb-1">
                          This action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deleting}
                            className="px-2 py-1 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition disabled:opacity-60"
                          >
                            {deleting ? "Deleting…" : "Delete"}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
