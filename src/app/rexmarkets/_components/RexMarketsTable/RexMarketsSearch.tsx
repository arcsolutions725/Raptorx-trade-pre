"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { Search } from "lucide-react";

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
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60 w-5 h-5" />
          <input
            type="text"
            value={displayValue}
            onChange={(e) => {
              setInternalQuery(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search markets..."
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
              disabled={!internalQuery.trim()}
              className="p-2 rounded-md bg-[#fff]/10 hover:bg-[#fff]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
