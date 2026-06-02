import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";
import { predictFunGetJsonWithJwt } from "@/lib/predictfun/predictFunAuthenticatedFetch";
import { normalizePredictFunAddress } from "@/lib/predictfun/userAddress";
import { assertPredictFunServerApiKey } from "@/lib/predictfun/serverApiKey";

function readJwt(request: NextRequest): string {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.nextUrl.searchParams.get("jwt")?.trim() ?? "";
}

/**
 * GET /api/predictfun/positions?address=0x...
 * Proxies GET /v1/positions/{address} per https://api.predict.fun/docs#get-positions-by-address
 */
export async function GET(request: NextRequest) {
  const apiKeyError = assertPredictFunServerApiKey();
  if (apiKeyError) {
    return NextResponse.json({ error: apiKeyError }, { status: 503 });
  }

  const jwt = readJwt(request);
  const address = normalizePredictFunAddress(
    request.nextUrl.searchParams.get("address")
  );
  if (!address) {
    return NextResponse.json({ error: "Missing or invalid address" }, { status: 400 });
  }

  const search = new URLSearchParams();
  const first = request.nextUrl.searchParams.get("first");
  search.set("first", first && /^\d+$/.test(first) ? first : "100");

  const marketId = request.nextUrl.searchParams.get("marketId");
  if (marketId) search.set("marketId", marketId);
  const categoryId = request.nextUrl.searchParams.get("categoryId");
  if (categoryId) search.set("categoryId", categoryId);

  const path = `/positions/${encodeURIComponent(address)}`;

  try {
    // Mainnet: x-api-key required; JWT optional per https://dev.predict.fun/doc-663127
    const { ok, status, body, text } = jwt
      ? await predictFunGetJsonWithJwt(path, jwt, search)
      : await predictFunGetJson(path, search);

    if (!ok && jwt) {
      const fallback = await predictFunGetJson(path, search);
      if (fallback.ok) {
        return NextResponse.json(fallback.body);
      }
    }

    if (!ok) {
      return NextResponse.json(
        { error: `Predict.fun API error (${status})`, detail: text.slice(0, 500) },
        { status: status >= 500 ? 502 : status }
      );
    }
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Predict.fun positions failed: ${msg}` },
      { status: 502 }
    );
  }
}
