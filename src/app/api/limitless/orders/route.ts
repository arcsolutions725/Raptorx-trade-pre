import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * POST /api/limitless/orders
 * Proxies order submission to Limitless using the **user's session** only (no app API key).
 * Each user must sign in to Limitless first (wallet + signing message); their session cookie
 * authenticates the order as that user, so any user can trade with their own Privy/wallet.
 * Body: { order, ownerId, orderType, marketSlug, sessionCookie }.
 * @see https://api.limitless.exchange/api-v1#tag/trading/POST/orders
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const order = body?.order;
    const ownerIdRaw = body?.ownerId;
    const orderType = body?.orderType ?? "GTC";
    const marketSlugRaw = body?.marketSlug;
    const sessionCookie =
      typeof body?.sessionCookie === "string" && body.sessionCookie.trim()
        ? body.sessionCookie.trim()
        : null;

    const ownerId =
      ownerIdRaw != null && ownerIdRaw !== ""
        ? String(ownerIdRaw)
        : null;
    const marketSlug =
      typeof marketSlugRaw === "string" ? marketSlugRaw.trim() : "";

    if (
      !order ||
      typeof order !== "object" ||
      Array.isArray(order) ||
      !ownerId ||
      !marketSlug
    ) {
      return NextResponse.json(
        { error: "order, ownerId, and marketSlug are required" },
        { status: 400 }
      );
    }

    if (!sessionCookie) {
      return NextResponse.json(
        {
          error:
            "Limitless session required. Please sign in to Limitless (Initialize Trading) before placing an order.",
        },
        { status: 401 }
      );
    }

    const ownerIdNum = Number(ownerId);
    if (Number.isNaN(ownerIdNum)) {
      return NextResponse.json(
        { error: "ownerId must be a valid number" },
        { status: 400 }
      );
    }
    const orderForApi = {
      ...order,
      expiration: String(order.expiration ?? 0),
    };

    const makerAddress =
      typeof order.maker === "string" && order.maker.trim()
        ? order.maker.trim()
        : typeof order.signer === "string" && order.signer.trim()
          ? order.signer.trim()
          : null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: `limitless_session=${sessionCookie}`,
    };
    if (makerAddress) headers["x-account"] = makerAddress;

    const res = await fetch(`${LIMITLESS_API}/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        order: orderForApi,
        ownerId: ownerIdNum,
        orderType,
        marketSlug,
      }),
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Limitless orders ${res.status}: ${text}` },
        { status: res.status }
      );
    }

    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("Limitless orders error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Order submission failed" },
      { status: 500 }
    );
  }
}
