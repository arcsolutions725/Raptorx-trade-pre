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
 */
export function useReports(userId?: string) {
  const enabled = !!userId;
  const cacheList = userId ? ReportCache.getReports(userId) : null;

  return useQuery({
    queryKey: ["reports", userId],
    enabled,
    queryFn: async () => {
      const data = await fetchJSON("/api/reports", {
        headers: { "x-user-id": userId! },
      });
      const reports = (data.reports ?? []) as any[];
      ReportCache.setReports(userId!, reports); // write cache
      return reports;
    },
    initialData: cacheList ?? undefined,
    staleTime: 5 * 60 * 1000, // 5 min fresh
    gcTime: 30 * 60 * 1000, // 30 min in cache (TanStack v5)
    refetchOnWindowFocus: false, // <-- stop refetch on tab focus
    refetchOnReconnect: false, // <-- stop refetch on reconnect
    refetchInterval: false,
  });
}

/**
 * Single report with conversation
 * - Reads initialData from localStorage if available
 * - No refetch on focus/reconnect
 * - Writes to localStorage on success
 */
export function useReportWithConversation(userId?: string, id?: string | null) {
  const enabled = !!userId && !!id;
  const cacheItem = userId && id ? ReportCache.getReport(userId, id) : null;

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
    initialData: cacheItem ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false, // <-- stop refetch on tab focus
    refetchOnReconnect: false,
    refetchInterval: false,
  });
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
      // Update list cache
      qc.setQueryData<any[]>(["reports", userId], (prev) => {
        const next = (prev ?? []).filter((r) => r.id !== reportId);
        ReportCache.setReports(userId, next);
        return next;
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
