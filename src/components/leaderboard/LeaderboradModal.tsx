"use client";

import React from "react";
import { X } from "lucide-react";
import { Leaderboard } from "./Leaderboard";

interface LeaderboardModalProps {
  currentUserId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function LeaderboardModal({
  currentUserId,
  isOpen,
  onClose,
}: LeaderboardModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="bg-black border border-gray-700 rounded-xl sm:rounded-2xl max-w-5xl w-full shadow-2xl h-[95vh] sm:h-[90vh] flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button - Always visible at top right */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 z-50 text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg bg-black/80 border border-gray-700"
          aria-label="Close leaderboard"
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-6 pr-12 sm:pr-16 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="!text-lg sm:!text-2xl font-bold text-white">
              RaptorX Leaderboard
            </h2>
          </div>
        </div>

        {/* Leaderboard Component - Takes remaining space with scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-sidebar-scrollbar p-2 sm:p-6">
          <Leaderboard currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );
}
