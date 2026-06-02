/**
 * Myriad REST uses protocol `networkId` values (e.g. 2741) in **AMM** routes such as
 * `POST /markets/quote` and market detail queries.
 *
 * **Order Book** `POST /orders` expects `network_id` = **EVM chain id** (BSC `56`), not `2741`.
 * EIP-712 signing uses chain id 56 for BSC — do not confuse protocol id with chain id.
 *
 * Market `id` in JSON must be the on-chain numeric id for POST /orders.
 * UUID or slug-like ids must never be passed through parseInt (truncation → wrong id → 404).
 */

/** True only if the entire string is base-10 digits (no parseInt truncation on UUIDs). */
export function parseMyriadUintField(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

/** On-chain market id for CLOB orders / orderbook when using numeric id + network_id. */
export function readRootChainMarketId(raw: Record<string, unknown>): number {
  const keys = [
    "ethMarketId",
    "eth_market_id",
    "chainMarketId",
    "chain_market_id",
    "onChainMarketId",
    "on_chain_market_id",
    "blockchainMarketId",
    "numericMarketId",
    "clobMarketId",
    "clob_market_id",
    "legacyMarketId",
    "legacy_market_id",
    "legacyId",
    "legacy_id",
  ] as const;
  for (const k of keys) {
    const n = parseMyriadUintField(raw[k]);
    if (n != null) return n;
  }
  const idN = parseMyriadUintField(raw.id);
  if (idN != null) return idN;
  const mid = parseMyriadUintField(raw.marketId);
  if (mid != null) return mid;
  return 0;
}

/**
 * OB outcome ERC1155 id: tokenId = (marketId << 1) | outcomeId — see Myriad Order Book SDK.
 * Recovers chain marketId as (tokenId >> 1) when explicit ids are missing.
 */
export function deriveChainMarketIdFromOutcomeTokenId(tokenId: unknown): number | null {
  const tid = parseMyriadUintField(tokenId);
  if (tid == null || tid < 2) return null;
  const marketId = tid >> 1;
  return marketId > 0 ? marketId : null;
}

export function readOutcomeEthMarketId(o: Record<string, unknown>): number | undefined {
  const keys = [
    "ethMarketId",
    "eth_market_id",
    "chainMarketId",
    "chain_market_id",
  ] as const;
  for (const k of keys) {
    const n = parseMyriadUintField(o[k]);
    if (n != null) return n;
  }
  const fromToken = deriveChainMarketIdFromOutcomeTokenId(o.tokenId);
  if (fromToken != null) return fromToken;
  return undefined;
}

export function readMyriadNetworkId(raw: Record<string, unknown>): number {
  const a = parseMyriadUintField(raw.networkId);
  if (a != null) return a;
  const b = parseMyriadUintField(raw.network_id);
  return b ?? 0;
}
