/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReports, useDeleteReport } from "@/hooks/useReports";
import { useRegenerateReport } from "@/hooks/useRegenerateReport";
import { ReportCache } from "@/lib/storage/reportCache";
import {
  ReportHistoryView,
  buildReportHistoryItem,
  type ReportKindFilter,
} from "./ReportHistoryView";

interface ChatSidebarProps {
  userId: string;
  currentReportId?: string;
  onSelectReport: (reportId: string) => void;
  onClose?: () => void;
  reportType?: "crypto" | "market" | "all";
}

/**
 * The full report this browser already has (opened before), for the token's image and chain:
 * GET /api/reports lists reports without their DexScreener pair. React Query first, then the
 * persisted copy (read directly so an expired entry still lends its logo; nothing is written).
 */
function readCachedReport(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  reportId: string,
): Record<string, unknown> | null {
  const fromQuery = queryClient.getQueryData(["report", userId, reportId]);
  if (fromQuery && typeof fromQuery === "object") {
    return fromQuery as Record<string, unknown>;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      ReportCache.keys.report(userId, reportId),
    );
    if (!raw) return null;
    const data = JSON.parse(raw)?.data;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export default function ChatSidebar({
  userId,
  currentReportId,
  onSelectReport,
  onClose,
  reportType = "all",
}: ChatSidebarProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ReportKindFilter>("all");
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

  /** Rows for this drawer: its report type (client-side safety check), then the kind tab. */
  const items = useMemo(() => {
    let scoped = reports as any[];
    if (reportType !== "all") {
      scoped = scoped.filter((r: any) => r.reportType === reportType);
    }
    return scoped.map((r: any) =>
      buildReportHistoryItem(r, readCachedReport(queryClient, userId, String(r.id))),
    );
  }, [reports, reportType, queryClient, userId]);

  const filtered = useMemo(() => {
    const byKind =
      reportType === "all" && kindFilter !== "all"
        ? items.filter((it) => it.kind === kindFilter)
        : items;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byKind;
    return byKind.filter((it) => it.search.includes(q));
  }, [items, reportType, kindFilter, searchQuery]);

  async function handleDelete(id: string) {
    await deleteReport(id);
    setConfirmDelete(null);
    await refetch();
  }

  async function handleRegenerate(id: string) {
    const report = (reports as any[]).find((r: any) => String(r.id) === id);
    try {
      setRegeneratingId(id);
      setCountdown(100);
      // Reset hasRegenerated state for this report
      setHasRegenerated((prev) => ({
        ...prev,
        [id]: false,
      }));
      await regenerateReport({
        reportId: report?.id ?? id,
        streamContractAddress: report?.contractAddress,
      });
      // refetch is called in the onReportRegenerated callback
    } catch (err) {
      console.error("Failed to regenerate report:", err);
      setRegeneratingId(null);
      setCountdown(null);
    }
  }

  return (
    <ReportHistoryView
      scope={reportType}
      items={filtered}
      loading={isLoading}
      query={searchQuery}
      onQueryChange={setSearchQuery}
      kind={kindFilter}
      onKindChange={setKindFilter}
      currentId={currentReportId}
      regeneratingId={regeneratingId}
      countdown={countdown}
      regenerated={hasRegenerated}
      confirmDeleteId={confirmDelete}
      deleting={deleting}
      onOpen={(id) => onSelectReport(id)}
      onRegenerate={(id) => {
        if (regeneratingId !== id) handleRegenerate(id);
      }}
      onAskDelete={(id) => setConfirmDelete(id)}
      onCancelDelete={() => setConfirmDelete(null)}
      onConfirmDelete={(id) => handleDelete(id)}
      onClose={onClose}
    />
  );
}
