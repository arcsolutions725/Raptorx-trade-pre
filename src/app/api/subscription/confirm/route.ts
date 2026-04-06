import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateProSubscription, recordSubscriptionHistory } from "@/lib/subscription/limits";
import {
  getHelioTransactions,
  findTransactionById,
  isSuccessfulTransaction,
  getUserIdFromTransaction,
} from "@/lib/subscription/helio";

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

/**
 * POST /api/subscription/confirm
 *
 * Called from the subscribe/success page after payment. Verifies the payment
 * with Helio (MoonPay Commerce) and activates CLAW_PRO for the current user.
 *
 * Body: { transactionId?: string, trustWebhook?: boolean }.
 *   trustWebhook: if true and we can't verify via API, return 200 with pending: true (webhook will activate).
 *       Success URL can include ?transactionId=... if your provider appends it.
 * Headers: x-user-id (required) — our User.id.
 *
 * Env (only): HELIO_PUBLIC_API_KEY, HELIO_SECRET_API_KEY (from Helio Dashboard → Developer → API).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const body = await request.json().catch(() => ({}));
    const fromBody =
      typeof body?.transactionId === "string"
        ? body.transactionId.trim()
        : typeof body?.transaction_id === "string"
          ? body.transaction_id.trim()
          : null;
    const fromQuery =
      request.nextUrl.searchParams.get("transactionId") ||
      request.nextUrl.searchParams.get("transaction_id") ||
      request.nextUrl.searchParams.get("id");
    const transactionId = fromBody || (fromQuery ? String(fromQuery).trim() : null);
    const trustWebhook = body?.trustWebhook === true;

    // Ensure user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionPlan: true, subscriptionPeriodEnd: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "User not found", ok: false },
        { status: 404 }
      );
    }

    const publicApiKey = process.env.HELIO_PUBLIC_API_KEY;
    const secretApiKey = process.env.HELIO_SECRET_API_KEY;
    let verified = false;

    if (publicApiKey && secretApiKey) {
      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000); // last 24 hours (Helio can delay)
      const transactions = await getHelioTransactions({
        apiKey: publicApiKey,
        bearerToken: secretApiKey,
        from,
        to,
      });

      if (transactionId) {
        const t = findTransactionById(transactions, transactionId);
        if (t && isSuccessfulTransaction(t)) {
          const metaUserId = getUserIdFromTransaction(t);
          if (metaUserId && metaUserId !== userId) {
            return NextResponse.json(
              { error: "Transaction does not match current user", ok: false },
              { status: 403 }
            );
          }
          verified = true;
        }
      } else {
        // No transactionId: only accept if we find a recent SUCCESS with metadata userId matching this user
        const successTx = transactions.find(
          (t) => isSuccessfulTransaction(t) && getUserIdFromTransaction(t) === userId
        );
        if (successTx) verified = true;
      }
    } else {
      // Missing Helio credentials: cannot verify; ask env to be set (avoids abuse)
      const missing = !publicApiKey ? "HELIO_PUBLIC_API_KEY" : "HELIO_SECRET_API_KEY";
      return NextResponse.json(
        {
          error: `Payment verification not configured. Set ${missing} (and both HELIO_PUBLIC_API_KEY and HELIO_SECRET_API_KEY from Helio Dashboard → Developer → API) to verify and activate.`,
          ok: false,
        },
        { status: 503 }
      );
    }

    if (!verified) {
      // Per Helio docs, webhooks are the recommended way to verify. If the client
      // sent trustWebhook (e.g. redirect without transactionId or widget onSuccess),
      // return success so UI doesn't block; webhook will activate the user.
      if (trustWebhook) {
        return NextResponse.json({
          ok: true,
          activated: false,
          pending: true,
          message: "Payment received; subscription will activate shortly. Refresh in a few seconds.",
        });
      }
      return NextResponse.json(
        {
          error: "Could not verify payment. Try again or contact support.",
          ok: false,
        },
        { status: 400 }
      );
    }

    const activated = await activateProSubscription(userId);
    if (!activated) {
      console.error("Subscription confirm: activateProSubscription failed for user", userId);
      return NextResponse.json(
        { error: "Failed to update subscription", ok: false },
        { status: 500 }
      );
    }

    await recordSubscriptionHistory({
      userId,
      transactionId: transactionId ?? undefined,
    }).catch((err) => {
      console.warn("Subscription confirm: failed to record history", err);
    });

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true, subscriptionPeriodStart: true, subscriptionPeriodEnd: true },
    });
    return NextResponse.json({
      ok: true,
      activated: true,
      subscriptionPlan: updated?.subscriptionPlan ?? "CLAW_PRO",
      subscriptionPeriodEnd: updated?.subscriptionPeriodEnd?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("x-user-id")) {
      return NextResponse.json(
        { error: "Unauthorized", ok: false },
        { status: 401 }
      );
    }
    console.error("Subscription confirm error:", err);
    return NextResponse.json(
      { error: "Internal error", ok: false },
      { status: 500 }
    );
  }
}
