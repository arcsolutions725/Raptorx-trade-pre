/**
 * Chain resolution for the Exchange (Li.Fi) widget.
 *
 * The widget swaps INTO a specific contract, so its chain has to describe that same
 * contract. Every source we could read the chain from is unreliable in a different
 * way, which is why this lives in one place:
 *
 * - `Report.chain` is `@default("solana")`, so a report generated before the chain
 *   was plumbed through — or one whose chain never got detected — claims Solana for
 *   an Ethereum/Robinhood token.
 * - The chain tab / URL segment can be "all", or can lag the token being charted.
 * - The token row's `chainId` is the only source that comes from the token itself.
 *
 * Getting this wrong is not a cosmetic bug: forcing Solana pins Li.Fi's destination
 * to `chains: { to: { allow: [SOL] } }` with an 0x address it can't resolve, so the
 * "To" field renders empty and no route can ever be built.
 */
import type { TrendingToken } from "@/hooks/useTrendingTokens";

export type SwapChain =
  | "solana"
  | "robinhood"
  | "bsc"
  | "ethereum"
  | "base"
  | "monad";

/** Any chain label we might hold (token `chainId`, `Report.chain`, route slug, numeric id) → widget chain. */
export function normalizeSwapChain(raw?: string | null): SwapChain | undefined {
  const c = (raw ?? "").trim().toLowerCase();
  if (!c) return undefined;
  if (c === "solana" || c === "sol" || c === "1151111081099710") return "solana";
  if (c === "robinhood" || c === "4663") return "robinhood";
  if (c === "bsc" || c === "bnb" || c === "binance" || c === "56") return "bsc";
  if (c === "ethereum" || c === "eth" || c === "1") return "ethereum";
  if (c === "base" || c === "8453") return "base";
  if (c === "monad" || c === "10143") return "monad";
  return undefined;
}

function normAddr(a?: string | null): string {
  return (a ?? "").trim().toLowerCase();
}

function isEvmAddress(a: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}

/** A Solana claim about an 0x address is always a mis-stored default, never a fact. */
function contradictsAddress(chain: SwapChain, target: string): boolean {
  return chain === "solana" && !!target && isEvmAddress(target);
}

/**
 * Chain to force the swap widget onto, for the token at `swapTokenAddress`.
 * `undefined` means "let Li.Fi decide" — right when we genuinely don't know.
 */
export function resolveSwapChain(opts: {
  /** The contract the swap targets (the widget's `toToken`). */
  swapTokenAddress?: string | null;
  /** The charted token row, if any — the authoritative source. */
  token?: Pick<TrendingToken, "tokenAddress" | "chainId"> | null;
  /** `Report.chain` from the selected AI report. */
  reportChain?: string | null;
  /** Contract that report was generated for — used to reject a chain from a different token. */
  reportContractAddress?: string | null;
  /** Selected chain tab / URL segment; "all" is not a chain. */
  routeChain?: string | null;
}): SwapChain | undefined {
  const { swapTokenAddress, token, reportChain, reportContractAddress, routeChain } =
    opts;
  const target = normAddr(swapTokenAddress);

  // 1. The token being charted. Only trust it when it IS the token being swapped.
  if (token?.chainId && (!target || normAddr(token.tokenAddress) === target)) {
    const fromToken = normalizeSwapChain(token.chainId);
    if (fromToken) return fromToken;
  }

  // 2. The report's stored chain — same-contract only, and never its "solana" default
  //    over an EVM address (that's the mis-stored case this guard exists to heal).
  if (reportChain && (!target || normAddr(reportContractAddress) === target)) {
    const fromReport = normalizeSwapChain(reportChain);
    if (fromReport && !contradictsAddress(fromReport, target)) return fromReport;
  }

  // 3. Chain tab / URL segment.
  const fromRoute = normalizeSwapChain(routeChain);
  if (fromRoute && !contradictsAddress(fromRoute, target)) return fromRoute;

  // 4. Unknown. An 0x token is on *some* EVM chain — let Li.Fi resolve it rather than
  //    forcing Solana and rendering a widget that cannot route.
  if (target && isEvmAddress(target)) return undefined;
  if (target) return "solana";
  return undefined;
}
