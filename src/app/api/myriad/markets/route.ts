import { NextRequest, NextResponse } from "next/server";
import { resolveMyriadMarketsListNetworkId } from "@/lib/myriad/myriadProtocolNetwork";

const DEFAULT_BASE = "https://api-v2.myriadprotocol.com";

/**
 * GET /api/myriad/markets
 * Proxies Myriad Protocol GET /markets with server-side x-api-key.
 * When `network_id` is omitted, restricts to BNB Smart Chain (default **56**; override with
 * `MYRIAD_MARKETS_NETWORK_ID` if Myriad expects a protocol id such as **2741**).
 * @see https://docs.myriad.markets/builders/myriad-api-reference
 */
export async function GET(request: NextRequest) {
  const key = process.env.MYRIAD_API_KEY?.trim();
  const baseRaw =
    process.env.MYRIAD_API_BASE_URL?.trim() || DEFAULT_BASE;
  const base = baseRaw.replace(/\/+$/, "");

  const incoming = request.nextUrl.searchParams;
  const params = new URLSearchParams(incoming.toString());
  if (!params.has("state")) {
    params.set("state", "open");
  }
  /** Default so listings include AMM + order-book markets (API default is AMM-only). */
  if (!params.has("trading_model")) {
    params.set("trading_model", "all");
  }
  if (!params.has("network_id")) {
    params.set("network_id", resolveMyriadMarketsListNetworkId());
  }

  const url = `${base}/markets?${params.toString()}`;

  const headers: HeadersInit = {
    Accept: "application/json",
  };
  if (key) {
    (headers as Record<string, string>)["x-api-key"] = key;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        detail = j.detail || j.message || j.error || detail;
      } catch {
        /* use text */
      }
      return NextResponse.json(
        { error: `Myriad API error (${res.status}): ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from Myriad API" },
        { status: 502 }
      );
    }

    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Myriad proxy failed: ${msg}` },
      { status: 502 }
    );
  }
}
