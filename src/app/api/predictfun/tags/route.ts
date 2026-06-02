import { NextResponse } from "next/server";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";

/** GET /api/predictfun/tags — proxies GET /v1/tags */
export async function GET() {
  try {
    const { ok, status, body, text } = await predictFunGetJson("/tags");
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
