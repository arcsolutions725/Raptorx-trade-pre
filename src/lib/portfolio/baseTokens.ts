import { NATIVE_TOKEN_KEY } from "./types";

/**
 * Tokens the Portfolio page always checks on Base, on top of every token the user swapped on RaptorX.
 * (There is no keyless "all balances of a wallet" API, so discovery is: these + the swap history.)
 * Addresses are lowercase.
 */
export type CoreBaseToken = {
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  stable?: boolean;
};

export const WETH_BASE = "0x4200000000000000000000000000000000000006";

export const CORE_BASE_TOKENS: CoreBaseToken[] = [
  { key: NATIVE_TOKEN_KEY, symbol: "ETH", name: "Ether", decimals: 18 },
  { key: WETH_BASE, symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  { key: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6, stable: true },
  { key: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", symbol: "USDbC", name: "USD Base Coin", decimals: 6, stable: true },
  { key: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", symbol: "EURC", name: "EURC", decimals: 6 },
  { key: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8 },
  { key: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", decimals: 18 },
  { key: "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf", symbol: "VVV", name: "Venice Token", decimals: 18 },
  { key: "0x940181a94a35a4569e4529a3cdfb74e38fd98631", symbol: "AERO", name: "Aerodrome Finance", decimals: 18 },
  { key: "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b", symbol: "VIRTUAL", name: "Virtual Protocol", decimals: 18 },
  { key: "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842", symbol: "MORPHO", name: "Morpho", decimals: 18 },
  { key: "0x532f27101965dd16442e59d40670faf5ebb142e4", symbol: "BRETT", name: "Brett", decimals: 18 },
  { key: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", symbol: "DEGEN", name: "Degen", decimals: 18 },
];

const NATIVE_ALIASES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

/** Swap-record token address → token key (lowercase contract, or NATIVE_TOKEN_KEY for ETH). Null if not an EVM address. */
export function tokenKeyFromAddress(address: string | null | undefined): string | null {
  const a = (address || "").trim().toLowerCase();
  if (NATIVE_ALIASES.has(a)) return NATIVE_TOKEN_KEY;
  return /^0x[0-9a-f]{40}$/.test(a) ? a : null;
}

/** The contract whose market prices a token key (native ETH trades as WETH). */
export function priceAddressFor(key: string): string {
  return key === NATIVE_TOKEN_KEY ? WETH_BASE : key;
}
