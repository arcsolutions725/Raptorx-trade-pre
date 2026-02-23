/**
 * GET /api/kalshi/fills?ticker=...&limit=...&cursor=...
 *
 * Fetches the authenticated Kalshi account's fills (trade history) by calling
 * the Kalshi API directly with signed headers (no SDK).
 *
 * Auth: KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE.
 * Required env: KALSHI_API_KEY, KALSHI_PRIVATE_KEY.
 * Optional: KALSHI_BASE_PATH (default: https://api.elections.kalshi.com/trade-api/v2).
 *
 * Docs:
 * - https://docs.kalshi.com/getting_started/quick_start_authenticated_requests
 * - https://docs.kalshi.com/api-reference/portfolio/get-fills
 */

import { createPrivateKey, sign } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const PATH_SIGNED = "/trade-api/v2/portfolio/fills";

function getBaseUrl(): string {
  return (
    process.env.KALSHI_BASE_PATH ||
    "https://api.elections.kalshi.com/trade-api/v2"
  );
}

/**
 * Create KALSHI-ACCESS-SIGNATURE: RSA-PSS with SHA256, base64.
 * Message = timestamp + method + path (path without query params).
 */
function createSignature(
  privateKeyPem: string,
  timestamp: string,
  method: string,
  pathNoQuery: string
): string {
  const key = createPrivateKey({
    key: privateKeyPem.replace(/\\n/g, "\n"),
    format: "pem",
  });
  const message = `${timestamp}${method}${pathNoQuery}`;
  const signature = sign(
    "sha256",
    Buffer.from(message, "utf8"),
    {
      key,
      padding: 1, // RSA_PKCS1_PSS_PADDING
      saltLength: 32, // PSS digest length for SHA256
    } as Parameters<typeof sign>[2]
  );
  return signature.toString("base64");
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.KALSHI_API_KEY;
    const privateKeyPem = process.env.KALSHI_PRIVATE_KEY;

    if (!apiKey || !privateKeyPem) {
      return NextResponse.json(
        { error: "Kalshi API credentials are not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam
      ? Math.min(200, Math.max(1, parseInt(limitParam, 10)))
      : 100;
    const cursor = searchParams.get("cursor") ?? undefined;

    const timestamp = String(Date.now());
    const signature = createSignature(
      privateKeyPem,
      timestamp,
      "GET",
      PATH_SIGNED
    );

    const query = new URLSearchParams();
    if (ticker) query.set("ticker", ticker);
    query.set("limit", String(limit));
    if (cursor) query.set("cursor", cursor);

    const baseUrl = getBaseUrl().replace(/\/$/, "");
    const url = `${baseUrl}/portfolio/fills?${query.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "KALSHI-ACCESS-KEY": apiKey,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": signature,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Kalshi fills API error:", res.status, text);
      return NextResponse.json(
        { error: `Kalshi API returned ${res.status}: ${text}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = (await res.json()) as { fills?: unknown[]; cursor?: string };
    return NextResponse.json({
      fills: data.fills ?? [],
      cursor: data.cursor ?? undefined,
    });
  } catch (error) {
    console.error("Kalshi fills API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch fills";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
