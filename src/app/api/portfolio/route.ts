import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createPublicClient, erc20Abi, formatUnits, http, isAddress } from "viem";
import { base } from "viem/chains";
import { prisma } from "@/lib/prisma";
import { BASE_RPC_URL } from "@/constants/api";
import {
  CORE_BASE_TOKENS,
  priceAddressFor,
  tokenKeyFromAddress,
} from "@/lib/portfolio/baseTokens";
import {
  NATIVE_TOKEN_KEY,
  type PortfolioBalance,
  type PortfolioLedgerEntry,
  type PortfolioResponse,
  type PortfolioToken,
} from "@/lib/portfolio/types";

/**
 * GET /api/portfolio?wallets=0xA,0xB  (header x-user-id: the signed-in user's id, optional)
 *
 * Portfolio page data (design/portfolio.html), all on Base:
 * - balances: read on chain for the core Base tokens plus every token the user swapped on RaptorX
 * - prices, 24h change, logos: DexScreener (deepest pair per token)
 * - ledger: average cost and realized PNL from the user's RaptorX swaps (SwapTransaction, chain "base")
 */

export const dynamic = "force-dynamic";

const MAX_WALLETS = 6;
const MAX_TOKENS = 80;

const client = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });

/** Logos for core tokens DexScreener has no pair image for */
const LOCAL_LOGOS: Record<string, string> = {
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "/images/tokens/usdbc.webp",
};

type SwapRow = {
  fromAddress: string;
  toAddress: string;
  fromAmountRaw: string | null;
  toAmountRaw: string | null;
  amountUSD: number;
  walletAddress: string | null;
  createdAt: Date;
};

async function loadSwaps(userId: string | null): Promise<SwapRow[]> {
  if (!userId) return [];
  try {
    return await prisma.swapTransaction.findMany({
      where: { userId, chain: "base" },
      select: {
        fromAddress: true,
        toAddress: true,
        fromAmountRaw: true,
        toAmountRaw: true,
        amountUSD: true,
        walletAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
  } catch (err) {
    console.error("[portfolio] swaps", err);
    return [];
  }
}

type TokenMeta = { symbol: string; name: string; decimals: number; stable?: boolean };

/** symbol / name / decimals for tokens outside the core list (one multicall). */
async function loadMeta(keys: string[]): Promise<Record<string, TokenMeta>> {
  const out: Record<string, TokenMeta> = {};
  for (const t of CORE_BASE_TOKENS) out[t.key] = t;
  const unknown = keys.filter((k) => !out[k] && k !== NATIVE_TOKEN_KEY);
  if (unknown.length === 0) return out;
  const res = await client.multicall({
    allowFailure: true,
    contracts: unknown.flatMap((a) => [
      { address: a as `0x${string}`, abi: erc20Abi, functionName: "symbol" as const },
      { address: a as `0x${string}`, abi: erc20Abi, functionName: "name" as const },
      { address: a as `0x${string}`, abi: erc20Abi, functionName: "decimals" as const },
    ]),
  });
  unknown.forEach((a, i) => {
    const [sym, name, dec] = res.slice(i * 3, i * 3 + 3);
    if (dec?.status !== "success") return; // not an ERC-20 we can read
    out[a] = {
      symbol: sym?.status === "success" ? String(sym.result) : a.slice(0, 6),
      name: name?.status === "success" ? String(name.result) : "",
      decimals: Number(dec.result),
    };
  });
  return out;
}

type DexPair = {
  baseToken?: { address?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  pairAddress?: string;
  info?: { imageUrl?: string };
};
type DexQuote = { priceUsd: number | null; change24h: number | null; logo: string | null; pool: string | null };

/** Deepest DexScreener pair per contract (30 contracts per request). Cached 30 s. */
const loadQuotes = unstable_cache(
  async (addresses: string[]): Promise<Record<string, DexQuote>> => {
    const out: Record<string, DexQuote> = {};
    const bestLiq = new Map<string, number>();
    for (let i = 0; i < addresses.length; i += 30) {
      const chunk = addresses.slice(i, i + 30);
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/base/${chunk.join(",")}`, {
        headers: { accept: "application/json" },
      });
      if (!r.ok) throw new Error(`dexscreener ${r.status}`);
      const pairs = (await r.json()) as DexPair[];
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const a = p.baseToken?.address?.toLowerCase();
        if (!a || !chunk.includes(a)) continue;
        const liq = p.liquidity?.usd ?? 0;
        if (out[a] && (bestLiq.get(a) ?? 0) >= liq) continue;
        bestLiq.set(a, liq);
        const price = Number(p.priceUsd);
        out[a] = {
          priceUsd: Number.isFinite(price) && price > 0 ? price : null,
          change24h: typeof p.priceChange?.h24 === "number" ? p.priceChange.h24 : null,
          logo: p.info?.imageUrl ?? null,
          pool: p.pairAddress ?? null,
        };
      }
    }
    return out;
  },
  ["portfolio-dex-quotes-v1"],
  { revalidate: 30 },
);

/** Average-cost ledger from swaps: every swap disposes of fromToken and acquires toToken for amountUSD. */
function buildLedger(
  swaps: SwapRow[],
  decimals: Record<string, number>,
): PortfolioResponse["ledger"] {
  const ledger: PortfolioResponse["ledger"] = {};
  const entry = (scope: string, key: string): PortfolioLedgerEntry => {
    ledger[scope] ??= {};
    return (ledger[scope][key] ??= { units: 0, costUsd: 0, realizedUsd: 0 });
  };
  const units = (raw: string | null, key: string) => {
    const d = decimals[key];
    if (raw == null || d == null) return null;
    try {
      const n = Number(formatUnits(BigInt(raw), d));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  };
  for (const s of swaps) {
    if (!(s.amountUSD > 0)) continue;
    const scopes = ["*", ...(s.walletAddress ? [s.walletAddress.toLowerCase()] : [])];
    const toKey = tokenKeyFromAddress(s.toAddress);
    const fromKey = tokenKeyFromAddress(s.fromAddress);
    const got = toKey ? units(s.toAmountRaw, toKey) : null;
    const gave = fromKey ? units(s.fromAmountRaw, fromKey) : null;
    for (const scope of scopes) {
      if (fromKey && gave) {
        const e = entry(scope, fromKey);
        if (e.units > 0) {
          const sold = Math.min(gave, e.units);
          const avg = e.costUsd / e.units;
          e.realizedUsd += s.amountUSD * (sold / gave) - avg * sold;
          e.costUsd -= avg * sold;
          e.units -= sold;
          if (e.units < 1e-12) {
            e.units = 0;
            e.costUsd = 0;
          }
        }
      }
      if (toKey && got) {
        const e = entry(scope, toKey);
        e.units += got;
        e.costUsd += s.amountUSD;
      }
    }
  }
  return ledger;
}

export async function GET(request: NextRequest) {
  const wallets = Array.from(
    new Set(
      (request.nextUrl.searchParams.get("wallets") || "")
        .split(",")
        .map((w) => w.trim().toLowerCase())
        .filter((w) => isAddress(w)),
    ),
  ).slice(0, MAX_WALLETS);
  if (wallets.length === 0) {
    return NextResponse.json({ error: "wallets: one or more 0x addresses" }, { status: 400 });
  }
  const userId = request.headers.get("x-user-id")?.trim() || null;

  try {
    const swaps = await loadSwaps(userId);
    const swapKeys = swaps.flatMap((s) => [tokenKeyFromAddress(s.fromAddress), tokenKeyFromAddress(s.toAddress)]);
    const keys = Array.from(
      new Set([...CORE_BASE_TOKENS.map((t) => t.key), ...swapKeys.filter((k): k is string => !!k)]),
    ).slice(0, MAX_TOKENS);

    const meta = await loadMeta(keys);
    const readable = keys.filter((k) => meta[k]);
    const erc20 = readable.filter((k) => k !== NATIVE_TOKEN_KEY);

    // balances: native ETH + balanceOf for every (wallet, token)
    const [native, erc] = await Promise.all([
      Promise.all(wallets.map((w) => client.getBalance({ address: w as `0x${string}` }).catch(() => BigInt(0)))),
      client.multicall({
        allowFailure: true,
        contracts: wallets.flatMap((w) =>
          erc20.map((t) => ({
            address: t as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [w as `0x${string}`],
          })),
        ),
      }),
    ]);
    const balances: PortfolioBalance[] = [];
    wallets.forEach((w, wi) => {
      if (native[wi] > BigInt(0)) {
        balances.push({ wallet: w, token: NATIVE_TOKEN_KEY, amount: Number(formatUnits(native[wi], 18)) });
      }
      erc20.forEach((t, ti) => {
        const r = erc[wi * erc20.length + ti];
        if (r?.status !== "success" || typeof r.result !== "bigint" || r.result === BigInt(0)) return;
        balances.push({ wallet: w, token: t, amount: Number(formatUnits(r.result, meta[t].decimals)) });
      });
    });

    // prices for held tokens only
    const held = Array.from(new Set(balances.map((b) => b.token)));
    const priceAddrs = Array.from(new Set(held.map(priceAddressFor))).sort();
    let quotes: Record<string, DexQuote> = {};
    try {
      quotes = priceAddrs.length ? await loadQuotes(priceAddrs) : {};
    } catch (err) {
      console.error("[portfolio] quotes", err);
    }
    const tokens: Record<string, PortfolioToken> = {};
    for (const k of held) {
      const m = meta[k];
      const q = quotes[priceAddressFor(k)];
      tokens[k] = {
        key: k,
        symbol: m.symbol,
        name: m.name,
        decimals: m.decimals,
        priceUsd: q?.priceUsd ?? (m.stable ? 1 : null),
        change24h: q?.change24h ?? (m.stable ? 0 : null),
        // ETH itself, not the WETH pair's logo; USDbC has no DexScreener pair
        logo: k === NATIVE_TOKEN_KEY ? "/images/tokens/eth.webp" : (q?.logo ?? LOCAL_LOGOS[k] ?? null),
        pool: q?.pool ?? null,
        ...(m.stable ? { stable: true } : {}),
      };
    }

    const decimals: Record<string, number> = { [NATIVE_TOKEN_KEY]: 18 };
    for (const [k, m] of Object.entries(meta)) decimals[k] = m.decimals;
    const ledger = buildLedger(swaps, decimals);

    const body: PortfolioResponse = { tokens, balances, ledger, updatedAt: new Date().toISOString() };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[portfolio]", err);
    return NextResponse.json({ error: "Could not load the portfolio" }, { status: 502 });
  }
}
