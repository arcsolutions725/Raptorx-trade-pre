import { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** RexScreener free tier: 2 coin reports/day (3rd triggers paywall), 2 queries per report/day (3rd per report triggers paywall). */
export const FREE_LIMITS = {
  clawMessagesPerDay: 2,
  /** Max free coin reports per day; from 3rd report we require payment modal. */
  rexScreenerReportsPerDay: 2,
  /** Max free follow-up queries per report per day; from 3rd question per report we require payment modal. */
  rexScreenerFollowupsPerReportPerDay: 2,
  /** RexMarkets: 2 news intelligence reports/day total (3rd → paywall). */
  rexMarketsReportsPerDay: 2,
  rexMarketsTechReportsPerDay: 2,
  rexMarketsNewsReportsPerDay: 2,
  /** Max free tech follow-ups per report per day; 3rd tech query → paywall. */
  rexMarketsTechFollowupsPerReportPerDay: 2,
  /** Max free news follow-ups per report per day; 3rd news query → paywall. */
  rexMarketsNewsFollowupsPerReportPerDay: 2,
} as const;

export const PAID_LIMITS = {
  clawMessagesPerPeriod: 90,
  rexScreenerReportsPerPeriod: 100,
  rexScreenerFollowupsPerReport: 3,
  rexMarketsReportsPerPeriod: 50,
  rexMarketsTechFollowupsPerReport: 3,
  rexMarketsNewsFollowupsPerReport: 3,
} as const;

export type UsageFeature =
  | "CLAW_MESSAGE"
  | "REXSCREENER_REPORT"
  | "REXSCREENER_FOLLOWUP"
  | "REXMARKETS_TECH_REPORT"
  | "REXMARKETS_NEWS_REPORT"
  | "REXMARKETS_TECH_FOLLOWUP"
  | "REXMARKETS_NEWS_FOLLOWUP";

export type UsageCheckResult =
  | { ok: true; plan: "FREE" | "CLAW_PRO"; remaining: number | null }
  | {
      ok: false;
      plan: "FREE" | "CLAW_PRO" | null;
      reason:
        | "FREE_LIMIT_REACHED"
        | "PAID_LIMIT_REACHED"
        | "PLAN_EXPIRED"
        | "NO_ACTIVE_PLAN";
    };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function checkAndIncrementUsage(
  userId: string,
  feature: UsageFeature,
): Promise<UsageCheckResult> {
  const today = startOfToday();
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, plan: null, reason: "NO_ACTIVE_PLAN" };
  }

  const data: Record<string, unknown> = {};

  let {
    subscriptionPlan,
    subscriptionPeriodStart,
    subscriptionPeriodEnd,
    clawMessagesThisPeriod,
    rexScreenerReportsThisPeriod,
    rexScreenerFollowupsThisPeriod,
    rexMarketsReportsThisPeriod,
    rexMarketsTechFollowupsThisPeriod,
    rexMarketsNewsFollowupsThisPeriod,
    freeTierUsageDate,
    clawFreeMessagesToday,
    rexScreenerFreeReportsToday,
    rexMarketsFreeTechReportsToday,
    rexMarketsFreeNewsReportsToday,
  } = user as any;

  if (!freeTierUsageDate || freeTierUsageDate < today) {
    data.freeTierUsageDate = now;
    data.clawFreeMessagesToday = clawFreeMessagesToday = 0;
    data.rexScreenerFreeReportsToday = rexScreenerFreeReportsToday = 0;
    data.rexMarketsFreeTechReportsToday = rexMarketsFreeTechReportsToday = 0;
    data.rexMarketsFreeNewsReportsToday = rexMarketsFreeNewsReportsToday = 0;
  }

  // Coerce to numbers so DB/Prisma string values don't break limits (e.g. "1" + 1)
  const rexFree = Number(rexScreenerFreeReportsToday) || 0;
  const clawFree = Number(clawFreeMessagesToday) || 0;
  const rexMarketsTechFree = Number(rexMarketsFreeTechReportsToday) || 0;
  const rexMarketsNewsFree = Number(rexMarketsFreeNewsReportsToday) || 0;

  const hasPaidBundle =
    subscriptionPlan === "CLAW_PRO" &&
    subscriptionPeriodEnd &&
    subscriptionPeriodEnd > now;

  if (subscriptionPlan === "CLAW_PRO" && !hasPaidBundle) {
    subscriptionPlan = "FREE";
    data.subscriptionPlan = SubscriptionPlan.FREE;
    data.subscriptionPeriodStart = null;
    data.subscriptionPeriodEnd = null;
    data.clawMessagesThisPeriod = clawMessagesThisPeriod = 0;
    data.rexScreenerReportsThisPeriod = rexScreenerReportsThisPeriod = 0;
    data.rexScreenerFollowupsThisPeriod = rexScreenerFollowupsThisPeriod = 0;
    data.rexMarketsReportsThisPeriod = rexMarketsReportsThisPeriod = 0;
    data.rexMarketsTechFollowupsThisPeriod =
      rexMarketsTechFollowupsThisPeriod = 0;
    data.rexMarketsNewsFollowupsThisPeriod =
      rexMarketsNewsFollowupsThisPeriod = 0;
  }

  if (!hasPaidBundle) {
    switch (feature) {
      case "CLAW_MESSAGE":
        if (clawFree >= FREE_LIMITS.clawMessagesPerDay) {
          return { ok: false, plan: "FREE", reason: "FREE_LIMIT_REACHED" };
        }
        data.clawFreeMessagesToday = clawFree + 1;
        break;
      case "REXSCREENER_REPORT":
        // Allow 2 free reports per day; block on 3rd (paywall).
        if (rexFree >= FREE_LIMITS.rexScreenerReportsPerDay) {
          return { ok: false, plan: "FREE", reason: "FREE_LIMIT_REACHED" };
        }
        data.rexScreenerFreeReportsToday = rexFree + 1;
        break;
      case "REXMARKETS_TECH_REPORT":
      case "REXMARKETS_NEWS_REPORT": {
        // 2 reports/day total (tech + news); 3rd report → paywall
        const totalReportsToday = rexMarketsTechFree + rexMarketsNewsFree;
        if (totalReportsToday >= FREE_LIMITS.rexMarketsReportsPerDay) {
          return { ok: false, plan: "FREE", reason: "FREE_LIMIT_REACHED" };
        }
        if (feature === "REXMARKETS_TECH_REPORT") {
          data.rexMarketsFreeTechReportsToday = rexMarketsTechFree + 1;
        } else {
          data.rexMarketsFreeNewsReportsToday = rexMarketsNewsFree + 1;
        }
        break;
      }
      case "REXSCREENER_FOLLOWUP":
      case "REXMARKETS_TECH_FOLLOWUP":
      case "REXMARKETS_NEWS_FOLLOWUP":
        return { ok: false, plan: "FREE", reason: "NO_ACTIVE_PLAN" };
    }

    await prisma.user.update({ where: { id: userId }, data });
    return { ok: true, plan: "FREE", remaining: null };
  }

  switch (feature) {
    case "CLAW_MESSAGE":
      if (
        clawMessagesThisPeriod >= PAID_LIMITS.clawMessagesPerPeriod
      ) {
        return { ok: false, plan: "CLAW_PRO", reason: "PAID_LIMIT_REACHED" };
      }
      clawMessagesThisPeriod += 1;
      data.clawMessagesThisPeriod = clawMessagesThisPeriod;
      break;
    case "REXSCREENER_REPORT":
      if (
        rexScreenerReportsThisPeriod >=
        PAID_LIMITS.rexScreenerReportsPerPeriod
      ) {
        return { ok: false, plan: "CLAW_PRO", reason: "PAID_LIMIT_REACHED" };
      }
      rexScreenerReportsThisPeriod += 1;
      data.rexScreenerReportsThisPeriod = rexScreenerReportsThisPeriod;
      break;
    case "REXSCREENER_FOLLOWUP":
      if (
        rexScreenerFollowupsThisPeriod >=
        PAID_LIMITS.rexScreenerReportsPerPeriod *
          PAID_LIMITS.rexScreenerFollowupsPerReport
      ) {
        return { ok: false, plan: "CLAW_PRO", reason: "PAID_LIMIT_REACHED" };
      }
      rexScreenerFollowupsThisPeriod += 1;
      data.rexScreenerFollowupsThisPeriod = rexScreenerFollowupsThisPeriod;
      break;
    case "REXMARKETS_TECH_REPORT":
    case "REXMARKETS_NEWS_REPORT":
      if (
        rexMarketsReportsThisPeriod >=
        PAID_LIMITS.rexMarketsReportsPerPeriod
      ) {
        return { ok: false, plan: "CLAW_PRO", reason: "PAID_LIMIT_REACHED" };
      }
      rexMarketsReportsThisPeriod += 1;
      data.rexMarketsReportsThisPeriod = rexMarketsReportsThisPeriod;
      break;
    case "REXMARKETS_TECH_FOLLOWUP":
      if (
        rexMarketsTechFollowupsThisPeriod >=
        PAID_LIMITS.rexMarketsReportsPerPeriod *
          PAID_LIMITS.rexMarketsTechFollowupsPerReport
      ) {
        return { ok: false, plan: "CLAW_PRO", reason: "PAID_LIMIT_REACHED" };
      }
      rexMarketsTechFollowupsThisPeriod += 1;
      data.rexMarketsTechFollowupsThisPeriod =
        rexMarketsTechFollowupsThisPeriod;
      break;
    case "REXMARKETS_NEWS_FOLLOWUP":
      if (
        rexMarketsNewsFollowupsThisPeriod >=
        PAID_LIMITS.rexMarketsReportsPerPeriod *
          PAID_LIMITS.rexMarketsNewsFollowupsPerReport
      ) {
        return { ok: false, plan: "CLAW_PRO", reason: "PAID_LIMIT_REACHED" };
      }
      rexMarketsNewsFollowupsThisPeriod += 1;
      data.rexMarketsNewsFollowupsThisPeriod =
        rexMarketsNewsFollowupsThisPeriod;
      break;
  }

  await prisma.user.update({ where: { id: userId }, data });

  return { ok: true, plan: "CLAW_PRO", remaining: null };
}

/** Subscription period length in days for CLAW_PRO ($49.90/month). */
const SUBSCRIPTION_PERIOD_DAYS = 30;

/**
 * Activate or renew CLAW_PRO for a user (e.g. after successful payment).
 * Updates user table: subscriptionPlan = CLAW_PRO, period start/end (30 days), resets period usage counters.
 * Returns false if user not found (avoids throwing so webhook can return 404).
 */
export async function activateProSubscription(userId: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existing) return false;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + SUBSCRIPTION_PERIOD_DAYS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionPlan: SubscriptionPlan.CLAW_PRO,
      subscriptionPeriodStart: now,
      subscriptionPeriodEnd: periodEnd,
      clawMessagesThisPeriod: 0,
      rexScreenerReportsThisPeriod: 0,
      rexScreenerFollowupsThisPeriod: 0,
      rexMarketsReportsThisPeriod: 0,
      rexMarketsTechFollowupsThisPeriod: 0,
      rexMarketsNewsFollowupsThisPeriod: 0,
    },
  });
  return true;
}

export type RecordSubscriptionHistoryParams = {
  userId: string;
  transactionId?: string | null;
};

/**
 * Save a row to Subscription table when user subscribes (MoonPay).
 * Call after activateProSubscription. Stores userId and MoonPay transactionId.
 */
export async function recordSubscriptionHistory(
  params: RecordSubscriptionHistoryParams,
): Promise<void> {
  const { userId, transactionId } = params;
  await prisma.subscription.create({
    data: {
      userId,
      transactionId: transactionId ?? undefined,
    },
  });
}

