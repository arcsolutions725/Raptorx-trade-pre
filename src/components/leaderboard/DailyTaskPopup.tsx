"use client";

import { useEffect, useState } from "react";
import { X, Trophy, CheckCircle, Circle, Star } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#ffc000] p-2 rounded-lg">
              <Trophy className="w-6 h-6 text-white" />
            </div>
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
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Points Display */}
        <div className="bg-[#ffc000] rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between text-black">
            <div>
              <p className="text-sm opacity-80">Total Points</p>
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
                Todays Mission
              </h3>
              <p className="text-sm text-gray-400">
                Complete all tasks to earn{" "}
                <span className="text-green-400 font-semibold">
                  {tasks.pointsAvailable} points
                </span>
              </p>
            </div>

            {/* Mission Progress */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-white">
                  Daily Mission Progress
                </h4>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-500 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-white text-sm">Generate 3 reports</p>
                  <p className="text-xs text-gray-400">
                    {tasks.reportsCompleted}/{tasks.reportsRequired} completed •
                    +100 points each
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
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-500 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-white text-sm">Ask 3 follow-up queries</p>
                  <p className="text-xs text-gray-400">
                    {tasks.queriesCompleted}/{tasks.queriesRequired} completed •
                    +100 points each
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
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-4">
                <div className="text-center text-white">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2" />
                  <h4 className="font-bold">Mission Completed!</h4>
                  <p className="text-sm opacity-90">
                    You have earned {tasks.pointsEarned} points today. Keep up
                    the great work!
                  </p>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="text-white font-medium mb-2">How to complete:</h4>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Generate a token analysis report</li>
                <li>• Ask a follow-up question about any report</li>
                <li>• Tasks reset daily at midnight</li>
                <li>• Each completed task earns 100 points</li>
              </ul>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full bg-[#ffc000] text-black font-semibold py-3 px-4 rounded-lg transition-all duration-200"
          >
            {tasks?.isCompleted ? "Awesome" : "Let's Go"}
          </button>
        </div>
      </div>
    </div>
  );
}
