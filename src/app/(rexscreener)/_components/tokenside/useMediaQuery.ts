"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Phones: the Rex Pilot sidebar opens as a bottom sheet (design/css/pages.css, max-width 767px). */
export const PHONE_MQ = "(max-width: 767px)";

/** Whether a media query matches now (false on the server and in the first client render). */
export function matchesMedia(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

/** Live media-query match. The server snapshot is false, so the first render matches the server's. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
