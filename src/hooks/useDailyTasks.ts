import { useState, useEffect, useCallback } from "react";
import type { DailyTasksStatus } from "@/app/api/daily-tasks/route";

export function useDailyTasks(userId: string) {
  const [tasks, setTasks] = useState<DailyTasksStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/daily-tasks", {
        headers: { "x-user-id": userId },
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
      } else {
        setError("Failed to fetch daily tasks");
      }
    } catch (err) {
      console.error("Daily tasks error:", err);
      setError("Failed to fetch daily tasks");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchTasks();
    }
  }, [userId, fetchTasks]);

  return {
    tasks,
    loading,
    error,
    refresh: fetchTasks,
  };
}
