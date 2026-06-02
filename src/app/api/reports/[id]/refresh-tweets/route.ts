/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { getTweetsSearch } from "@/lib/api/tweet";

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

/**
 * POST /api/reports/[id]/refresh-tweets
 * Fetches fresh tweet search only via getTweetsSearch() in @/lib/api/tweet.ts (no LLM, no full regenerate)
 * and updates Report.tweetsData.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reportId } = await context.params;
    const userId = requireUserId(req);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 401 },
      );
    }

    const isAdmin = isAdminEmail(user.email);

    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404 },
      );
    }

    if (report.userId !== userId && !isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 403 },
      );
    }

    if (report.reportType !== "crypto") {
      return NextResponse.json(
        {
          ok: false,
          error: "Tweet refresh is only available for coin reports",
        },
        { status: 400 },
      );
    }

    const tweetsData = await getTweetsSearch(
      report.contractAddress,
      report.ticker,
      report.projectName || undefined,
      40,
    );

    const rawTweetsArray =
      (tweetsData as any).success && (tweetsData as any).data?.length > 0
        ? (tweetsData as any).data
        : [];

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: {
        tweetsData: rawTweetsArray.length > 0 ? rawTweetsArray : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      tweetsCount: rawTweetsArray.length,
      saved: {
        reportId: updated.id,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: msg },
      { status },
    );
  }
}
