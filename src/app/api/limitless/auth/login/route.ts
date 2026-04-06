import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * POST /api/limitless/auth/login
 * Proxies Limitless auth login. Body: { address, signingMessageHex, signature }.
 * Forwards to Limitless with x-account, x-signing-message, x-signature.
 * Returns user data including id (ownerId for order submission).
 * @see https://api.limitless.exchange/api-v1#description/typescript-helpers-minimal
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const address = typeof body?.address === "string" ? body.address.trim() : null;
    const signingMessageHex =
      typeof body?.signingMessageHex === "string" ? body.signingMessageHex : null;
    const signature =
      typeof body?.signature === "string" ? body.signature : null;

    if (!address || !signingMessageHex || !signature) {
      return NextResponse.json(
        { error: "address, signingMessageHex, and signature are required" },
        { status: 400 }
      );
    }

    const res = await fetch(`${LIMITLESS_API}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-account": address,
        "x-signing-message": signingMessageHex,
        "x-signature": signature,
      },
      body: JSON.stringify({ client: "eoa" }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Limitless login ${res.status}: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const setCookie = res.headers.get("set-cookie");
    const sessionCookie =
      setCookie?.match(/limitless_session=([^;]+)/)?.[1] ?? null;
    return NextResponse.json(
      sessionCookie ? { ...data, sessionCookie } : data
    );
  } catch (e) {
    console.error("Limitless login error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 500 }
    );
  }
}
