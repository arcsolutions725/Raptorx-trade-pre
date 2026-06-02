import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_CRYPTO_INTERVALS,
  ALLOWED_CRYPTO_SYMBOLS,
  fetchCryptoKlinesSeries,
} from "@/lib/predictfun/fetchCoinGeckoCryptoPrice";

/** GET /api/predictfun/crypto-price?symbol=BTCUSDT&startTime=...&endTime=...&interval=1m */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = (params.get("symbol") ?? "BTCUSDT").trim().toUpperCase();
  if (!ALLOWED_CRYPTO_SYMBOLS.has(symbol)) {
    return NextResponse.json({ error: "Unsupported symbol" }, { status: 400 });
  }

  const interval = (params.get("interval") ?? "1m").trim();
  if (!ALLOWED_CRYPTO_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Unsupported interval" }, { status: 400 });
  }

  const startTimeRaw = params.get("startTime")?.trim();
  const endTimeRaw = params.get("endTime")?.trim();
  const startTime = startTimeRaw ? Number(startTimeRaw) : NaN;
  const endTime = endTimeRaw ? Number(endTimeRaw) : Date.now();

  if (!Number.isFinite(startTime) || startTime <= 0) {
    return NextResponse.json({ error: "Missing or invalid startTime" }, { status: 400 });
  }
  if (!Number.isFinite(endTime) || endTime <= startTime) {
    return NextResponse.json({ error: "Invalid endTime" }, { status: 400 });
  }

  try {
    const series = await fetchCryptoKlinesSeries({
      symbol,
      interval,
      startTimeMs: startTime,
      endTimeMs: endTime,
    });

    return NextResponse.json({
      symbol,
      interval,
      series,
      latestPrice: series.at(-1)?.y ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Crypto price fetch failed: ${msg}` }, { status: 502 });
  }
}
