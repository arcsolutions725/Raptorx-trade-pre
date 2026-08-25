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

    // Keyword / ticker / partial name (RexScreener uses Birdeye v3 search — allow longer phrases)
    const keywordPattern = /^\$?[A-Za-z0-9][A-Za-z0-9\s\-_.]{0,78}$/;
    if (keywordPattern.test(trimmed) && trimmed.replace(/^\$/, "").trim().length >= 2) {
      return { isValid: true, type: "ticker" };
    }

    return {
      isValid: false,
      type: null,
      error:
        "Please enter a valid name/ticker (e.g. core, USDC) or a full contract address",
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
            placeholder="Search here..."
            className="w-full pl-10 pr-12 py-2.5 bg-[#262626] border-[0.5px] border-[#3c3c3c] rounded-lg text-base sm:text-sm text-[#A0A0A0] placeholder-[#A0A0A0] outline-none transition-all"
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
              className="p-2 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Search"
            >
              <Search className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
