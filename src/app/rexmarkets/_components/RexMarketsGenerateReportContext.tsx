"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type GenerateHandler = (() => void | Promise<void>) | null;

type RexMarketsGenerateReportContextValue = {
  registerGenerateHandler: (fn: GenerateHandler) => void;
  triggerGenerate: () => Promise<void>;
};

const RexMarketsGenerateReportContext =
  createContext<RexMarketsGenerateReportContextValue | null>(null);

export function RexMarketsGenerateReportProvider({
  children,
}: {
  children: ReactNode;
}) {
  const handlerRef = useRef<NonNullable<GenerateHandler>>(null);

  const registerGenerateHandler = useCallback((fn: GenerateHandler) => {
    handlerRef.current = fn;
  }, []);

  const triggerGenerate = useCallback(async () => {
    const fn = handlerRef.current;
    if (fn) await fn();
  }, []);

  const value = useMemo(
    () => ({ registerGenerateHandler, triggerGenerate }),
    [registerGenerateHandler, triggerGenerate],
  );

  return (
    <RexMarketsGenerateReportContext.Provider value={value}>
      {children}
    </RexMarketsGenerateReportContext.Provider>
  );
}

export function useRexMarketsGenerateReportOptional() {
  return useContext(RexMarketsGenerateReportContext);
}
