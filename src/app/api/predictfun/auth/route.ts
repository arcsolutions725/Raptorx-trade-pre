import { NextRequest, NextResponse } from "next/server";
import { getPredictFunBaseUrl, predictFunRequestHeaders } from "@/lib/predictfun/serverFetch";
import { assertPredictFunServerApiKey } from "@/lib/predictfun/serverApiKey";
import { utils } from "ethers";

/** POST /api/predictfun/auth — exchanges signed message for JWT. */
export async function POST(request: NextRequest) {
  const apiKeyError = assertPredictFunServerApiKey();
  if (apiKeyError) {
    return NextResponse.json({ error: apiKeyError }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      signer?: string;
      message?: string;
      signature?: string;
    };

    let signer = typeof body?.signer === "string" ? body.signer.trim() : "";
    if (signer && /^0x[a-fA-F0-9]{40}$/.test(signer)) {
      try {
        signer = utils.getAddress(signer);
      } catch {
        // keep raw
      }
    }
    const message = typeof body?.message === "string" ? body.message : "";
    const signature = typeof body?.signature === "string" ? body.signature.trim() : "";

    if (!signer || !message || !signature) {
      return NextResponse.json(
        { error: "signer, message, signature are required" },
        { status: 400 }
      );
    }

    const base = getPredictFunBaseUrl();
    const url = `${base}/v1/auth`;
    const headers = {
      ...predictFunRequestHeaders(),
      "Content-Type": "application/json",
      Accept: "application/json",
    } as Record<string, string>;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ signer, message, signature }),
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Predict.fun API error (${res.status})`, detail: String(text).slice(0, 500) },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(json ?? { success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Predict.fun auth failed: ${msg}` }, { status: 502 });
  }
}

