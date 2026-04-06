import { NextRequest, NextResponse } from "next/server";

const PROOF_VERIFY_BASE = "https://proof.dflow.net";

/**
 * GET /api/kalshi/proof-verify?address=...
 * Proxies to Proof GET /verify/{address}. Used to check if a Solana wallet
 * is KYC-verified for Kalshi prediction market buying.
 * Docs: https://pond.dflow.net/build/proof/partner-integration
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address || address.length < 32 || address.length > 44) {
      return NextResponse.json(
        { error: "Valid Solana address (32–44 chars) required" },
        { status: 400 }
      );
    }
    const url = `${PROOF_VERIFY_BASE}/verify/${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as {
      verified?: boolean;
    };
    if (!response.ok) {
      return NextResponse.json(
        { error: "Proof verification check failed", verified: false },
        { status: response.status }
      );
    }
    return NextResponse.json({ verified: data.verified === true });
  } catch (e) {
    console.error("Proof verify error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification check failed", verified: false },
      { status: 500 }
    );
  }
}
