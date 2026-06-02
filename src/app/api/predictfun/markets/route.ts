import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";

/**
 * GET /api/predictfun/markets
 * Proxies GET /v1/markets with cursor pagination.
 */
export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const params = new URLSearchParams(incoming.toString());

  if (!params.has("status")) params.set("status", "OPEN");
  if (!params.has("sort")) params.set("sort", "VOLUME_24H_DESC");
  if (!params.has("includeStats")) params.set("includeStats", "true");
  if (!params.has("first") && !params.has("limit")) {
    params.set("first", incoming.get("limit") ?? "25");
  }

  try {
    const { ok, status, body, text } = await predictFunGetJson("/markets", params);
    if (!ok) {
      return NextResponse.json(
        { error: `Predict.fun API error (${status})`, detail: text.slice(0, 500) },
        { status: status >= 500 ? 502 : status }
      );
    }
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Predict.fun proxy failed: ${msg}` }, { status: 502 });
  }
}
