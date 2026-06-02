import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_CRYPTO_SYMBOLS,
  fetchCryptoLatestPrice,
} from "@/lib/predictfun/fetchCoinGeckoCryptoPrice";

/** GET /api/predictfun/crypto-price/latest?symbol=BTCUSDT */
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "BTCUSDT")
    .trim()
    .toUpperCase();
  if (!ALLOWED_CRYPTO_SYMBOLS.has(symbol)) {
    return NextResponse.json({ error: "Unsupported symbol" }, { status: 400 });
  }

  try {
    const price = await fetchCryptoLatestPrice(symbol);
    return NextResponse.json({
      symbol,
      price,
      timestamp: Date.now(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Live price fetch failed: ${msg}` }, { status: 502 });
  }
}
