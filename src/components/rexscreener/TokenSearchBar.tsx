/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback } from "react";
import { Search } from "lucide-react";

interface TokenSearchBarProps {
  onSearch: (query: string, type: "ticker" | "address") => void;
  onClear: () => void;
  className?: string;
}

export function TokenSearchBar({
  onSearch,
  onClear,
  className = "",
}: TokenSearchBarProps) {
  const [searchInput, setSearchInput] = useState("");
  const [hasActiveSearch, setHasActiveSearch] = useState(false);

  const validateInput = (
    input: string
  ): {
    isValid: boolean;
    type: "ticker" | "address" | null;
    error?: string;
  } => {
    const trimmed = input.trim();

    if (!trimmed) {
      return {
        isValid: false,
        type: null,
        error: "Please enter a ticker or contract address",
      };
    }

    // Check if it looks like a BNB/BSC contract address (0x prefixed, 42 chars)
    const bnbAddressPattern = /^0x[a-fA-F0-9]{40}$/;
    if (bnbAddressPattern.test(trimmed)) {
      return { isValid: true, type: "address" };
    }

    // Check if it looks like a Solana contract address (base58, typically 32-44 chars)
    const solanaAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (solanaAddressPattern.test(trimmed)) {
      return { isValid: true, type: "address" };
    }

    // Check if it looks like a ticker (alphanumeric, 1-10 chars, may start with $)
    const tickerPattern = /^\$?[A-Za-z0-9]{1,10}$/;
    if (tickerPattern.test(trimmed)) {
      return { isValid: true, type: "ticker" };
    }

    return {
      isValid: false,
      type: null,
      error:
        "Please enter a valid ticker (e.g., USDC, $BNB) or contract address (Solana or BNB)",
    };
  };

  const performSearch = useCallback(
    (input: string) => {
      const validation = validateInput(input);

      if (!validation.isValid || !validation.type) {
        return;
      }

      const cleanedInput =
        validation.type === "ticker"
          ? input.trim().replace(/^\$/, "")
          : input.trim();

      onSearch(cleanedInput, validation.type);
      setHasActiveSearch(true);
    },
    [onSearch]
  );

  const handleClear = useCallback(() => {
    setSearchInput("");
    setHasActiveSearch(false);
    onClear();
  }, [onClear]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      performSearch(searchInput);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
    if (e.key === "Escape") {
      handleClear();
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60 w-5 h-5" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by ticker or address."
            className="w-full pl-10 pr-20 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-white/50 outline-none focus:border-[#FFD700]/60 focus:ring-2 focus:ring-[#FFD700]/30 transition-all"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
            {hasActiveSearch && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-colors"
                title="Clear search"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              disabled={!searchInput.trim()}
              className="p-2 rounded-md bg-[#FFD700]/20 hover:bg-[#FFD700]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Search"
            >
              <Search className="w-5 h-5 text-[#FFD700]" />
            </button>
          </div>
        </div>
      </form>

      {hasActiveSearch && (
        <div className="mt-2 text-blue-400 text-sm flex items-center gap-2">
          <span>🔍 Search active</span>
          <button
            onClick={handleClear}
            className="text-white/60 hover:text-white underline text-xs"
          >
            Show all trending
          </button>
        </div>
      )}
    </div>
  );
}
