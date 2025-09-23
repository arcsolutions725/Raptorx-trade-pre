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

function getBadgeForRank(rank: number) {
  if (rank <= 10) {
    return {
      name: "King of the Jungle",
      color: "red",
      description: "Top 10 - Red raptor with golden crown",
    };
  } else if (rank <= 30) {
    return {
      name: "Alpha Raptors",
      color: "blue",
      description: "Rank 11-30 - Alpha raptor logo",
    };
  } else if (rank <= 50) {
    return {
      name: "Hatchlings",
      color: "green",
      description: "Rank 31-50 - Hatchling raptor logo",
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
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = Math.min(
      parseInt(searchParams.get("pageSize") || "25"),
      50
    ); // Cap pageSize at 50
    const offset = (page - 1) * pageSize;

    // Get total count for pagination
    const totalUsers = await prisma.user.count({
      where: {
        points: {
          gt: 0, // Only users with points
        },
      },
    });

    // Get paginated users ordered by points
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        points: true,
      },
      where: {
        points: {
          gt: 0, // Only users with points
        },
      },
      orderBy: {
        points: "desc",
      },
      skip: offset,
      take: pageSize,
    });

    // Create leaderboard with rankings and badges
    const leaderboard: LeaderboardEntry[] = users.map((user, index) => {
      const rank = offset + index + 1; // Global rank
      return {
        id: user.id,
        username: user.username,
        points: user.points,
        rank,
        badge: getBadgeForRank(rank),
      };
    });

    const totalPages = Math.ceil(totalUsers / pageSize);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return NextResponse.json({
      success: true,
      leaderboard,
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
