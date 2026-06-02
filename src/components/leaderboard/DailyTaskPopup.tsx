/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, CheckCircle, Circle, Star } from "lucide-react";
import type { DailyTasksStatus } from "@/app/api/daily-tasks/route";

interface DailyTasksPopupProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DailyTasksPopup({
  userId,
  isOpen,
  onClose,
}: DailyTasksPopupProps) {
  const [tasks, setTasks] = useState<DailyTasksStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [userPoints, setUserPoints] = useState(0);

  useEffect(() => {
    if (isOpen && userId) {
      fetchDailyTasks();
    }
  }, [isOpen, userId]);

  // Optional: lock background scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const fetchDailyTasks = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const response = await fetch("/api/daily-tasks", {
        headers: {
          "x-user-id": userId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
        setUserPoints(data.user.totalPoints);
      }
    } catch (error) {
      console.error("Failed to fetch daily tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Modal container: constrained height + internal flex layout */}
      <div className="bg-[#0D0D0D] border border-[#303030] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header (fixed) */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Image
              src="/images/mission.webp"
              alt="Daily Missions"
              width={24}
              height={24}
              className="w-14 h-14 object-contain"
            />
            <div>
              <h2 className="text-xl font-bold text-white">Daily Missions</h2>
              <p className="text-sm text-gray-400">
                Complete tasks to earn points
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-4 overflow-y-auto custom-sidebar-scrollbar">
          {/* Points Display */}
          <div className="bg-[#191919] rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between text-white">
              <div>
                <p className="text-sm text-[#7A7A7A]">Total Points</p>
                <p className="text-2xl font-bold">
                  {userPoints.toLocaleString()}
                </p>
              </div>
              <Star className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-[#ffc000] border-t-transparent rounded-full animate-spin"></div>
              <p className="ml-3 text-gray-400">Loading tasks...</p>
            </div>
          )}

          {/* Tasks */}
          {!loading && tasks && (
            <div className="space-y-4">
              {/* Today's Mission Header */}
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-white mb-1">
                  Today's Mission
                </h3>
                <p className="text-sm text-gray-400">
                  Complete all tasks to earn{" "}
                  <span className="text-green-400 font-semibold">
                    {tasks.pointsAvailable} points
                  </span>
                </p>
              </div>

              {/* Mission Progress */}
              <div className="bg-[#191919] rounded-xl p-4 border border-[#303030]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-white">
                    Daily Mission Progress
                  </h4>
                  <span
                    className={`px-2 py-1 rounded-full text-xs text-nowrap font-medium ${
                      tasks.isCompleted
                        ? "bg-green-500/20 text-green-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {tasks.isCompleted ? "Completed!" : "In Progress"}
                  </span>
                </div>

                {/* Task 1: Generate Reports */}
                <div className="flex items-center gap-3 mb-3">
                  {tasks.reportsCompleted >= tasks.reportsRequired ? (
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-500 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-white text-sm">Generate 3 reports</p>
                    <p className="text-xs text-gray-400">
                      {tasks.reportsCompleted}/{tasks.reportsRequired} completed
                      • +100 points each
                    </p>
                  </div>
                  {tasks.reportsCompleted > 0 && (
                    <span className="text-green-400 text-sm font-medium">
                      +{tasks.reportsCompleted * 100}
                    </span>
                  )}
                </div>

                {/* Task 2: Follow-up Queries */}
                <div className="flex items-center gap-3">
                  {tasks.queriesCompleted >= tasks.queriesRequired ? (
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-500 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-white text-sm">
                      Ask 3 follow-up queries
                    </p>
                    <p className="text-xs text-gray-400">
                      {tasks.queriesCompleted}/{tasks.queriesRequired} completed
                      • +100 points each
                    </p>
                  </div>
                  {tasks.queriesCompleted > 0 && (
                    <span className="text-green-400 text-sm font-medium">
                      +{tasks.queriesCompleted * 100}
                    </span>
                  )}
                </div>
              </div>

              {/* Mission Completion */}
              {tasks.isCompleted && (
                <div className="bg-linear-to-r from-green-600 to-emerald-600 rounded-lg p-4">
                  <div className="text-center text-white">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2" />
                    <h4 className="font-bold">Mission Completed!</h4>
                    <p className="text-sm opacity-90">
                      You have earned 600 points today. Keep up the great work!
                    </p>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-[#191919] rounded-lg p-4 border border-[#303030]">
                <h4 className="text-white font-medium mb-2">
                  How to complete:
                </h4>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Generate a token analysis report</li>
                  <li>• Ask a follow-up question about any report</li>
                  <li>• Tasks reset daily at midnight</li>
                  <li>• Each completed task earns 100 points</li>
                </ul>
              </div>

              <div className="bg-[#191919] rounded-lg p-4 border border-[#303030]">
                <h4 className="text-white font-medium mb-2">
                  Earn from Referrals
                </h4>
                <p className="text-sm text-gray-400">
                  Earn points by referring your friends. Referral link is in the{" "}
                  <span className="text-white font-medium">Account</span>{" "}
                  section on the top right
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer (fixed) */}
        <div className="p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full bg-[#ffc000] cursor-pointer text-black font-semibold py-3 px-4 rounded-lg transition-all duration-300"
          >
            {tasks?.isCompleted ? "Awesome" : "Let's Go"}
          </button>
        </div>
      </div>
    </div>
  );
}
