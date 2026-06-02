"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Check, Copy, Users, Gift, CheckIcon } from "lucide-react";
import Image from "next/image";

interface ReferralInputProps {
  onReferralCodeEntered?: (code: string) => void;
  disabled?: boolean;
}

export function ReferralInput({
  onReferralCodeEntered,
  disabled,
}: ReferralInputProps) {
  const [referralCode, setReferralCode] = useState("");
  const [validationState, setValidationState] = useState<
    "idle" | "loading" | "valid" | "invalid"
  >("idle");
  const [referrerInfo, setReferrerInfo] = useState<{
    username: string;
    refereePoints: number;
    referrerPoints: number;
  } | null>(null);

  const validateReferralCode = async (code: string) => {
    if (!code.trim()) {
      setValidationState("idle");
      setReferrerInfo(null);
      return;
    }

    setValidationState("loading");
    try {
      const response = await fetch("/api/referral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ referralCode: code.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          setValidationState("valid");
          setReferrerInfo({
            username: data.referrer.username,
            refereePoints: data.bonus.refereePoints,
            referrerPoints: data.bonus.referrerPoints,
          });
          onReferralCodeEntered?.(code.trim());
        } else {
          setValidationState("invalid");
          setReferrerInfo(null);
        }
      } else {
        setValidationState("invalid");
        setReferrerInfo(null);
      }
    } catch (error) {
      console.error("Error validating referral code:", error);
      setValidationState("invalid");
      setReferrerInfo(null);
    }
  };

  const handleInputChange = (value: string) => {
    setReferralCode(value);

    // Debounce validation
    const timeoutId = setTimeout(() => {
      validateReferralCode(value);
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const getInputBorderColor = () => {
    switch (validationState) {
      case "valid":
        return "border-green-500 focus:border-green-400";
      case "invalid":
        return "border-red-500 focus:border-red-400";
      case "loading":
        return "border-blue-500 focus:border-blue-400";
      default:
        return "border-gray-600 focus:border-purple-500";
    }
  };

  return (
    <div className="w-full">
      {/* Input Section */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Referral Code (Optional)
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={referralCode}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={disabled}
            placeholder="Enter referral code"
            className={`w-full pl-10 pr-10 py-3 bg-gray-800 text-white rounded-lg transition-all duration-200 ${getInputBorderColor()} disabled:opacity-50 disabled:cursor-not-allowed`}
          />

          {/* Status Icon */}
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {validationState === "loading" && (
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            )}
            {validationState === "valid" && (
              <Check className="w-5 h-5 text-green-500" />
            )}
            {validationState === "invalid" && (
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-xs">✕</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation Messages */}
      {validationState === "valid" && referrerInfo && (
        <div className="mt-3 p-3 bg-green-600/20 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-4 h-4 text-green-400" />
            <span className="text-green-400 font-medium text-sm">
              Valid Referral Code!
            </span>
          </div>
          <div className="text-sm text-green-300">
            <p>
              Referred by:{" "}
              <span className="font-semibold">{referrerInfo.username}</span>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-green-700/30 p-2 rounded">
                <p className="text-green-400">You will get</p>
                <p className="font-bold">
                  +{referrerInfo.refereePoints} points
                </p>
              </div>
              <div className="bg-green-700/30 p-2 rounded">
                <p className="text-green-400">They will get</p>
                <p className="font-bold">
                  +{referrerInfo.referrerPoints} points
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {validationState === "invalid" && (
        <div className="mt-3 p-3 bg-red-600/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">
            Invalid referral code. Please check and try again.
          </p>
        </div>
      )}

      {/* Information Box */}
      <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
        <h4 className="text-white font-medium text-sm mb-2">
          How Referrals Work
        </h4>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• Direct signup: 50 points</li>
          <li>• Signup with referral: 100 points for you</li>
          <li>• Referrer gets: 150 MORE points (bonus)</li>
          <li>• Leave empty if you dont have a referral code</li>
        </ul>
      </div>
    </div>
  );
}

interface ReferralShareProps {
  userId: string;
  referralCode?: string;
}

export function ReferralShare({ userId, referralCode }: ReferralShareProps) {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{
    totalReferrals: number;
    totalPointsEarned: number;
    recentReferrals: Array<{
      id: string;
      username: string;
      createdAt: string;
      points: number;
    }>;
  } | null>(null);

  const copyReferralCode = async () => {
    if (!referralCode) return;

    try {
      const referralUrl = `${process.env.NEXT_PUBLIC_BASE_REFERRALURL}?referralcode=${referralCode}`;
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const fetchReferralStats = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch("/api/referral", {
        headers: { "x-user-id": userId },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.referralStats);
      }
    } catch (error) {
      console.error("Failed to fetch referral stats:", error);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchReferralStats();
    }
  }, [userId, fetchReferralStats]);

  if (!referralCode) {
    return null;
  }

  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-lg">
          {/* <Users className="w-6 h-6 text-white" /> */}
          <Image
            src={"/images/referral.png"}
            width={80}
            height={80}
            alt="referral"
          />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">Your Referral Link</h3>
          <p className="text-gray-400 text-sm">
            Share with friends to earn points
          </p>
        </div>
      </div>

      {/* Referral Code Display */}
      <div className="flex gap-3 items-center justify-center mb-6">
        <div className="bg-[#262626] rounded-lg h-10 flex items-center justify-center w-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-mono text-[14px] font-bold">
                https://raptorx.trade?referralcode={referralCode}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={copyReferralCode}
          className="flex items-center justify-center gap-1 text-[#F9B80C] border border-[#6D4F03] w-20.25 h-10 rounded-lg transition-colors text-[14px]"
        >
          {!copied ? (
            <Copy className="w-4 h-4" />
          ) : (
            <CheckIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Referrals</p>
            <p className="text-white text-2xl font-bold">
              {stats.totalReferrals}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Points Earned</p>
            <p className="text-green-400 text-2xl font-bold">
              +{stats.totalPointsEarned}
            </p>
          </div>
        </div>
      )}

      {/* Recent Referrals */}
      {stats && stats.recentReferrals.length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-3">Recent Referrals</h4>
          <div className="space-y-2">
            {stats.recentReferrals.map((referral) => (
              <div
                key={referral.id}
                className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-3"
              >
                <div>
                  <p className="text-white font-medium">{referral.username}</p>
                  <p className="text-gray-400 text-sm">
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-green-400 font-bold">+150</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Information */}
      <div className="mt-6 pt-6 border-t border-gray-700">
        <h4 className="text-white font-medium mb-2">Referral Rewards</h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• You earn 150 points for each successful referral</li>
          <li>
            • New users get 100 points (instead of 50) when using your link
          </li>
          <li>• Share your link on social media, Discord, or with friends!</li>
        </ul>
      </div>
    </div>
  );
}
