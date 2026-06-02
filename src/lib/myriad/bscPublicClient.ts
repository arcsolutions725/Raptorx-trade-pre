import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";

const BSC_HTTP =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim()
    ? process.env.NEXT_PUBLIC_BSC_RPC_URL.trim()
    : "https://bsc-dataseed.binance.org";

/** Read-only BSC client for collateral balances (WalletContext publicClient is Polygon). */
export const myriadBscPublicClient = createPublicClient({
  chain: bsc,
  transport: http(BSC_HTTP),
});
