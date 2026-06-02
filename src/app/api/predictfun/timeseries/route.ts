import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";

const ALLOWED_METRIC = new Set(["chance"]);
const ALLOWED_RESOLUTION = new Set(["1m", "5m", "1h", "1d", "1w", "1M"]);

/** GET /api/predictfun/timeseries?id=...&metric=chance&resolution=...&from=...&to=... */
export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const id = incoming.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const params = new URLSearchParams(incoming.toString());
  params.delete("id");

  const metric = (params.get("metric") ?? "chance").trim();
  if (!ALLOWED_METRIC.has(metric)) {
    return NextResponse.json(
      { error: `Invalid metric (allowed: chance)` },
      { status: 400 }
    );
  }
  params.set("metric", metric);

  const resolution = (params.get("resolution") ?? "1h").trim();
  if (!ALLOWED_RESOLUTION.has(resolution)) {
    return NextResponse.json(
      { error: `Invalid resolution (allowed: 1m, 5m, 1h, 1d, 1w, 1M)` },
      { status: 400 }
    );
  }
  params.set("resolution", resolution);

  const fromRaw = params.get("from")?.trim();
  if (!fromRaw || !/^\d+$/.test(fromRaw)) {
    return NextResponse.json({ error: "Missing or invalid from" }, { status: 400 });
  }
  params.set("from", fromRaw);

  const toRaw = params.get("to")?.trim();
  if (toRaw) {
    if (!/^\d+$/.test(toRaw)) {
      return NextResponse.json({ error: "Invalid to" }, { status: 400 });
    }
    params.set("to", toRaw);
  } else {
    params.delete("to");
  }

  const limitRaw = params.get("limit")?.trim();
  if (limitRaw) {
    const n = Math.max(1, Math.min(5000, parseInt(limitRaw, 10) || 0));
    if (!n) params.delete("limit");
    else params.set("limit", String(n));
  }

  try {
    const { ok, status, body, text } = await predictFunGetJson(
      `/markets/${encodeURIComponent(id)}/timeseries`,
      params
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
