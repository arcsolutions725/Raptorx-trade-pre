import { NextRequest, NextResponse } from "next/server";
import { myriadPostJson } from "@/lib/myriad/serverFetch";

/**
 * POST /api/myriad/markets/claim
 * Proxies Myriad POST /markets/claim — returns { action, outcome_id, calldata } for resolved markets.
 * Submit calldata to the Prediction Market contract on the market’s chain (BSC: see NEXT_PUBLIC_MYRIAD_PREDICTION_MARKET).
 * @see https://docs.myriad.markets/builders/myriad-api-reference (POST /markets/claim)
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
  const o = body as Record<string, unknown>;
  const slug = typeof o.market_slug === "string" ? o.market_slug.trim() : "";
  const midRaw = o.market_id ?? o.marketId;
  const nidRaw = o.network_id ?? o.networkId;
  const oidRaw = o.outcome_id ?? o.outcomeId;

  const payload: Record<string, unknown> = {};

  if (slug) {
    payload.market_slug = slug;
  } else {
    const marketId =
      typeof midRaw === "number" && Number.isFinite(midRaw) && midRaw > 0
        ? Math.trunc(midRaw)
        : typeof midRaw === "string" && /^\d+$/.test(midRaw.trim())
          ? parseInt(midRaw.trim(), 10)
          : NaN;
    if (!Number.isFinite(marketId) || marketId <= 0) {
      return NextResponse.json(
        { error: "Provide market_slug or positive market_id with network_id" },
        { status: 400 }
      );
    }
    const networkId =
      typeof nidRaw === "number" && Number.isFinite(nidRaw) && nidRaw > 0
        ? Math.trunc(nidRaw)
        : typeof nidRaw === "string" && /^\d+$/.test(nidRaw.trim())
          ? parseInt(nidRaw.trim(), 10)
          : NaN;
    if (!Number.isFinite(networkId) || networkId <= 0) {
      return NextResponse.json({ error: "network_id is required with market_id" }, { status: 400 });
    }
    payload.market_id = marketId;
    payload.network_id = networkId;
  }

  if (oidRaw !== undefined && oidRaw !== null && oidRaw !== "") {
    const oid =
      typeof oidRaw === "number" && Number.isFinite(oidRaw)
        ? Math.trunc(oidRaw)
        : typeof oidRaw === "string" && /^\d+$/.test(oidRaw.trim())
          ? parseInt(oidRaw.trim(), 10)
          : NaN;
    if (Number.isFinite(oid)) payload.outcome_id = oid;
  }

  try {
    const res = await myriadPostJson("/markets/claim", payload);
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
        { error: `Myriad claim ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad claim proxy failed: ${msg}` }, { status: 502 });
  }
}
