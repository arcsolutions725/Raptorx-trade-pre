import { NextResponse } from "next/server";
import { getPredictFunBaseUrl } from "@/lib/predictfun/serverFetch";

/** GET /api/predictfun/config — exposes whether we are using testnet or mainnet. */
export async function GET() {
  const base = getPredictFunBaseUrl();
  const isTestnet = /api-testnet\.predict\.fun/i.test(base);
  return NextResponse.json({
    base,
    isTestnet,
    chainId: isTestnet ? 97 : 56,
  });
}

