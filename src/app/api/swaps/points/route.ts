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
 * CORE token bonus (Solana only): 500 points per 100,000 CORE coins bought on RaptorX (RexScreener flow).
 * toToken is stored as "core" (lowercase); we match case-insensitively.
 */
const CORE_BONUS_PER_100K = 500;
const CORE_UNITS_FOR_BONUS = 100_000;
const CORE_DECIMALS_SOLANA = 8; // override via env CORE_DECIMALS_SOLANA if needed

/** True when this is a CORE buy on Solana. toToken comes as "core" from the widget. */
function isCoreBuyOnSolana(toToken: string, toAddress: string, chain: string): boolean {
  if (chain !== "solana") return false;
  const symbolNorm = toToken?.trim().toLowerCase();
  if (symbolNorm === "core") return true;
  const addr = toAddress?.trim().toLowerCase();
  const configured = process.env.CORE_TOKEN_ADDRESS_SOLANA?.trim().toLowerCase();
  return !!configured && addr === configured;
}

function getCoreDecimals(): number {
  const env = process.env.CORE_DECIMALS_SOLANA;
  if (env != null) {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return CORE_DECIMALS_SOLANA;
}

/**
 * Calculate bonus points for buying CORE on Solana: 500 points per 100,000 CORE (human units).
 * toAmountRaw is the raw token amount (with decimals).
 */
function calculateCoreBonusPoints(toAmountRaw: string | null | undefined): number {
  if (!toAmountRaw || !String(toAmountRaw).trim()) return 0;
  const raw = BigInt(String(toAmountRaw).trim());
  const decimals = getCoreDecimals();
  const divisor = BigInt(10 ** decimals);
  const humanUnits = Number(raw / divisor);
  const tiers = Math.floor(humanUnits / CORE_UNITS_FOR_BONUS);
  return tiers * CORE_BONUS_PER_100K;
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
  chain: "solana" | "bnb" | "base";
  isBuy: boolean; // true for buy, false for sell
  walletAddress?: string | null;
  fromAmountRaw?: string | null;
  toAmountRaw?: string | null;
  txHash?: string | null;
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
 *   chain: "solana" | "bnb" | "base",
 *   isBuy: boolean,
 *   walletAddress?: string,
 *   fromAmountRaw?: string,
 *   toAmountRaw?: string,
 *   txHash?: string
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
      walletAddress,
      fromAmountRaw,
      toAmountRaw,
      txHash,
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

    // Deduplicate: by txHash if provided (strongest), else by recent same-details within 5 min
    if (txHash?.trim()) {
      const existingByTx = await prisma.swapTransaction.findFirst({
        where: { userId, txHash: txHash.trim() },
      });
      if (existingByTx) {
        return NextResponse.json({
          success: true,
          alreadyCredited: true,
          message: "Points already credited for this transaction",
          pointsAwarded: existingByTx.pointsAwarded,
        });
      }
    }
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

    // Base points from swap volume
    const basePoints = calculateSwapPoints(amountUSD);

    // CORE bonus (Solana only): 500 points per 100,000 CORE bought; toToken is "core"
    let coreBonusPoints = 0;
    if (isBuy && isCoreBuyOnSolana(toToken, toAddress, chain)) {
      coreBonusPoints = calculateCoreBonusPoints(toAmountRaw);
    }
    const pointsAwarded = basePoints + coreBonusPoints;

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
          walletAddress: walletAddress?.trim() || undefined,
          fromAmountRaw: fromAmountRaw != null ? String(fromAmountRaw) : undefined,
          toAmountRaw: toAmountRaw != null ? String(toAmountRaw) : undefined,
          txHash: txHash?.trim() || undefined,
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
      coreBonusPoints: coreBonusPoints > 0 ? coreBonusPoints : undefined,
      message:
        pointsAwarded > 0
          ? `Awarded ${pointsAwarded} points for ${
              isBuy ? "buying" : "selling"
            } $${amountUSD.toFixed(2)}${coreBonusPoints > 0 ? ` (including ${coreBonusPoints} CORE bonus)` : ""}`
          : `Swap amount $${amountUSD.toFixed(
              2
            )} does not meet minimum $100 for points`,
      transaction: {
        amountUSD,
        chain,
        isBuy,
        fromAddress,
        toAddress,
        walletAddress: walletAddress || undefined,
        fromAmountRaw: fromAmountRaw || undefined,
        toAmountRaw: toAmountRaw || undefined,
        txHash: txHash || undefined,
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
