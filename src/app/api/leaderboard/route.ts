import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type LeaderboardEntry = {
  id: string;
  username: string;
  points: number;
  rank: number;
  badge: {
    name: string;
    color: string;
    description: string;
  };
};

/** The signed-in user's own place (`?userId=`), even when it is not on the requested page. */
export type LeaderboardMe = {
  id: string;
  username: string;
  points: number;
  rank: number;
  /** The trader one place above, for "N points behind X". */
  above: { username: string; points: number } | null;
};

// NEW: points-based badge rules
function getBadgeForPoints(points: number) {
  if (points >= 500) {
    return {
      name: "King of the Jungle",
      color: "red",
      description: "500+ points - Red raptor with golden crown",
    };
  } else if (points >= 300) {
    return {
      name: "Alpha Raptor",
      color: "blue",
      description: "300-499 points - Alpha raptor logo",
    };
  } else if (points >= 100) {
    return {
      name: "Hatchling",
      color: "green",
      description: "100-299 points - Hatchling raptor logo",
    };
  }

  return {
    name: "Newcomer",
    color: "gray",
    description: "Getting started",
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)),
      50
    );
    const offset = (page - 1) * pageSize;

    // Total users with points > 0
    const totalUsers = await prisma.user.count({
      where: { points: { gt: 0 } },
    });

    // Paginated users ordered by points desc (stable tie-breakers optional)
    const users = await prisma.user.findMany({
      select: { id: true, username: true, points: true },
      where: { points: { gt: 0 } },
      orderBy: [
        { points: "desc" },
        // Optional: add stable secondary sort so pagination doesn't jump on equal points
        { username: "asc" },
        { id: "asc" },
      ],
      skip: offset,
      take: pageSize,
    });

    // Build leaderboard: keep existing rank calc, but badge comes from POINTS
    const leaderboard: LeaderboardEntry[] = users.map((user, index) => {
      const rank = offset + index + 1;
      return {
        id: user.id,
        username: user.username,
        points: user.points,
        rank,
        badge: getBadgeForPoints(user.points),
      };
    });

    // Optional: the requesting user's own rank (same order as above; usernames are unique).
    const userId = searchParams.get("userId");
    let me: LeaderboardMe | null = null;
    if (userId) {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, points: true },
      });
      if (u && u.points > 0) {
        const ahead = await prisma.user.count({
          where: {
            OR: [
              { points: { gt: u.points } },
              { points: u.points, username: { lt: u.username } },
            ],
          },
        });
        const rank = ahead + 1;
        const above =
          rank > 1
            ? await prisma.user.findFirst({
                select: { username: true, points: true },
                where: { points: { gt: 0 } },
                orderBy: [{ points: "desc" }, { username: "asc" }, { id: "asc" }],
                skip: rank - 2,
              })
            : null;
        me = { ...u, rank, above };
      }
    }

    const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return NextResponse.json({
      success: true,
      leaderboard,
      me,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalUsers,
        hasNext,
        hasPrev,
      },
    });
  } catch (error) {
    console.error("Leaderboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
