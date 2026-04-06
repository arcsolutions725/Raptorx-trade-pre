import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateProSubscription, recordSubscriptionHistory } from "@/lib/subscription/limits";

/**
 * Helio / MoonPay Commerce webhook for Pay Link and Subscription events.
 * @see https://docs.hel.io/reference/overview-2
 *
 * Configure this URL in Helio Dashboard (Developer → Webhooks). Helio sends
 * Authorization: Bearer <token> with each request; we verify it.
 *
 * Pay Link: event "CREATED". Subscriptions: "STARTED", "RENEWED", "ENDED".
 * Payload: { event, transaction (JSON string), transactionObject: { id, paylinkId, meta: { transactionStatus, customerDetails } } }.
 *
 * Env (only): HELIO_PUBLIC_API_KEY, HELIO_SECRET_API_KEY. Bearer validation uses HELIO_SECRET_API_KEY.
 */
export async function POST(request: NextRequest) {
  try {
    const secretApiKey = process.env.HELIO_SECRET_API_KEY;
    if (secretApiKey) {
      const auth = request.headers.get("authorization");
      const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
      if (bearer !== secretApiKey) {
        console.warn("Subscription webhook: invalid or missing Bearer token");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", ok: false }, { status: 400 });
    }

    // Official Helio payload: event + transactionObject (or transaction as JSON string)
    const event = typeof body.event === "string" ? body.event : null;
    let transactionObject: Record<string, unknown> =
      body.transactionObject && typeof body.transactionObject === "object"
        ? body.transactionObject
        : {};
    if (Object.keys(transactionObject).length === 0 && typeof body.transaction === "string") {
      try {
        const parsed = JSON.parse(body.transaction) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") transactionObject = parsed;
      } catch {
        // ignore
      }
    }

    const meta = (transactionObject.meta && typeof transactionObject.meta === "object"
      ? transactionObject.meta
      : {}) as Record<string, unknown>;
    const customerDetails = (meta.customerDetails && typeof meta.customerDetails === "object"
      ? meta.customerDetails
      : {}) as Record<string, unknown>;

    const status = (meta.transactionStatus ?? meta.status ?? "").toString().toUpperCase();
    const successValues = ["SUCCESS", "COMPLETED", "SUCCEEDED"];
    if (status && !successValues.includes(status)) {
      console.log("Subscription webhook: ignoring non-success status", status);
      return NextResponse.json({ ok: true, skipped: "status" });
    }

    // Pay link CREATED or subscription STARTED/RENEWED — accept; ENDED we could optionally downgrade later
    const activatingEvents = ["CREATED", "STARTED", "RENEWED"];
    if (event && !activatingEvents.includes(event)) {
      console.log("Subscription webhook: ignoring event", event);
      return NextResponse.json({ ok: true, skipped: "event" });
    }

    // Extract userId: meta.userId, customerDetails.userId, additionalJSON (string or object), content
    let userId: string | null =
      (meta.userId as string) ?? (customerDetails.userId as string) ?? null;
    const content = (meta.content as Record<string, unknown>) ?? {};
    if (!userId) userId = (content.userId as string) ?? null;
    if (!userId && typeof customerDetails.additionalJSON === "string") {
      try {
        const extra = JSON.parse(customerDetails.additionalJSON) as Record<string, unknown>;
        if (extra?.userId) userId = String(extra.userId);
      } catch {
        // ignore
      }
    }
    if (!userId && customerDetails.additionalJSON && typeof customerDetails.additionalJSON === "object") {
      const extra = customerDetails.additionalJSON as Record<string, unknown>;
      if (extra?.userId) userId = String(extra.userId);
    }
    const privyId =
      (meta.privyId as string) ?? (customerDetails.privyId as string) ?? (customerDetails.customerId as string) ?? null;
    const email = (customerDetails.email as string) ?? null;

    let user: { id: string } | null = null;
    if (userId && typeof userId === "string" && userId.trim()) {
      user = await prisma.user.findUnique({
        where: { id: userId.trim() },
        select: { id: true },
      });
    }
    if (!user && privyId && typeof privyId === "string" && privyId.trim()) {
      user = await prisma.user.findUnique({
        where: { privyId: privyId.trim() },
        select: { id: true },
      });
    }
    if (!user && email && typeof email === "string" && email.trim()) {
      user = await prisma.user.findUnique({
        where: { email: email.trim() },
        select: { id: true },
      });
    }

    if (!user) {
      console.warn("Subscription webhook: no user found", { userId: !!userId, privyId: !!privyId, email: !!email });
      return NextResponse.json(
        { error: "User not found", ok: false },
        { status: 404 },
      );
    }

    await activateProSubscription(user.id);

    const externalId =
      (transactionObject.id as string) ??
      (transactionObject.transactionId as string) ??
      null;
    await recordSubscriptionHistory({
      userId: user.id,
      transactionId: externalId ?? undefined,
    }).catch((err) => {
      console.warn("Subscription webhook: failed to record history", err);
    });

    console.log("Subscription webhook: activated CLAW_PRO for user", user.id, "event:", event);
    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error("Subscription webhook error:", err);
    return NextResponse.json(
      { error: "Internal error", ok: false },
      { status: 500 },
    );
  }
}
