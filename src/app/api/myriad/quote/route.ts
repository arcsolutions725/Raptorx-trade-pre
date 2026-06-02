import { NextRequest, NextResponse } from "next/server";
import { myriadPostJson } from "@/lib/myriad/serverFetch";

/**
 * POST /api/myriad/quote
 * Proxies Myriad POST /markets/quote (AMM trade calldata).
 * @see https://docs.myriad.markets/builders/myriad-api-reference
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  try {
    const res = await myriadPostJson("/markets/quote", body);
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      let detail = text.slice(0, 500);
      if (typeof data === "object" && data !== null) {
        const d = data as { detail?: unknown; message?: unknown; error?: unknown };
        if (typeof d.error === "string") detail = d.error;
        else if (typeof d.detail === "string") detail = d.detail;
        else if (typeof d.message === "string") detail = d.message;
      }
      return NextResponse.json(
        { error: `Myriad quote ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad quote proxy failed: ${msg}` }, { status: 502 });
  }
}
