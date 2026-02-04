"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface TopbarContextType {
  isTopbarVisible: boolean;
  setTopbarVisible: (visible: boolean) => void;
}

const TopbarContext = createContext<TopbarContextType | undefined>(undefined);

export function TopbarProvider({ children }: { children: ReactNode }) {
  const [isTopbarVisible, setTopbarVisible] = useState(true);

  return (
    <TopbarContext.Provider value={{ isTopbarVisible, setTopbarVisible }}>
      {children}
    </TopbarContext.Provider>
  );
}

export function useTopbar() {
  const context = useContext(TopbarContext);
  if (context === undefined) {
    throw new Error("useTopbar must be used within a TopbarProvider");
  }
  return context;
}

