/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  checkAndIncrementUsage,
  FREE_LIMITS,
  type UsageFeature,
} from "@/lib/subscription/limits";

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

    const { role, content, timestamp, followupKind } = (await req.json()) as {
      role: "user" | "assistant";
      content: string;
      timestamp?: string;
      // Optional, used for prediction market follow-ups:
      // "tech" | "news"
      followupKind?: "tech" | "news";
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

    // Subscription & usage: follow-up limits — check BEFORE creating the message
    if (role === "user") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const isRexScreener =
        report.reportType !== "market" && report.chain !== "market";

      if (isRexScreener) {
        // RexScreener: 2 queries per report per day (free and paid enforced differently)
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            subscriptionPlan: true,
            subscriptionPeriodEnd: true,
          },
        });
        const hasPaidBundle =
          user?.subscriptionPlan === "CLAW_PRO" &&
          user?.subscriptionPeriodEnd &&
          new Date(user.subscriptionPeriodEnd) > new Date();

        if (!hasPaidBundle) {
          // Free tier: 2 queries per report per day; from 3rd question → paywall
          const userMessagesToday = await prisma.message.count({
            where: {
              conversationId: convId!,
              role: "user",
              timestamp: { gte: today },
            },
          });
          if (
            userMessagesToday >= FREE_LIMITS.rexScreenerFollowupsPerReportPerDay
          ) {
            return NextResponse.json(
              {
                ok: false,
                error: "Follow-up limit reached",
                code: "FREE_LIMIT_REACHED",
                plan: "FREE",
              },
              { status: 402 },
            );
          }
        } else {
          // Paid: use global follow-up counter
          const usageResult = await checkAndIncrementUsage(
            userId,
            "REXSCREENER_FOLLOWUP"
          );
          if (!usageResult.ok) {
            return NextResponse.json(
              {
                ok: false,
                error: "Follow-up limit reached",
                code: usageResult.reason,
                plan: usageResult.plan,
              },
              { status: 402 },
            );
          }
        }
      } else {
        // RexMarkets: 2 tech + 2 news queries per report per day (free); from 3rd of each → paywall
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            subscriptionPlan: true,
            subscriptionPeriodEnd: true,
          },
        });
        const hasPaidBundle =
          user?.subscriptionPlan === "CLAW_PRO" &&
          user?.subscriptionPeriodEnd &&
          new Date(user.subscriptionPeriodEnd) > new Date();

        if (!hasPaidBundle) {
          // Free tier: count tech vs news user messages in this report's conversation today
          const isNews = followupKind === "news";
          const limit = isNews
            ? FREE_LIMITS.rexMarketsNewsFollowupsPerReportPerDay
            : FREE_LIMITS.rexMarketsTechFollowupsPerReportPerDay;
          const countToday = await prisma.message.count({
            where: {
              conversationId: convId!,
              role: "user",
              timestamp: { gte: today },
              // Treat null/undefined as tech for legacy messages
              ...(isNews
                ? { followupKind: "news" }
                : { OR: [{ followupKind: "tech" }, { followupKind: null }] }),
            },
          });
          if (countToday >= limit) {
            return NextResponse.json(
              {
                ok: false,
                error: "Follow-up limit reached",
                code: "FREE_LIMIT_REACHED",
                plan: "FREE",
              },
              { status: 402 },
            );
          }
        } else {
          let usageFeature: UsageFeature =
            followupKind === "news"
              ? "REXMARKETS_NEWS_FOLLOWUP"
              : "REXMARKETS_TECH_FOLLOWUP";
          const usageResult = await checkAndIncrementUsage(userId, usageFeature);
          if (!usageResult.ok) {
            return NextResponse.json(
              {
                ok: false,
                error: "Follow-up limit reached",
                code: usageResult.reason,
                plan: usageResult.plan,
              },
              { status: 402 },
            );
          }
        }
      }

      // ---------- Daily Task Points: Award up to 300 points/day for user follow-up queries ----------
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
        const reachedDailyCap = !isNewDay && currentQueries >= 3;

        await prisma.user.update({
          where: { id: userId },
          data: {
            ...(reachedDailyCap ? {} : { points: { increment: 100 } }),
            lastQueryDate: new Date(),
            queriesToday: isNewDay ? 1 : Math.min(currentQueries + 1, 3),
          },
        });
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId: convId!,
        role,
        content,
        timestamp: timestamp ? new Date(timestamp) : undefined,
        // Persist for market reports so we can enforce 2 tech + 2 news per report per day (free tier)
        ...(report.reportType === "market" || report.chain === "market"
          ? { followupKind: followupKind ?? "tech" }
          : {}),
      },
    });

    await prisma.conversation.update({
      where: { id: convId! },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true, message });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
