"use client";

import { useSyncExternalStore, type PropsWithChildren } from "react";

function subscribe() {
  return () => {};
}

export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

interface ClientOnlyProps extends PropsWithChildren {
  fallback?: React.ReactNode;
}

export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const hydrated = useHydrated();
  return hydrated ? children : fallback;
}