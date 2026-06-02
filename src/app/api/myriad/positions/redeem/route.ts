import { NextRequest, NextResponse } from "next/server";
import { myriadPostJson } from "@/lib/myriad/serverFetch";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";

/**
 * POST /api/myriad/positions/redeem
 * Proxies Myriad POST /positions/redeem — returns { to, calldata, value } for the wallet to submit on-chain.
 * @see https://docs.myriad.markets/builders/myriad-order-book/order-book-api
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
  const mid = o.market_id ?? o.marketId;
  const nid = o.network_id ?? o.networkId;
  const marketId =
    typeof mid === "number" && Number.isFinite(mid) && mid > 0
      ? Math.trunc(mid)
      : typeof mid === "string" && /^\d+$/.test(mid.trim())
        ? parseInt(mid.trim(), 10)
        : NaN;
  if (!Number.isFinite(marketId) || marketId <= 0) {
    return NextResponse.json({ error: "Invalid market_id" }, { status: 400 });
  }
  let networkId = MYRIAD_ORDER_BOOK_CHAIN_ID;
  if (typeof nid === "number" && Number.isFinite(nid) && nid > 0) {
    networkId = Math.trunc(nid);
  } else if (typeof nid === "string" && /^\d+$/.test(nid.trim())) {
    networkId = parseInt(nid.trim(), 10);
  }

  const payload = { market_id: marketId, network_id: networkId };

  try {
    const res = await myriadPostJson("/positions/redeem", payload);
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
        { error: `Myriad redeem ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad redeem proxy failed: ${msg}` }, { status: 502 });
  }
}
