/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

// GET /api/referral - Get user's own referral code and referral stats
export async function GET(request: NextRequest) {
  try {
    const userId = requireUserId(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralCode: true,
        username: true,
        points: true,
        referrals: {
          select: {
            id: true,
            username: true,
            createdAt: true,
            points: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const referralStats = {
      totalReferrals: user.referrals.length,
      totalPointsEarned: user.referrals.length * 150, // 150 points per referral
      recentReferrals: user.referrals
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 5), // Show last 5 referrals
    };

    return NextResponse.json({
      success: true,
      referralCode: user.referralCode,
      referralStats,
      user: {
        username: user.username,
        points: user.points,
      },
    });
  } catch (error: any) {
    console.error("Referral GET API error:", error);
    const msg = error?.message || "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to fetch referral data", details: msg },
      { status }
    );
  }
}

// POST /api/referral - Validate a referral code
export async function POST(request: NextRequest) {
  try {
    const { referralCode } = await request.json();

    if (!referralCode || typeof referralCode !== "string") {
      return NextResponse.json(
        { error: "Referral code is required" },
        { status: 400 }
      );
    }

    const referrer = await prisma.user.findUnique({
      where: { referralCode: referralCode.trim() },
      select: {
        id: true,
        username: true,
        referralCode: true,
      },
    });

    if (!referrer) {
      return NextResponse.json(
        {
          valid: false,
          error: "Invalid referral code",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      referrer: {
        id: referrer.id,
        username: referrer.username,
      },
      bonus: {
        refereePoints: 100, // Points the new user will get (instead of 50)
        referrerPoints: 150, // Bonus points for the referrer (150 MORE)
      },
    });
  } catch (error: any) {
    console.error("Referral POST API error:", error);
    return NextResponse.json(
      { error: "Failed to validate referral code" },
      { status: 500 }
    );
  }
}
