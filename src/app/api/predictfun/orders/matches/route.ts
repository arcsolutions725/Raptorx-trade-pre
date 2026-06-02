import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJsonWithJwt } from "@/lib/predictfun/predictFunAuthenticatedFetch";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";
import { normalizePredictFunAddress } from "@/lib/predictfun/userAddress";

function readJwt(request: NextRequest): string {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.nextUrl.searchParams.get("jwt")?.trim() ?? "";
}

/**
 * GET /api/predictfun/orders/matches?signerAddress=0x...&first=...&after=...
 * Proxies GET /v1/orders/matches — signerAddress and/or marketId / categorySlug filters.
 * @see https://api.predict.fun/docs#?route=get-/orders/matches
 */
export async function GET(request: NextRequest) {
  const jwt = readJwt(request);
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.delete("jwt");

  const signerAddress = normalizePredictFunAddress(
    params.get("signerAddress") ?? params.get("address")
  );
  const marketId = params.get("marketId")?.trim();
  const categorySlug = params.get("categorySlug")?.trim();

  if (!signerAddress && !marketId && !categorySlug) {
    return NextResponse.json(
      { error: "Missing signerAddress, marketId, or categorySlug" },
      { status: 400 }
    );
  }

  if (signerAddress) {
    params.set("signerAddress", signerAddress);
  } else {
    params.delete("signerAddress");
    params.delete("address");
  }
  params.delete("address");

  try {
    const { ok, status, body, text } = jwt
      ? await predictFunGetJsonWithJwt("/orders/matches", jwt, params)
      : await predictFunGetJson("/orders/matches", params);
    if (!ok) {
      return NextResponse.json(
        { error: `Predict.fun API error (${status})`, detail: text.slice(0, 800) },
        { status: status >= 500 ? 502 : status }
      );
    }
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Predict.fun order matches failed: ${msg}` },
      { status: 502 }
    );
  }
}
