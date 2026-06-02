"use client";

import { useEffect } from "react";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";

/** lg breakpoint matches Rex Pilot overlay (`lg:hidden` backdrop, etc.). */
const MOBILE_MAX = "(max-width: 1023px)";

/**
 * When a report starts streaming, open the Rex Pilot / markets pilot sidebar on mobile
 * so streaming content is visible (sidebar is often closed while viewing the chart/table).
 */
export function useOpenPilotSidebarOnMobileReportGen(
  lookupKey: string | null | undefined,
  setSidebarOpen: (open: boolean) => void,
) {
  const { isGenerating } = useReportGenStatus(lookupKey || undefined);

  useEffect(() => {
    if (!isGenerating) return;
    const key = lookupKey?.trim();
    if (!key) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia(MOBILE_MAX).matches) return;
    setSidebarOpen(true);
  }, [isGenerating, lookupKey, setSidebarOpen]);
}
