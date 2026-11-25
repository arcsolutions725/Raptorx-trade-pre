"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";

type RexMarketsSearchProps = {
  onSearch?: (query: string | null) => void;
  searchQuery?: string | null;
};

export default function RexMarketsSearch({
  onSearch,
  searchQuery: externalSearchQuery,
}: RexMarketsSearchProps) {
  const [internalQuery, setInternalQuery] = useState<string>("");
  const [hasActiveSearch, setHasActiveSearch] = useState(false);

  // Sync with external query when it changes (e.g., when cleared from outside)
  useEffect(() => {
    if (externalSearchQuery === null || externalSearchQuery === "") {
      setInternalQuery("");
      setHasActiveSearch(false);
    } else {
      setHasActiveSearch(true);
    }
  }, [externalSearchQuery]);

  // Always use internal state for the input value (allows free typing)
  const displayValue = internalQuery;

  const handleSearch = () => {
    const query = internalQuery.trim() || null;
    onSearch?.(query);
    if (query) {
      setHasActiveSearch(true);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
    if (e.key === "Escape") {
      handleClear();
    }
  };

  const handleClear = () => {
    setInternalQuery("");
    setHasActiveSearch(false);
    onSearch?.(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (internalQuery.trim()) {
      handleSearch();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="rx-input h-[38px] w-full min-w-0 gap-2 pl-3 pr-1.5"
    >
      <Search className="size-3.5 shrink-0 text-rx-text-3" aria-hidden />
      <label className="sr-only" htmlFor="rex-markets-search">
        Search markets
      </label>
      <input
        id="rex-markets-search"
        type="text"
        enterKeyHint="search"
        autoComplete="off"
        value={displayValue}
        onChange={(e) => {
          setInternalQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search markets"
        className="min-w-0 text-base sm:text-sm"
      />
      {hasActiveSearch && (
        <button
          type="button"
          onClick={handleClear}
          className="rx-icon-btn rx-icon-btn--s size-[26px] shrink-0 rounded-[7px]"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      {internalQuery.trim() ? (
        <button
          type="submit"
          className="rx-icon-btn rx-icon-btn--s size-[26px] shrink-0 rounded-[7px] text-rx-gold-hi"
          title="Search"
          aria-label="Search"
        >
          <CornerDownLeft className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </form>
  );
}
