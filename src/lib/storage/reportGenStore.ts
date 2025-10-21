"use client";
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const state = new Map<string, number>(); // address -> startedAt (ms)

function emit() {
  for (const l of listeners) l();
}

export const reportGenStore = {
  start(addr: string) {
    if (!addr) return;
    const now = Date.now();
    state.set(addr, now);
    emit();
  },
  finish(addr: string) {
    if (!addr) return;
    if (state.delete(addr)) emit();
  },
  getStartedAt(addr?: string): number {
    if (!addr) return 0;
    return state.get(addr) ?? 0;
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    // IMPORTANT: cleanup must return void
    return () => {
      listeners.delete(cb);
    };
  },
};

export function useReportGenStatus(address?: string) {
  const startedAt = useSyncExternalStore(
    reportGenStore.subscribe,
    () => reportGenStore.getStartedAt(address), // primitive snapshot
    () => 0
  );
  return {
    isGenerating: startedAt > 0,
    startedAt: startedAt > 0 ? startedAt : null,
  };
}
