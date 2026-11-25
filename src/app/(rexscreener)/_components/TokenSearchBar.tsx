/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useId } from "react";
import { Search, X } from "lucide-react";

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
  const inputId = useId();

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
    <form
      role="search"
      onSubmit={handleSubmit}
      className={`rx-input h-[38px] w-full gap-2.5 pr-1.5 ${className}`}
    >
      <Search className="size-[15px] shrink-0 text-rx-text-3" aria-hidden />
      <label htmlFor={inputId} className="sr-only">
        Search tokens by name, ticker or contract address
      </label>
      <input
        id={inputId}
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Filter by name, ticker or address"
        autoComplete="off"
        spellCheck={false}
        className="text-base sm:text-sm"
      />
      {hasActiveSearch && (
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-rx-text-3 transition-colors hover:bg-white/[0.06] hover:text-rx-text"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      <button
        type="submit"
        disabled={!searchInput.trim()}
        className="rx-kbd shrink-0 cursor-pointer transition-colors hover:border-rx-gold-line hover:text-rx-text disabled:cursor-default disabled:opacity-0"
        title="Search"
        aria-label="Search"
      >
        ↵
      </button>
    </form>
  );
}
