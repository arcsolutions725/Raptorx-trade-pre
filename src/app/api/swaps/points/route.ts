/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Endpoint to award points for swap transactions
 * Called by Li.Fi widget or our tracking system after a swap completes
 */

function requireUserId(req: NextRequest): string {
  const userId = req.headers.get("x-user-id");
  if (!userId) throw new Error("x-user-id header required");
  return userId;
}

/**
 * Calculate points based on swap amount in USD
 * Tier structure:
 * - $100-$499: 250 points
 * - $500-$999: 500 points
 * - $1,000-$9,999: 1,500 points
 * - $10,000+: 10,000 points
 */
function calculateSwapPoints(amountUSD: number): number {
  if (amountUSD >= 10000) {
    return 10000;
  } else if (amountUSD >= 1000) {
    return 1500;
  } else if (amountUSD >= 500) {
    return 500;
  } else if (amountUSD >= 100) {
    return 250;
  }
  return 0; // No points for swaps under $100
}

interface SwapTransaction {
  userId: string;
  amountUSD: number;
  fromToken: string;
  toToken: string;
  fromAddress: string;
  toAddress: string;
  chain: "solana" | "bnb";
  isBuy: boolean; // true for buy, false for sell
}

/**
 * POST /api/swaps/points
 * Award points for a swap transaction
 *
 * Body: {
 *   amountUSD: number,
 *   fromToken: string,
 *   toToken: string,
 *   fromAddress: string,
 *   toAddress: string,
 *   chain: "solana" | "bnb",
 *   isBuy: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const {
      amountUSD,
      fromToken,
      toToken,
      fromAddress,
      toAddress,
      chain,
      isBuy,
    }: SwapTransaction = await request.json();

    // Validate input
    if (!amountUSD || amountUSD < 0) {
      return NextResponse.json({ error: "Invalid amountUSD" }, { status: 400 });
    }

    if (!fromToken || !toToken || !fromAddress || !toAddress) {
      return NextResponse.json(
        { error: "Missing required fields: fromToken, toToken, fromAddress, toAddress" },
        { status: 400 }
      );
    }

    // Check if this transaction has already been credited within the last 5 minutes
    // This prevents double-crediting by checking for recent swaps with same details
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingSwap = await prisma.swapTransaction.findFirst({
      where: {
        userId,
        fromAddress,
        toAddress,
        amountUSD,
        createdAt: {
          gte: fiveMinutesAgo,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingSwap) {
      return NextResponse.json({
        success: true,
        alreadyCredited: true,
        message: "Points already credited for this transaction",
        pointsAwarded: existingSwap.pointsAwarded,
      });
    }

    // Calculate points
    const pointsAwarded = calculateSwapPoints(amountUSD);

    // Execute all database operations atomically using interactive transaction
    // This allows mixing different model operations (SwapTransaction and User)
    await prisma.$transaction(async (tx) => {
      // Always save swap transaction to database, even if no points are awarded
      // This gives us complete swap history
      await tx.swapTransaction.create({
        data: {
          userId,
          amountUSD,
          fromToken,
          toToken,
          fromAddress,
          toAddress,
          chain,
          isBuy,
          pointsAwarded,
        },
      });

      // Only credit points if the swap meets minimum ($100)
      if (pointsAwarded > 0) {
        await tx.user.update({
          where: { id: userId },
          data: {
            points: { increment: pointsAwarded },
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      pointsAwarded,
      message:
        pointsAwarded > 0
          ? `Awarded ${pointsAwarded} points for ${
              isBuy ? "buying" : "selling"
            } $${amountUSD.toFixed(2)}`
          : `Swap amount $${amountUSD.toFixed(
              2
            )} does not meet minimum $100 for points`,
      transaction: {
        amountUSD,
        chain,
        isBuy,
        fromAddress,
        toAddress,
      },
    });
  } catch (err: any) {
    console.error("Award swap points error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to award swap points", details: msg },
      { status }
    );
  }
}

/**
 * GET /api/swaps/points?userId=<userId>
 * Get swap history and stats for a user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId") || userId;

    const swaps = await prisma.swapTransaction.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 50, // Last 50 swaps
    });

    // Calculate stats
    const totalSwaps = swaps.length;
    const totalVolume = swaps.reduce((sum, s) => sum + s.amountUSD, 0);
    const totalPoints = swaps.reduce((sum, s) => sum + s.pointsAwarded, 0);
    const buyCount = swaps.filter((s) => s.isBuy).length;
    const sellCount = swaps.filter((s) => !s.isBuy).length;

    return NextResponse.json({
      success: true,
      stats: {
        totalSwaps,
        totalVolume,
        totalPoints,
        buyCount,
        sellCount,
      },
      swaps,
    });
  } catch (err: any) {
    console.error("Get swap history error:", err);
    return NextResponse.json(
      { error: "Failed to get swap history", details: err.message },
      { status: 500 }
    );
  }
}
