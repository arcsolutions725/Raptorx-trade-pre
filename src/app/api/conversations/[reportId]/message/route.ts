/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function requireUserId(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

/**
 * POST /api/conversations/[reportId]/message
 * Body: { role: 'user' | 'assistant', content: string, timestamp?: string }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await context.params;
    const userId = requireUserId(req);

    const { role, content, timestamp } = (await req.json()) as {
      role: "user" | "assistant";
      content: string;
      timestamp?: string;
    };

    if (role !== "user" && role !== "assistant")
      return NextResponse.json(
        { ok: false, error: "Invalid role" },
        { status: 400 }
      );
    if (!content?.trim())
      return NextResponse.json(
        { ok: false, error: "Missing content" },
        { status: 400 }
      );

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
      include: { conversation: true },
    });
    if (!report)
      return NextResponse.json(
        { ok: false, error: "Report not found" },
        { status: 404 }
      );

    let convId = report.conversation?.id;
    if (!convId) {
      const conv = await prisma.conversation.create({ data: { reportId } });
      convId = conv.id;
    }

    const message = await prisma.message.create({
      data: {
        conversationId: convId!,
        role,
        content,
        timestamp: timestamp ? new Date(timestamp) : undefined,
      },
    });

    await prisma.conversation.update({
      where: { id: convId! },
      data: { updatedAt: new Date() },
    });

    // ---------- Daily Task Points: Award up to 300 points/day for user follow-up queries ----------
    if (role === "user") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userForTasks = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastQueryDate: true, queriesToday: true },
      });

      if (userForTasks) {
        const lastQueryDate = userForTasks.lastQueryDate;
        const isNewDay = !lastQueryDate || lastQueryDate < today;
        const currentQueries =
          typeof userForTasks.queriesToday === "number"
            ? userForTasks.queriesToday
            : 0;

        // Cap at 3 queries per day -> max 300 pts/day for queries
        const reachedDailyCap = !isNewDay && currentQueries >= 3;

        await prisma.user.update({
          where: { id: userId },
          data: {
            ...(reachedDailyCap ? {} : { points: { increment: 100 } }),
            lastQueryDate: new Date(),
            queriesToday: isNewDay
              ? 1
              : Math.min(currentQueries + 1, 3),
          },
        });
      }
    }

    return NextResponse.json({ ok: true, message });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
