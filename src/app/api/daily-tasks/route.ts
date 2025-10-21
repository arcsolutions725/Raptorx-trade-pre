/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

export type DailyTasksStatus = {
  reportsCompleted: number;
  queriesCompleted: number;
  reportsRequired: number;
  queriesRequired: number;
  isCompleted: boolean;
  pointsEarned: number;
  pointsAvailable: number;
  lastResetDate: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const userId = requireUserId(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        reportsToday: true,
        queriesToday: true,
        lastReportDate: true,
        lastQueryDate: true,
        points: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if we need to reset daily counters
    const lastReportDate = user.lastReportDate;
    const lastQueryDate = user.lastQueryDate;
    const isReportNewDay = !lastReportDate || lastReportDate < today;
    const isQueryNewDay = !lastQueryDate || lastQueryDate < today;

    let reportsToday = user.reportsToday;
    let queriesToday = user.queriesToday;

    // Reset counters if it's a new day
    if (isReportNewDay || isQueryNewDay) {
      const updates: any = {};
      if (isReportNewDay) {
        updates.reportsToday = 0;
        reportsToday = 0;
      }
      if (isQueryNewDay) {
        updates.queriesToday = 0;
        queriesToday = 0;
      }

      await prisma.user.update({
        where: { id: userId },
        data: updates,
      });
    }

    const reportsRequired = 3;
    const queriesRequired = 3;
    const isCompleted =
      reportsToday >= reportsRequired && queriesToday >= queriesRequired;
    const pointsEarned = reportsToday * 100 + queriesToday * 100;
    const pointsAvailable = 600; // 300 for report + 300 for query

    const taskStatus: DailyTasksStatus = {
      reportsCompleted: Math.min(reportsToday, reportsRequired),
      queriesCompleted: Math.min(queriesToday, queriesRequired),
      reportsRequired,
      queriesRequired,
      isCompleted,
      pointsEarned,
      pointsAvailable,
      lastResetDate: today.toISOString(),
    };

    return NextResponse.json({
      success: true,
      tasks: taskStatus,
      user: {
        totalPoints: user.points,
      },
    });
  } catch (error: any) {
    console.error("Daily tasks API error:", error);
    const msg = error?.message || "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to fetch daily tasks", details: msg },
      { status }
    );
  }
}
