/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BIRDEYE_HISTORY =
  "https://api.uniblock.dev/direct/v1/Birdeye/defi/history_price";
const MAX_TOKENS = 25;

function birdeyeChain(chain: string): string {
  const c = chain.toLowerCase();
  if (c === "bsc" || c === "56") return "bsc";
  if (c === "base" || c === "8453") return "base";
  if (c === "ethereum" || c === "eth" || c === "1") return "ethereum";
  if (c === "monad" || c === "10143") return "monad";
  return "solana";
}

/** Match trending route: Solana mints are case-sensitive; do not lowercase. */
function sparklineSeriesKey(chain: string, address: string): string {
  const c = birdeyeChain(chain);
  const a = String(address || "").trim();
  if (!a) return "";
  return `${c}:${c === "solana" ? a : a.toLowerCase()}`;
}

function birdeyeAddressForFetch(chain: string, address: string): string {
  const a = String(address || "").trim();
  if (!a) return a;
  return birdeyeChain(chain) === "solana" ? a : a.toLowerCase();
}

function normalizePrices(values: number[]): number[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  // No intra-range movement → do not ship a flat mid-line; let the client use %‑based synthetic.
  if (max === min) return [];
  return values.map((v) => (v - min) / (max - min));
}

function coerceFiniteNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/** Birdeye / proxy may nest `items` differently; tolerate string prices and OHLC-style rows. */
function extractHistoryItems(json: any): any[] {
  const d = json?.data;
  const nested = [
    d?.items,
    d?.data?.items,
    json?.items,
    Array.isArray(d) ? d : null,
  ];
  for (const arr of nested) {
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

function itemUnixTime(x: any): number {
  return (
    coerceFiniteNumber(x?.unixTime) ||
    coerceFiniteNumber(x?.unix_time) ||
    coerceFiniteNumber(x?.time) ||
    coerceFiniteNumber(x?.timestamp) ||
    0
  );
}

function priceFromHistoryItem(x: any): number {
  const keys = [
    "value",
    "scaledValue",
    "close",
    "c",
    "price",
    "open",
    "o",
    "high",
    "h",
    "low",
    "l",
    "avgPrice",
    "vwap",
  ];
  for (const k of keys) {
    const n = coerceFiniteNumber(x?.[k]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/** Cap points for payload size while keeping shape. */
function downsampleSeries(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values;
  const out: number[] = [];
  const last = values.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(values[idx]);
  }
  return out;
}

async function fetchHistorySeriesForType(
  apiKey: string,
  chain: string,
  address: string,
  interval: string
): Promise<number[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;
  const url = new URL(BIRDEYE_HISTORY);
  url.searchParams.set("address", birdeyeAddressForFetch(chain, address));
  url.searchParams.set("address_type", "token");
  url.searchParams.set("type", interval);
  url.searchParams.set("time_from", String(from));
  url.searchParams.set("time_to", String(now));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
      "x-chain": birdeyeChain(chain),
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  if (json?.success === false && !extractHistoryItems(json).length) {
    return [];
  }
  const items = extractHistoryItems(json);
  if (!items.length) return [];

  const sorted = [...items].sort((a, b) => itemUnixTime(a) - itemUnixTime(b));
  const raw = sorted
    .map(priceFromHistoryItem)
    .filter((n: number) => Number.isFinite(n) && n > 0);
  if (raw.length < 2) return [];

  const capped = downsampleSeries(raw, 96);
  return normalizePrices(capped);
}

async function fetchHistorySeries(
  apiKey: string,
  chain: string,
  address: string
): Promise<number[]> {
  try {
    // Prefer 15m for ~24h shape; Birdeye sometimes returns sparse 1H rows for EVM / new pairs.
    const y15 = await fetchHistorySeriesForType(apiKey, chain, address, "15m");
    if (y15.length >= 2) return y15;
    return await fetchHistorySeriesForType(apiKey, chain, address, "1H");
  } catch {
    return [];
  }
}

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          next();
        }
      };
      if (active < concurrency) start();
      else queue.push(start);
    });
  };
}

type TokenRef = { chain: string; address: string };

export async function POST(req: NextRequest) {
  const apiKey = process.env.UNIBLOCK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing UNIBLOCK_API_KEY" },
      { status: 500 }
    );
  }

  let body: { tokens?: TokenRef[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.tokens) ? body.tokens : [];
  const tokens: TokenRef[] = [];
  const seen = new Set<string>();

  for (const t of raw.slice(0, MAX_TOKENS)) {
    if (!t || typeof t !== "object") continue;
    const address = String((t as TokenRef).address || "").trim();
    const chain = String((t as TokenRef).chain || "solana").trim();
    if (!address) continue;
    const key = sparklineSeriesKey(chain, address);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tokens.push({
      chain,
      address: birdeyeAddressForFetch(chain, address),
    });
  }

  if (tokens.length === 0) {
    return NextResponse.json({ series: {} as Record<string, number[]> });
  }

  const limit = createLimiter(5);
  const entries = await Promise.all(
    tokens.map((t) =>
      limit(async () => {
        const y = await fetchHistorySeries(apiKey, t.chain, t.address);
        const key = sparklineSeriesKey(t.chain, t.address);
        return [key, y] as const;
      })
    )
  );

  const series: Record<string, number[]> = {};
  for (const [key, y] of entries) {
    if (y.length >= 2) series[key] = y;
  }

  return NextResponse.json({ series });
}
