"use client";

import { createContext, useContext, useState, useEffect, useLayoutEffect, ReactNode } from "react";

type DataSource = "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun" | "all";

interface DataSourceContextType {
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
}

const DataSourceContext = createContext<DataSourceContextType | undefined>(undefined);

export function DataSourceProvider({ children }: { children: ReactNode }) {
  // Initialize state - default to "kalshi" for SSR, will be synced on client
  const [dataSource, setDataSourceState] = useState<DataSource>("kalshi");

  // Initialize from localStorage on client mount
  // This runs synchronously before paint to prevent hydration mismatches
  useLayoutEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dataSource");
      const initialValue: DataSource = 
        (stored === "polymarket" || stored === "kalshi" || stored === "limitless" || stored === "myriad" || stored === "predictfun" || stored === "all") 
          ? stored 
          : "kalshi";
      setDataSourceState(initialValue);
    }
  }, []);

  const setDataSource = (source: DataSource) => {
    setDataSourceState(source);
    if (typeof window !== "undefined") {
      localStorage.setItem("dataSource", source);
      window.dispatchEvent(new Event("dataSourceChange"));
    }
  };

  useEffect(() => {
    const handleStorageChange = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("dataSource");
        if (stored === "polymarket" || stored === "kalshi" || stored === "limitless" || stored === "myriad" || stored === "predictfun" || stored === "all") {
          setDataSourceState(stored);
        }
      }
    };

    window.addEventListener("dataSourceChange", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("dataSourceChange", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return (
    <DataSourceContext.Provider value={{ dataSource, setDataSource }}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSource() {
  const context = useContext(DataSourceContext);
  if (context === undefined) {
    throw new Error("useDataSource must be used within a DataSourceProvider");
  }
  return context;
}

