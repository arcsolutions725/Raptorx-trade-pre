/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  enrichWithCreationMixedChains,
  normalizeEpochToSeconds,
} from "@/lib/birdeyeTokenCreationInfo";
import { normGoldenDbChain } from "@/lib/goldenReportRegistryMatch";
import { prisma } from "@/lib/prisma";

const UNIBLOCK_BIRDEYE_BASE = "https://api.uniblock.dev/direct/v1/Birdeye";
const BIRDEYE_TOKEN_OVERVIEW = `${UNIBLOCK_BIRDEYE_BASE}/defi/token_overview`;

const EVM_BIRDEYE_CHAINS = ["ethereum", "bsc", "base", "monad"] as const;

/** Avoid replacing good overview rows when Birdeye rate-limits on background refetch. */
const OVERVIEW_CACHE = new Map<string, { data: any; expiresAt: number }>();
const OVERVIEW_TTL_MS = 5 * 60_000;

function overviewCacheKey(chain: string, address: string): string {
  const a = address.trim();
  const norm = /^0x[a-fA-F0-9]{40}$/i.test(a) ? a.toLowerCase() : a;
  return `${chain}:${norm}`;
}

export type ReportScreenerFetchOptions = {
  includeAge?: boolean;
};

export type ReportScreenerResult = {
  items: any[];
  registryCount: number;
};

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    if (queue.length) queue.shift()!();
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

function coerceFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return undefined;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeBirdeyeTokenOverview(data: any, chain: string) {
  const address = data?.address ?? data?.mint ?? null;
  const price = coerceFiniteNumber(data?.price);

  const marketCap =
    coerceFiniteNumber(data?.mc) ??
    coerceFiniteNumber(data?.market_cap) ??
    coerceFiniteNumber(data?.marketCap) ??
    coerceFiniteNumber(data?.realMc);

  const liquidityUsd = coerceFiniteNumber(data?.liquidity);

  const v24hUSD =
    coerceFiniteNumber(data?.v24hUSD) ??
    coerceFiniteNumber(data?.volume24hUSD) ??
    coerceFiniteNumber(data?.volume_24h_usd);

  const priceChange24h =
    coerceFiniteNumber(data?.price_change_24h_percent) ??
    coerceFiniteNumber(data?.priceChange24hPercent) ??
    coerceFiniteNumber(data?.priceChange24h);

  const volumeChange24h =
    coerceFiniteNumber(data?.volume_24h_change_percent) ??
    coerceFiniteNumber(data?.v24hChangePercent);

  const lastTradeUnixTime = coerceFiniteNumber(data?.lastTradeUnixTime);

  const createdAt =
    normalizeEpochToSeconds(data?.createdAt) ??
    normalizeEpochToSeconds(data?.creationTime) ??
    normalizeEpochToSeconds(data?.creationTimestamp) ??
    normalizeEpochToSeconds(data?.deployTime) ??
    normalizeEpochToSeconds(data?.pairCreatedAt) ??
    normalizeEpochToSeconds(data?.firstMintTx?.blockUnixTime) ??
    normalizeEpochToSeconds(data?.extensions?.createdAt) ??
    normalizeEpochToSeconds(data?.blockUnixTime);

  const decimalsRawOv = coerceFiniteNumber(data?.decimals);
  const decimalsOv =
    decimalsRawOv !== undefined ? Math.trunc(decimalsRawOv) : undefined;

  return {
    chainId: chain,
    tokenAddress: address || undefined,
    name: data?.name ?? undefined,
    uniqueName: null,
    symbol: data?.symbol ?? undefined,
    decimals: decimalsOv,
    logo: data?.logoURI ?? data?.logo ?? undefined,

    usdPrice: price,
    marketCap,
    liquidityUsd,

    pricePercentChange: { "24h": priceChange24h },
    volumePercentChange: { "24h": volumeChange24h },
    totalVolume: { "24h": v24hUSD },

    createdAt,
    lastTradeUnixTime,

    rank: coerceFiniteNumber(data?.rank),
  } as any;
}

async function fetchBirdeyeTokenOverview(
  address: string,
  chain: string,
  apiKey: string,
  maxRetries = 3,
): Promise<any | null> {
  if (!address) return null;

  const cacheKey = overviewCacheKey(chain, address);
  const cached = OVERVIEW_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = `${BIRDEYE_TOKEN_OVERVIEW}?address=${encodeURIComponent(address)}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-chain": chain,
          "x-api-key": apiKey,
        },
        cache: "no-store",
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        break;
      }

      if (!res.ok) break;

      const json = await res.json();
      if (!json?.success || !json?.data) break;

      OVERVIEW_CACHE.set(cacheKey, {
        data: json.data,
        expiresAt: Date.now() + OVERVIEW_TTL_MS,
      });
      return json.data;
    } catch {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
    }
  }

  if (cached) return cached.data;
  return null;
}

function isEvmAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

function dbChainToBirdeyeXChain(dbChain: string): string | null {
  const c = normGoldenDbChain(dbChain);
  if (c === "solana") return "solana";
  if (c === "bsc") return "bsc";
  if (c === "base") return "base";
  if (c === "ethereum") return "ethereum";
  if (c === "monad") return "monad";
  return null;
}

/** Minimal row so registry projects always appear even when Birdeye overview fails. */
function stubRowFromProject(contractAddress: string, dbChain: string): any {
  const addr = contractAddress.trim();
  const tokenAddress = isEvmAddress(addr) ? addr.toLowerCase() : addr;
  const chainId =
    dbChainToBirdeyeXChain(dbChain) ??
    (isEvmAddress(addr) ? "ethereum" : "solana");

  return {
    chainId,
    tokenAddress,
    uniqueName: null,
  };
}

async function tokenRowFromProject(
  contractAddress: string,
  dbChain: string,
  apiKey: string,
): Promise<any> {
  const addr = contractAddress.trim();
  if (!addr) return stubRowFromProject(contractAddress, dbChain);

  if (!isEvmAddress(addr)) {
    const data = await fetchBirdeyeTokenOverview(addr, "solana", apiKey);
    return data
      ? normalizeBirdeyeTokenOverview(data, "solana")
      : stubRowFromProject(addr, dbChain);
  }

  const mapped = dbChainToBirdeyeXChain(dbChain);
  if (mapped && mapped !== "solana") {
    const data = await fetchBirdeyeTokenOverview(addr, mapped, apiKey);
    if (data) return normalizeBirdeyeTokenOverview(data, mapped);
  }

  for (const c of EVM_BIRDEYE_CHAINS) {
    const data = await fetchBirdeyeTokenOverview(addr, c, apiKey);
    if (data) return normalizeBirdeyeTokenOverview(data, c);
  }

  return stubRowFromProject(addr, dbChain);
}

/**
 * Golden (`isGolden: true`) or Pump (`isGolden: false`) registry → Birdeye overview rows.
 */
export async function getReportScreenerTokenRows(
  isGolden: boolean,
  opts: ReportScreenerFetchOptions = {},
): Promise<ReportScreenerResult> {
  const { includeAge = false } = opts;
  const apiKey = process.env.UNIBLOCK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing UNIBLOCK_API_KEY");
  }

  const projects = await prisma.goldenReportProject.findMany({
    where: { isGolden },
    select: { contractAddress: true, chain: true },
    orderBy: { updatedAt: "desc" },
  });

  const registryCount = projects.length;
  if (!registryCount) {
    return { items: [], registryCount: 0 };
  }

  const limiter = createLimiter(3);
  const rows = await Promise.all(
    projects.map((p) =>
      limiter(() => tokenRowFromProject(p.contractAddress, p.chain, apiKey)),
    ),
  );

  rows.sort((a, b) => {
    const mcA = a?.marketCap ?? 0;
    const mcB = b?.marketCap ?? 0;
    if (mcA !== mcB) return mcB - mcA;
    const liqA = a?.liquidityUsd ?? 0;
    const liqB = b?.liquidityUsd ?? 0;
    return liqB - liqA;
  });

  const items = includeAge
    ? await enrichWithCreationMixedChains(rows, apiKey, 6)
    : rows;

  return { items, registryCount };
}
