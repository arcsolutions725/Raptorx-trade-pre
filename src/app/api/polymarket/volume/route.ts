/**
 * GET /api/polymarket/volume
 *
 * Returns Polymarket prediction market trading volume for the dashboard:
 * - totalVolume: all-time
 * - volumeThisWeek: since start of current week (Sunday 00:00 UTC)
 * - byUser: per user (address + total volume), aligned with Privy users via ethereumWallet
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfThisWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day) * 24 * 60 * 60 * 1000;
  return new Date(x.getTime() + diff);
}

export async function GET() {
  try {
    const now = new Date();
    const weekStart = startOfThisWeekUTC(now);

    const [totalAgg, weekAgg, byWallet] = await Promise.all([
      prisma.polymarketTrade.aggregate({
        _sum: { volumeUsd: true },
      }),
      prisma.polymarketTrade.aggregate({
        where: { tradedAt: { gte: weekStart } },
        _sum: { volumeUsd: true },
      }),
      prisma.polymarketTrade.groupBy({
        by: ["walletAddress", "userId"],
        _sum: { volumeUsd: true },
      }),
    ]);

    const totalVolume = totalAgg._sum.volumeUsd ?? 0;
    const volumeThisWeek = weekAgg._sum.volumeUsd ?? 0;

    const userIds = [
      ...new Set(
        byWallet.map((r) => r.userId).filter((id): id is string => id != null)
      ),
    ];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, ethereumWallet: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const byUser = byWallet
      .map((row) => {
        const user = row.userId ? userMap.get(row.userId) : null;
        return {
          userId: row.userId ?? null,
          username: user?.username ?? null,
          address: row.walletAddress,
          totalVolume: row._sum.volumeUsd ?? 0,
        };
      })
      .sort((a, b) => b.totalVolume - a.totalVolume);

    return NextResponse.json({
      totalVolume,
      volumeThisWeek,
      byUser,
    });
  } catch (err) {
    console.error("Polymarket volume API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch volume" },
      { status: 500 }
    );
  }
}
