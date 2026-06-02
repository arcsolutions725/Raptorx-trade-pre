import { NextRequest, NextResponse } from "next/server";
import { predictFunFetchWithJwt } from "@/lib/predictfun/predictFunAuthenticatedFetch";
import { predictFunGetJsonWithJwt } from "@/lib/predictfun/predictFunAuthenticatedFetch";
import { parsePredictFunApiErrorText } from "@/lib/predictfun/parsePredictFunApiError";
import { assertPredictFunServerApiKey } from "@/lib/predictfun/serverApiKey";
import { normalizePredictFunAddress } from "@/lib/predictfun/userAddress";

function readJwt(request: NextRequest): string {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.nextUrl.searchParams.get("jwt")?.trim() ?? "";
}

/**
 * GET /api/predictfun/orders?jwt=...&signer=0x...&first=...&after=...
 * Proxies GET /v1/orders (JWT = authenticated user). Optional signer echoed for client checks.
 * @see https://api.predict.fun/docs#?route=get-/orders
 */
export async function GET(request: NextRequest) {
  const jwt = readJwt(request);
  if (!jwt) {
    return NextResponse.json({ error: "Missing jwt" }, { status: 401 });
  }
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.delete("jwt");
  const signer = normalizePredictFunAddress(params.get("signer") ?? params.get("address"));
  if (signer) {
    params.set("signer", signer);
    params.delete("address");
  }
  try {
    const { ok, status, body, text } = await predictFunGetJsonWithJwt(
      "/orders",
      jwt,
      params
    );
    if (!ok) {
      return NextResponse.json(
        { error: `Predict.fun API error (${status})`, detail: text.slice(0, 800) },
        { status: status >= 500 ? 502 : status }
      );
    }
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Predict.fun orders failed: ${msg}` }, { status: 502 });
  }
}

/**
 * POST /api/predictfun/orders
 * Body: { jwt, data }
 *
 * Proxies to Predict.fun POST /v1/orders with Authorization header.
 * JWT is user-scoped, so it must be provided by the client.
 */
export async function POST(request: NextRequest) {
  const apiKeyError = assertPredictFunServerApiKey();
  if (apiKeyError) {
    return NextResponse.json({ error: apiKeyError }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      jwt?: string;
      data?: unknown;
    };

    const jwt = typeof body?.jwt === "string" ? body.jwt.trim() : "";
    if (!jwt) {
      return NextResponse.json({ error: "Missing jwt" }, { status: 401 });
    }
    if (!body?.data || typeof body.data !== "object") {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const res = await predictFunFetchWithJwt("/orders", jwt, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: body.data }),
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) {
      const message = parsePredictFunApiErrorText(
        text,
        `Predict.fun API error (${res.status})`
      );
      return NextResponse.json(
        {
          error: message,
          detail: String(text).slice(0, 1200),
          status: res.status,
        },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    return NextResponse.json(json ?? { success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Predict.fun orders failed: ${msg}` }, { status: 502 });
  }
}

