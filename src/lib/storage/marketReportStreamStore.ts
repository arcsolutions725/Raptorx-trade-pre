"use client";

import { useSyncExternalStore } from "react";

type Snapshot = { key: string | null; text: string };

const empty: Snapshot = { key: null, text: "" };
let state: Snapshot = { ...empty };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const marketReportStreamStore = {
  start(key: string) {
    state = { key, text: "" };
    emit();
  },
  append(text: string) {
    if (!state.key) return;
    state = { ...state, text: state.text + text };
    emit();
  },
  clear() {
    state = { ...empty };
    emit();
  },
  getSnapshot(): Snapshot {
    return state;
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

export function useMarketReportStream(key?: string | null) {
  const snap = useSyncExternalStore(
    marketReportStreamStore.subscribe,
    marketReportStreamStore.getSnapshot,
    () => empty,
  );
  const active = Boolean(key && snap.key === key);
  return { partialText: active ? snap.text : "", isStreamForKey: active };
}
