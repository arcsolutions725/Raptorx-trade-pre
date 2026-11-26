/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useId, type Ref } from "react";
import { Search, X } from "lucide-react";

interface TokenSearchBarProps {
  onSearch: (query: string, type: "ticker" | "address") => void;
  onClear: () => void;
  className?: string;
  /**
   * `search` (default): Enter runs the screener search (`onSearch`).
   * `filter`: the text filters a list in place as you type (Golden / Pump Reports view). Enter does
   * not search and the ↵ key is hidden; the clear button shows whenever there is text.
   */
  mode?: "search" | "filter";
  /** Every edit of the text (typing, clear, Escape). */
  onValueChange?: (value: string) => void;
  /** Text to start with (e.g. a filter that outlived a remount). Remount (`key`) to reset. */
  defaultValue?: string;
  placeholder?: string;
  /** Screen-reader label for the input. */
  label?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function TokenSearchBar({
  onSearch,
  onClear,
  className = "",
  mode = "search",
  onValueChange,
  defaultValue = "",
  placeholder = "Filter by name, ticker or CA",
  label = "Search tokens by name, ticker or contract address",
  inputRef,
}: TokenSearchBarProps) {
  const [searchInput, setSearchInput] = useState(defaultValue);
  const [hasActiveSearch, setHasActiveSearch] = useState(false);
  const inputId = useId();
  const filterMode = mode === "filter";

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
    onValueChange?.("");
    onClear();
  }, [onClear, onValueChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter mode already applies the text as it is typed.
    if (filterMode) return;
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

  const showClear = filterMode ? searchInput.length > 0 : hasActiveSearch;

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={`rx-input h-[38px] w-full gap-2.5 pr-1.5 ${className}`}
    >
      <Search className="size-[15px] shrink-0 text-rx-text-3" aria-hidden />
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={searchInput}
        onChange={(e) => {
          setSearchInput(e.target.value);
          onValueChange?.(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        title="Filter by name or ticker, or paste a contract address"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="text-base sm:text-sm"
      />
      {showClear && (
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-rx-text-3 transition-colors hover:bg-white/[0.06] hover:text-rx-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rx-gold-hi"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      {filterMode ? null : (
        <button
          type="submit"
          disabled={!searchInput.trim()}
          className="rx-kbd shrink-0 cursor-pointer transition-colors hover:border-rx-gold-line hover:text-rx-text disabled:cursor-default disabled:opacity-0"
          title="Search"
          aria-label="Search"
        >
          ↵
        </button>
      )}
    </form>
  );
}
