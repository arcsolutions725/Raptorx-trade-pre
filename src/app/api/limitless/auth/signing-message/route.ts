import { NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * GET /api/limitless/auth/signing-message
 * Proxies Limitless auth signing message for wallet login.
 * @see https://api.limitless.exchange/api-v1#description/typescript-helpers-minimal
 */
export async function GET() {
  try {
    const res = await fetch(`${LIMITLESS_API}/auth/signing-message`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Limitless auth ${res.status}: ${text}` },
        { status: res.status }
      );
    }
    const text = await res.text();
    return new NextResponse(text, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e) {
    console.error("Limitless signing-message error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get signing message" },
      { status: 500 }
    );
  }
}
