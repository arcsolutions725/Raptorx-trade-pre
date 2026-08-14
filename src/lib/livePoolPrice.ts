/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Live on-chain pool price for the screener's Mcap overlay.
 *
 * DexScreener's REST API is CDN-cached for ~30s, so the table's Mcap lags the
 * embedded chart (a live websocket) by up to half a minute. We can't make their
 * cache tick faster, so for EVM pools we read the *same pool the chart shows*
 * straight from chain and re-price the DexScreener snapshot against it.
 *
 * The trick that keeps this cheap and robust: we never convert to USD or fetch a
 * supply. We only need the pool's price of the token in its quote asset (WETH,
 * USDC, …). Scaling the snapshot by
 *
 *     liveMcap = snapshotMcap * (liveQuotePerBase / snapshotQuotePerBase)
 *
 * cancels both circulating supply and the quote's USD price — the only residual
 * error is quote/USD drift over the ~seconds since the snapshot, which for ETH or
 * a stable is negligible next to a memecoin's own move.
 *
 * Solana is intentionally not covered: its AMMs (Raydium/Orca/Meteora/…) each
 * need bespoke account-layout parsing. Those rows keep the DexScreener snapshot.
 */
import { createPublicClient, http, type PublicClient } from "viem";

/** Kill switch — set to "1"/"true"/"on" to fall back to raw DexScreener numbers. */
const DISABLED = /^(1|true|on)$/i.test(
  process.env.DISABLE_LIVE_POOL_MCAP ?? "",
);

/**
 * Chain slug → RPC URL. Public defaults are rate-limited; point the env overrides
 * at a dedicated provider (Alchemy/QuickNode/…) for production traffic. Chains
 * without an entry (notably `solana`) skip the on-chain read entirely.
 */
const RPC_URL: Record<string, string | undefined> = {
  base: process.env.BASE_RPC_URL || "https://mainnet.base.org",
  bsc: process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://bsc-dataseed.binance.org",
  ethereum: process.env.ETH_RPC_URL || "https://eth.merkle.io",
  monad: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
  robinhood:
    process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
};

const MAX_CONCURRENCY = 6;
const READ_TIMEOUT_MS = 2_000;

const slot0Abi = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "uint160" },
      { type: "int24" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint8" },
      { type: "bool" },
    ],
  },
] as const;
const getReservesAbi = [
  {
    name: "getReserves",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
] as const;
const token0Abi = [
  { name: "token0", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const token1Abi = [
  { name: "token1", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const decimalsAbi = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const clients = new Map<string, PublicClient>();
function clientFor(slug: string): PublicClient | undefined {
  const url = RPC_URL[slug];
  if (!url) return undefined;
  let c = clients.get(slug);
  if (!c) {
    c = createPublicClient({ transport: http(url) });
    clients.set(slug, c);
  }
  return c;
}

/**
 * Immutable per-pool facts: the pool kind (v2 vs v3), which side is the token we
 * price, and both token decimals. None of these change after deploy, so a
 * successful read is cached for the process lifetime. `null` marks a pool we
 * can't read (v4 singleton, exotic AMM, self-destructed) — also cached, so we
 * stop probing it.
 */
type PoolMeta = {
  isV3: boolean;
  baseIs0: boolean;
  dec0: number;
  dec1: number;
} | null;

const metaCache = new Map<string, PoolMeta>();
const metaInflight = new Map<string, Promise<PoolMeta>>();

const metaKey = (slug: string, pair: string) => `${slug}|${pair.toLowerCase()}`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function loadMeta(
  client: PublicClient,
  slug: string,
  pair: `0x${string}`,
  base: string,
): Promise<PoolMeta> {
  const key = metaKey(slug, pair);
  if (metaCache.has(key)) return metaCache.get(key)!;
  const running = metaInflight.get(key);
  if (running) return running;

  const task = (async (): Promise<{ meta: PoolMeta; cache: boolean }> => {
    try {
      const [t0, t1] = await withTimeout(
        Promise.all([
          client.readContract({ address: pair, abi: token0Abi, functionName: "token0" }) as Promise<string>,
          client.readContract({ address: pair, abi: token1Abi, functionName: "token1" }) as Promise<string>,
        ]),
        READ_TIMEOUT_MS,
      );

      const baseIs0 = t0.toLowerCase() === base.toLowerCase();
      const baseIs1 = t1.toLowerCase() === base.toLowerCase();
      // Wrong-token pool is a structural fact, so it's safe to cache the null.
      if (!baseIs0 && !baseIs1) return { meta: null, cache: true };

      const [dec0, dec1, isV3] = await withTimeout(
        Promise.all([
          client.readContract({ address: t0 as `0x${string}`, abi: decimalsAbi, functionName: "decimals" }) as Promise<number>,
          client.readContract({ address: t1 as `0x${string}`, abi: decimalsAbi, functionName: "decimals" }) as Promise<number>,
          client
            .readContract({ address: pair, abi: slot0Abi, functionName: "slot0" })
            .then(() => true)
            .catch(() => false),
        ]),
        READ_TIMEOUT_MS,
      );

      return {
        meta: { isV3, baseIs0, dec0: Number(dec0), dec1: Number(dec1) },
        cache: true,
      };
    } catch {
      // Transient (timeout / rate limit). Don't blacklist a readable pool — retry
      // it next refresh.
      return { meta: null, cache: false };
    }
  })();

  const wrapped = task.then(({ meta, cache }) => {
    if (cache) metaCache.set(key, meta);
    return meta;
  });
  metaInflight.set(key, wrapped);
  try {
    return await wrapped;
  } finally {
    metaInflight.delete(key);
  }
}

export type LivePriceEntry = { pair: string; base: string };

/**
 * Live quote-per-base for each EVM pool, keyed by lowercased pair address (the
 * same units as DexScreener's `priceNative`). Pools that are Solana, unreachable,
 * unreadable, or slow are simply absent — the caller keeps the snapshot for those.
 */
export async function getLiveQuotePerBase(
  slug: string,
  entries: LivePriceEntry[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (DISABLED) return out;
  const client = clientFor(slug);
  if (!client || !entries.length) return out;

  const seen = new Set<string>();
  const queue = entries.filter((e) => {
    const k = e.pair.toLowerCase();
    if (seen.has(k) || !/^0x[0-9a-fA-F]{40}$/.test(e.pair)) return false;
    seen.add(k);
    return true;
  });

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const { pair, base } = queue[idx++];
      const addr = pair as `0x${string}`;
      try {
        const meta = await loadMeta(client!, slug, addr, base);
        if (!meta) continue;

        // token1-per-token0 in raw integer units.
        let raw01: number;
        if (meta.isV3) {
          const s = (await withTimeout(
            client!.readContract({ address: addr, abi: slot0Abi, functionName: "slot0" }) as Promise<readonly bigint[]>,
            READ_TIMEOUT_MS,
          )) as readonly bigint[];
          const sqrt = Number(s[0]) / 2 ** 96;
          raw01 = sqrt * sqrt;
        } else {
          const r = (await withTimeout(
            client!.readContract({ address: addr, abi: getReservesAbi, functionName: "getReserves" }) as Promise<readonly bigint[]>,
            READ_TIMEOUT_MS,
          )) as readonly bigint[];
          const r0 = Number(r[0]);
          if (!(r0 > 0)) continue;
          raw01 = Number(r[1]) / r0;
        }

        // Raw → human (token1 per token0), then orient to quote-per-base.
        const human01 = raw01 * 10 ** (meta.dec0 - meta.dec1);
        const qpb = meta.baseIs0 ? human01 : human01 > 0 ? 1 / human01 : NaN;
        if (Number.isFinite(qpb) && qpb > 0) out.set(pair.toLowerCase(), qpb);
      } catch {
        // leave this pool to its snapshot
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, worker),
  );
  return out;
}
