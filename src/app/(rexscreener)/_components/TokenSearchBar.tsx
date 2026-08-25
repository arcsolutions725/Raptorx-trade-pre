"use client";

import { Search } from "lucide-react";

interface TokenSearchBarProps {
  value: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
  className?: string;
  autoFocus?: boolean;
}

export function TokenSearchBar({
  value,
  onQueryChange,
  onClear,
  className = "",
  autoFocus = false,
}: TokenSearchBarProps) {
  return (
    <div className={`w-full ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60 w-5 h-5" />
        <input
          type="text"
          value={value}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClear();
          }}
          autoFocus={autoFocus}
          placeholder="Search this table..."
          className="w-full pl-10 pr-12 py-2.5 bg-[#262626] border-[0.5px] border-[#3c3c3c] rounded-lg text-base sm:text-sm text-[#A0A0A0] placeholder-[#A0A0A0] outline-none transition-all"
        />
        {value.trim() ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-colors"
            title="Clear search"
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}
