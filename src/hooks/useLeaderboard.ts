import { useState, useEffect, useCallback } from "react";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

interface LeaderboardPagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalUsers: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<LeaderboardPagination>({
    page: 1,
    pageSize: 25,
    totalPages: 1,
    totalUsers: 0,
    hasNext: false,
    hasPrev: false,
  });

  const fetchLeaderboard = useCallback(async (page = 1, pageSize = 25) => {
    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/leaderboard", window.location.origin);
      url.searchParams.set("page", page.toString());
      url.searchParams.set("pageSize", pageSize.toString());

      const response = await fetch(url.toString());

      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data.leaderboard);
        setPagination(data.pagination);
      } else {
        setError("Failed to fetch leaderboard");
      }
    } catch (err) {
      setError("Failed to fetch leaderboard");
      console.error("Leaderboard error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const getUserRank = (userId: string): number | null => {
    const userEntry = leaderboard.find((entry) => entry.id === userId);
    return userEntry?.rank || null;
  };

  const nextPage = useCallback(() => {
    if (pagination.hasNext) {
      fetchLeaderboard(pagination.page + 1, pagination.pageSize);
    }
  }, [
    fetchLeaderboard,
    pagination.hasNext,
    pagination.page,
    pagination.pageSize,
  ]);

  const prevPage = useCallback(() => {
    if (pagination.hasPrev) {
      fetchLeaderboard(pagination.page - 1, pagination.pageSize);
    }
  }, [
    fetchLeaderboard,
    pagination.hasPrev,
    pagination.page,
    pagination.pageSize,
  ]);

  const setPageIndex = useCallback(
    (page: number) => {
      if (page >= 1 && page <= pagination.totalPages) {
        fetchLeaderboard(page, pagination.pageSize);
      }
    },
    [fetchLeaderboard, pagination.totalPages, pagination.pageSize]
  );

  const setPageSize = useCallback(
    (size: number) => {
      fetchLeaderboard(1, size); // Reset to page 1 when changing page size
    },
    [fetchLeaderboard]
  );

  return {
    leaderboard,
    loading,
    error,
    pagination,
    refresh: () => fetchLeaderboard(pagination.page, pagination.pageSize),
    getUserRank,
    nextPage,
    prevPage,
    setPageIndex,
    setPageSize,
  };
}
