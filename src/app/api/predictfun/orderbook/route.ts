import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";

/** GET /api/predictfun/orderbook?id=... */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const { ok, status, body, text } = await predictFunGetJson(
      `/markets/${encodeURIComponent(id)}/orderbook`
    );
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
