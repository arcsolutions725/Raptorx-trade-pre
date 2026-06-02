import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJsonWithJwt } from "@/lib/predictfun/predictFunAuthenticatedFetch";
import { assertPredictFunServerApiKey } from "@/lib/predictfun/serverApiKey";

function readJwt(request: NextRequest): string {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.nextUrl.searchParams.get("jwt")?.trim() ?? "";
}

/** GET /api/predictfun/account — proxies GET /v1/account (requires JWT). */
export async function GET(request: NextRequest) {
  const apiKeyError = assertPredictFunServerApiKey();
  if (apiKeyError) {
    return NextResponse.json({ error: apiKeyError }, { status: 503 });
  }

  const jwt = readJwt(request);
  if (!jwt) {
    return NextResponse.json({ error: "Missing jwt" }, { status: 401 });
  }

  try {
    const { ok, status, body, text } = await predictFunGetJsonWithJwt(
      "/account",
      jwt
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
    return NextResponse.json(
      { error: `Predict.fun account failed: ${msg}` },
      { status: 502 }
    );
  }
}
