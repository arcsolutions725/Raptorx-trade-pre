"use client";

import React, { useEffect, useState, useRef } from "react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import {
  Trophy,
  Crown,
  Star,
  Users,
  ChevronDown as ChevronDownIcon,
  Check,
} from "lucide-react";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";
import Image from "next/image";

interface LeaderboardProps {
  currentUserId?: string;
}

/* ============================ Styled, Up-Opening Select ============================ */

type RowsPerPageSelectProps = {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
  className?: string;
  /** "up" by default; set "down" if you ever want normal dropdown behavior */
  direction?: "up" | "down";
};

function RowsPerPageSelect({
  value,
  onChange,
  options = [25, 50],
  className = "",
  direction = "up",
}: RowsPerPageSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(
    Math.max(
      0,
      options.findIndex((o) => o === value)
    )
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Ensure activeIndex follows current value
  useEffect(() => {
    const idx = options.findIndex((o) => o === value);
    if (idx >= 0) setActiveIndex(idx);
  }, [value, options]);

  const commit = (idx: number) => {
    const selected = options[idx];
    if (typeof selected === "number") onChange(selected);
    setOpen(false);
  };

  const onKeyDownButton = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => listRef.current?.focus());
    }
  };

  const onKeyDownList = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(activeIndex);
      return;
    }
  };

  const popPos = direction === "up" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDownButton}
        className="flex items-center justify-between gap-2 w-[112px] px-3 py-1.5 rounded-md border border-white/20 bg-black/30 hover:bg-white/10 transition text-white"
      >
        <span className="text-sm">{value}</span>
        <ChevronDownIcon
          className={`size-4 opacity-80 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`rpp-opt-${activeIndex}`}
          onKeyDown={onKeyDownList}
          className={`absolute z-50 ${popPos} left-0 w-[160px] max-h-60 overflow-auto rounded-lg border border-white/15 bg-[#0A0A0A]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0A0A0A]/70 shadow-2xl`}
        >
          {options.map((opt, idx) => {
            const selected = opt === value;
            const active = idx === activeIndex;
            return (
              <li
                key={opt}
                id={`rpp-opt-${idx}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
                className={[
                  "flex items-center justify-between gap-3 cursor-pointer px-3 py-2 text-sm",
                  active ? "bg-white/10" : "bg-transparent",
                  selected ? "text-[#FFD700]" : "text-white/90",
                  "hover:bg-white/10",
                ].join(" ")}
              >
                <span>{opt}</span>
                {selected ? (
                  <Check className="size-4" />
                ) : (
                  <span className="size-4" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Leaderboard Header component with responsive grid layout
function LeaderboardHeader() {
  return (
    <div className="sticky top-0 z-20 grid grid-cols-[1fr_3fr_1fr_1fr] bg-[#7F7F7F] text-white font-semibold border-b border-white/10 shadow-sm">
      <div className="sticky left-0 z-30 flex items-center justify-center px-0.5 sm:px-1 py-2 sm:py-2.5 whitespace-nowrap truncate border-r border-white/30 bg-[#7F7F7F]">
        <span className="!font-semibold text-sm sm:text-[18px]">Rank</span>
      </div>
      <div className="flex items-center justify-center px-1 sm:px-2 py-2 sm:py-2.5 whitespace-nowrap truncate border-r border-white/30">
        <span className="!font-semibold text-sm sm:text-[18px]">Trader</span>
      </div>
      <div className="flex items-center justify-center px-0.5 sm:px-1 py-2 sm:py-2.5 whitespace-nowrap truncate border-r border-white/30">
        <span className="!font-semibold text-sm sm:text-[18px]">Badge</span>
      </div>
      <div className="flex items-center justify-center px-0.5 sm:px-1 py-2 sm:py-2.5 whitespace-nowrap truncate">
        <span className="!font-semibold text-sm sm:text-[18px]">Points</span>
      </div>
    </div>
  );
}

// Leaderboard Row component matching trending table style
function LeaderboardRow({
  user,
  isCurrentUser,
}: {
  user: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  const getBadgeIcon = (badgeName: string) => {
    switch (badgeName) {
      case "King of the Jungle":
        return (
          <Image src={"/images/king.png"} alt="king" width={40} height={40} />
        );
      case "Alpha Raptor":
        return (
          <Image src={"/images/alpha.png"} alt="king" width={40} height={40} />
        );
      case "Hatchling":
        return (
          <Image
            src={"/images/hatchling.png"}
            alt="king"
            width={40}
            height={40}
          />
        );
      default:
        return <Users className="w-4 h-4 text-gray-400" />;
    }
  };

  const getRankDisplay = () => {
    if (user.rank <= 3) {
      if (user.rank === 1) {
        return <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />;
      } else if (user.rank === 2) {
        return <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300" />;
      } else {
        return <Star className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />;
      }
    }
    return (
      <span className="font-bold text-sm sm:text-[18px] text-white">
        #{user.rank}
      </span>
    );
  };

  return (
    <div
      className={`grid grid-cols-[1fr_3fr_1fr_1fr] hover:bg-white/5 transition-colors border-b border-white/5 ${
        isCurrentUser
          ? "bg-blue-600/10 border-l-2 sm:border-l-4 border-blue-400"
          : ""
      }`}
    >
      {/* Rank */}
      <div className="sticky left-0 z-10 flex items-center justify-center px-0.5 sm:px-1 py-2 sm:py-2.5 bg-black border-r border-white/10">
        <div className="flex items-center justify-center">
          {getRankDisplay()}
        </div>
      </div>

      {/* Trader */}
      <div className="flex items-center px-1 sm:px-2 py-2 sm:py-2.5 border-r border-white/10">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 w-full">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
              <h3
                className={`font-medium !text-sm sm:text-[18px] truncate ${
                  isCurrentUser ? "text-blue-300" : "text-white"
                }`}
              >
                {user.username}
              </h3>
              {isCurrentUser && (
                <span className="text-[10px] sm:text-xs bg-[#ffc000] text-black px-1 sm:px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">
                  You
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Badge */}
      <div className="flex items-center justify-center px-0.5 sm:px-1 py-2 sm:py-2.5 border-r border-white/10">
        <div className="flex items-center justify-center">
          <div className="transform scale-[0.5] sm:scale-[0.7]">
            {getBadgeIcon(user.badge.name)}
          </div>
        </div>
      </div>

      {/* Points */}
      <div className="flex items-center justify-center px-0.5 sm:px-1 py-2 sm:py-2.5">
        <div className="text-center">
          <div
            className={`text-sm sm:text-[18px] font-bold ${
              isCurrentUser ? "text-blue-300" : "text-green-400"
            }`}
          >
            {user.points.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Leaderboard({ currentUserId }: LeaderboardProps) {
  const {
    leaderboard,
    loading,
    error,
    pagination,
    nextPage,
    prevPage,
    setPageIndex,
    setPageSize,
  } = useLeaderboard();
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);

  useEffect(() => {
    if (leaderboard && currentUserId) {
      const userEntry = leaderboard.find((user) => user.id === currentUserId);
      setCurrentUserRank(userEntry ? userEntry.rank : null);
    }
  }, [leaderboard, currentUserId]);

  if (loading) {
    return (
      <div className="w-full flex flex-col gap-3 h-full">
        <div className="relative flex-1 border border-white/10">
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg shadow-2xl text-[#FFC000]">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3" />
                <span>Loading leaderboard...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full flex flex-col gap-3 h-full">
        <div className="relative flex-1 border border-white/10">
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg shadow-2xl text-[#FFC000]">
              <div className="flex items-center">
                <span className="text-[#FFC000]">
                  Failed to load leaderboard. {error}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="w-full flex flex-col gap-3 h-full">
        <div className="relative flex-1 border border-white/10">
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg shadow-2xl text-[#FFC000]">
              <div className="flex flex-col items-center text-center">
                <Users className="w-12 h-12 text-gray-400 mb-4" />
                <p className="text-white text-lg mb-2">No rankings yet</p>
                <p className="text-gray-400">
                  Be the first to earn points and claim the top spot!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full grid grid-rows-[1fr_auto] gap-3">
      {/* Scrollable table area */}
      <div className="relative flex-1 min-h-0 border border-white/10 rounded-md overflow-hidden">
        {/* Vertical scroll area for rows */}
        <div className="h-full overflow-y-auto custom-sidebar-scrollbar scroll-pb-24 pb-2">
          <div className="w-full">
            <LeaderboardHeader />
            <div className="divide-y divide-white/10 w-full">
              {leaderboard.map((user) => {
                const isCurrentUser = currentUserId === user.id;
                return (
                  <LeaderboardRow
                    key={user.id}
                    user={user}
                    isCurrentUser={isCurrentUser}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Pagination: always visible (not inside the scroll area) */}
      <div className="flex flex-col gap-2 text-sm text-white/80 px-1 sm:px-2">
        <div className="flex flex-col items-end gap-2">
          <div className="flex sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {currentUserRank && (
                <div className="bg-[#ffc000] rounded px-2 py-1">
                  <span className="text-black font-medium text-sm">
                    Your Rank: #{currentUserRank}
                  </span>
                </div>
              )}

              {pagination.totalUsers > 0 && (
                <span className="text-white/40 text-sm">
                  Total: {pagination.totalUsers.toLocaleString()} traders
                </span>
              )}
            </div>
          </div>
          {/* Pagination Controls */}
          <div className="flex flex-col w-full sm:flex-row sm:justify-between gap-2">
            <div className="flex flex-row gap-2 w-full sm:w-auto justify-center items-center">
              <button
                className={`px-3 sm:px-4 py-2 text-sm sm:text-base rounded border border-white/20 ${
                  pagination.hasPrev
                    ? "hover:bg-white/10"
                    : "opacity-40 cursor-not-allowed"
                }`}
                onClick={prevPage}
                disabled={!pagination.hasPrev}
              >
                Prev
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base">Page</span>
                <input
                  type="number"
                  min={1}
                  max={pagination.totalPages}
                  value={pagination.page}
                  onChange={(e) => setPageIndex(Number(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="1"
                  className="w-16 sm:w-20 px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base rounded-md bg-black/30 border border-white/20 text-white placeholder-white/40 outline-none
                       focus:border-[#FFD700]/60 focus:ring-2 focus:ring-[#FFD700]/50 transition
                       [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {pagination.totalPages > 0 && (
                  <span className="text-white/60 text-sm sm:text-base">
                    of {pagination.totalPages}
                  </span>
                )}
              </div>

              <button
                className={`px-3 sm:px-4 py-2 text-sm sm:text-base rounded border border-white/20 ${
                  pagination.hasNext
                    ? "hover:bg-white/10"
                    : "opacity-40 cursor-not-allowed"
                }`}
                onClick={nextPage}
                disabled={!pagination.hasNext}
              >
                Next
              </button>
            </div>
            <div className="flex items-center justify-center gap-2">
              <RowsPerPageSelect
                value={pagination.pageSize}
                onChange={setPageSize}
                options={[25, 50]}
                direction="up"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
