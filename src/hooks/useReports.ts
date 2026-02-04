/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReportCache } from "@/lib/storage/reportCache";

async function fetchJSON(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/**
 * List reports for a user
 * - Initial data from localStorage (if present)
 * - No refetch on window focus/reconnect
 * - Writes to localStorage on success
 * - Supports filtering by reportType: "crypto", "market", or "all" (default: "all")
 */
export function useReports(userId?: string, reportType: "crypto" | "market" | "all" = "all") {
  const enabled = !!userId;
  const cacheList = userId ? ReportCache.getReports(userId) : null;
  
  // Filter cached data by reportType if a specific type is requested
  // This ensures we don't show wrong report types from cache
  const filteredCache = cacheList && reportType !== "all"
    ? cacheList.filter((r: any) => r.reportType === reportType)
    : cacheList;

  return useQuery({
    queryKey: ["reports", userId, reportType],
    enabled,
    queryFn: async () => {
      const url = reportType === "all" 
        ? "/api/reports"
        : `/api/reports?reportType=${reportType}`;
      const data = await fetchJSON(url, {
        headers: { "x-user-id": userId! },
      });
      const reports = (data.reports ?? []) as any[];
      // Only cache if we got all reports, otherwise we'd overwrite with filtered data
      if (reportType === "all") {
        ReportCache.setReports(userId!, reports);
      }
      return reports;
    },
    // Use filtered cache as initial data, but always fetch fresh to ensure accuracy
    initialData: filteredCache ?? undefined,
    staleTime: 5 * 60 * 1000, // 5 min fresh - React Query will handle different reportTypes separately via queryKey
    gcTime: 30 * 60 * 1000, // 30 min in cache (TanStack v5)
    refetchOnWindowFocus: false, // <-- stop refetch on tab focus
    refetchOnReconnect: false, // <-- stop refetch on reconnect
    refetchInterval: false,
  });
}

/**
 * Single report with conversation
 * - Reads initialData from localStorage if available
 * - Validates cached data integrity (especially tweets)
 * - Forces refetch if critical data is missing
 */
export function useReportWithConversation(userId?: string, id?: string | null) {
  const enabled = !!userId && !!id;
  const cacheItem = userId && id ? ReportCache.getReport(userId, id) : null;

  // Validate cache integrity - check if tweets data might be incomplete
  const shouldBypassCache = cacheItem && isCacheDataIncomplete(cacheItem);

  return useQuery({
    queryKey: ["report", userId, id],
    enabled,
    queryFn: async () => {
      const data = await fetchJSON(`/api/reports/${id}`, {
        headers: { "x-user-id": userId! },
      });
      const report = data.report as any;
      ReportCache.setReport(userId!, id!, report); // write cache
      return report;
    },
    initialData: shouldBypassCache ? undefined : cacheItem ?? undefined,
    staleTime: shouldBypassCache ? 0 : 5 * 60 * 1000, // Force fresh data if cache is incomplete
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
}

/**
 * Checks if cached report data is incomplete and needs fresh fetch
 * Specifically looks for missing tweets data and BNB analytics data in reports that should have them
 */
function isCacheDataIncomplete(reportData: any): boolean {
  if (!reportData) return true;

  const content = reportData.content || "";

  // Check if tweets data is incomplete
  const hasTweetSection =
    content.includes("Individual Tweets") || content.includes("## 3.");
  const tweetsData = reportData.tweetsData;

  // If report should have tweets but doesn't, or has empty tweets array
  if (
    hasTweetSection &&
    (!tweetsData || (Array.isArray(tweetsData) && tweetsData.length === 0))
  ) {
    return true;
  }

  // Check if BNB token security data is incomplete (for BNB tokens only)
  const hasSecuritySection =
    content.includes("Safety Analytics") || content.includes("## 3.");
  const securityData = reportData.securityData;

  if (hasSecuritySection && !securityData && reportData.chain === "bsc") {
    return true;
  }

  // Check if BNB token holder data is incomplete (for BNB tokens only)
  const hasHolderSection =
    content.includes("Holder Analytics") || content.includes("## 2.");
  const holdersData = reportData.holdersData;

  if (hasHolderSection && !holdersData && reportData.chain === "bsc") {
    return true;
  }

  return false;
}

/**
 * Delete report
 * - Updates query cache & localStorage without a refetch
 */
export function useDeleteReport(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) =>
      fetchJSON(`/api/reports/${reportId}`, {
        method: "DELETE",
        headers: { "x-user-id": userId },
      }),
    onSuccess: (_data, reportId) => {
      // Get the report to determine its type before deleting
      const allReports = qc.getQueryData<any[]>(["reports", userId, "all"]) ?? [];
      const reportToDelete = allReports.find((r) => r.id === reportId);
      const reportType = reportToDelete?.reportType;

      // Update query cache for all reportTypes
      ["crypto", "market", "all"].forEach((type) => {
        qc.setQueryData<any[]>(["reports", userId, type], (prev) => {
          const next = (prev ?? []).filter((r) => r.id !== reportId);
          // Only update localStorage cache for "all" to avoid overwriting
          if (type === "all") {
            ReportCache.setReports(userId, next);
          }
          return next;
        });
      });

      // Remove item cache
      ReportCache.setReport(userId, reportId, null as any, 1); // expire quickly
      qc.removeQueries({ queryKey: ["report", userId, reportId] });
    },
  });
}

/**
 * Append message
 * - Optimistic update to query cache & localStorage
 * - No invalidation/refetch needed
 */
export function useAppendMessage(userId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      reportId: string;
      role: "user" | "assistant";
      content: string;
      timestamp?: string;
    }) =>
      fetchJSON(`/api/conversations/${args.reportId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify(args),
      }).then((d) => d.message),

    // Optimistic UI
    onMutate: async (vars) => {
      const { reportId, role, content, timestamp } = vars;

      // Cancel outgoing fetches for this query
      await qc.cancelQueries({ queryKey: ["report", userId, reportId] });

      // Snapshot previous
      const prev = qc.getQueryData<any>(["report", userId, reportId]);

      // Create a temp client id to avoid dupes before server returns id
      const tempId = `temp_${Date.now()}`;

      // Apply optimistic update
      qc.setQueryData<any>(["report", userId, reportId], (cur: any) => {
        if (!cur) return cur;
        const msgs = Array.isArray(cur?.conversation?.messages)
          ? [...cur.conversation.messages]
          : [];
        msgs.push({
          id: tempId,
          role,
          content,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
        });
        const next = {
          ...cur,
          conversation: { ...(cur.conversation || {}), messages: msgs },
        };
        ReportCache.setReport(userId, reportId, next);
        return next;
      });

      return { prev, tempId };
    },

    onError: (_err, vars, ctx) => {
      // Rollback
      if (!ctx?.prev) return;
      const { reportId } = vars;
      ReportCache.setReport(userId, reportId, ctx.prev);
      qc.setQueryData(["report", userId, reportId], ctx.prev);
    },

    onSuccess: (message, vars, ctx) => {
      const { reportId } = vars;
      // Replace temp message with the real one (with DB id)
      qc.setQueryData<any>(["report", userId, reportId], (cur: any) => {
        if (!cur) return cur;
        const msgs = Array.isArray(cur?.conversation?.messages)
          ? [...cur.conversation.messages]
          : [];

        const tempIdx = msgs.findIndex((m) => m.id === ctx?.tempId);
        if (tempIdx >= 0) msgs[tempIdx] = message;
        else msgs.push(message);

        const next = {
          ...cur,
          conversation: { ...(cur.conversation || {}), messages: msgs },
        };
        ReportCache.setReport(userId, reportId, next);
        return next;
      });
    },
  });
}
