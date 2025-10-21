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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-black border border-[#ffc000] rounded-xl sm:rounded-2xl max-w-5xl w-full shadow-2xl h-[95vh] sm:h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-6 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="!text-lg sm:!text-2xl font-bold text-white">
              RaptorX Leaderboard
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 sm:p-2 hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Leaderboard Component - Takes remaining space */}
        <div className="flex-1 min-h-0 overflow-hidden p-2 sm:p-6">
          <Leaderboard currentUserId={currentUserId} />
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-6 sm:pt-4 border-t border-gray-700 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 sm:px-6 rounded-lg transition-colors text-sm sm:text-base"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
