import { NextRequest, NextResponse } from "next/server";
import { myriadFetchText, myriadPostJson } from "@/lib/myriad/serverFetch";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";

/** Server default for Myriad `network_id`; override with MYRIAD_ORDER_NETWORK_ID. */
function defaultMyriadOrdersNetworkId(): number {
  const raw = process.env.MYRIAD_ORDER_NETWORK_ID?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return MYRIAD_ORDER_BOOK_CHAIN_ID;
}

/** Client may send camelCase `networkId` or doc-style `network_id`. */
function networkIdFromRequestBody(o: Record<string, unknown>): number {
  const raw = o.networkId ?? o.network_id;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return defaultMyriadOrdersNetworkId();
}

/**
 * GET /api/myriad/orders?trader=0x...&network_id=56&status=&limit=&offset=
 * Proxies Myriad GET /orders (order history / open orders).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const trader = sp.get("trader")?.trim();
  if (!trader || !trader.startsWith("0x")) {
    return NextResponse.json({ error: "Missing or invalid trader address" }, { status: 400 });
  }

  const q = new URLSearchParams();
  q.set("trader", trader);
  const nid = sp.get("network_id")?.trim() ?? String(MYRIAD_ORDER_BOOK_CHAIN_ID);
  q.set("network_id", nid);
  const status = sp.get("status")?.trim();
  if (status) q.set("status", status);
  const limit = sp.get("limit")?.trim() ?? "100";
  q.set("limit", limit);
  const offset = sp.get("offset")?.trim() ?? "0";
  q.set("offset", offset);

  try {
    const res = await myriadFetchText("/orders", q);
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        detail = j.detail || j.message || j.error || detail;
      } catch {
        /* */
      }
      return NextResponse.json(
        { error: `Myriad orders ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(JSON.parse(text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad orders GET failed: ${msg}` }, { status: 502 });
  }
}

/**
 * POST /api/myriad/orders
 * Proxies signed CLOB orders to Myriad POST /orders with server x-api-key.
 * Forwards `network_id` to Myriad from body `networkId` / `network_id`, else default **56** (BSC).
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
  const order = o.order;
  const signature = o.signature;
  if (!order || typeof order !== "object" || typeof signature !== "string" || !signature.startsWith("0x")) {
    return NextResponse.json(
      { error: "Missing or invalid order / signature" },
      { status: 400 }
    );
  }

  const ord = order as Record<string, unknown>;
  const trader = ord.trader;
  const midRaw = ord.marketId;
  if (typeof trader !== "string" || midRaw === undefined || midRaw === null) {
    return NextResponse.json({ error: "Invalid order.trader or order.marketId" }, { status: 400 });
  }

  let marketIdStr: string;
  if (typeof midRaw === "number" && Number.isFinite(midRaw) && midRaw > 0) {
    marketIdStr = String(Math.trunc(midRaw));
  } else if (typeof midRaw === "string") {
    const s = midRaw.trim();
    marketIdStr = /^\d+$/.test(s) ? s : "";
  } else {
    marketIdStr = "";
  }
  if (!marketIdStr) {
    return NextResponse.json(
      { error: "order.marketId must be the on-chain id as a positive decimal string (see Order Book API)" },
      { status: 400 }
    );
  }

  const orderForUpstream = { ...ord, marketId: marketIdStr };

  const payload: Record<string, unknown> = {
    order: orderForUpstream,
    signature,
    network_id: networkIdFromRequestBody(o),
  };
  if (typeof o.time_in_force === "string") payload.time_in_force = o.time_in_force;

  try {
    const res = await myriadPostJson("/orders", payload);
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
        { error: `Myriad orders ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad orders proxy failed: ${msg}` }, { status: 502 });
  }
}
