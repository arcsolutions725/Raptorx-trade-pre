import { utils } from "ethers";
import { myriadBscPublicClient } from "@/lib/myriad/bscPublicClient";
import { MYRIAD_CONDITIONAL_TOKENS_BSC } from "@/lib/myriad/myriadBscConditionalTokens";

const TRY_FRAGMENTS = [
  "function conditionalTokens() view returns (address)",
  "function getConditionalTokens() view returns (address)",
  "function ctf() view returns (address)",
] as const;

/**
 * Read Conditional Tokens registry from the PredictionMarket **on BSC** (proxy delegates to implementation).
 * Does not use the wallet ethers provider — it may still be bound to Polygon.
 */
export async function resolveMyriadConditionalTokensForMarket(
  predictionMarket: string
): Promise<string> {
  if (!utils.isAddress(predictionMarket)) return MYRIAD_CONDITIONAL_TOKENS_BSC;

  for (const frag of TRY_FRAGMENTS) {
    try {
      const fnName = frag.match(/function\s+(\w+)\s*\(/)?.[1];
      if (!fnName) continue;
      const iface = new utils.Interface([frag]);
      const data = iface.encodeFunctionData(fnName, []);
      const { data: callData } = await myriadBscPublicClient.call({
        to: predictionMarket as `0x${string}`,
        data: data as `0x${string}`,
      });
      if (!callData || callData === "0x") continue;
      const decoded = iface.decodeFunctionResult(fnName, callData);
      const addr = decoded[0] as string;
      if (
        typeof addr === "string" &&
        utils.isAddress(addr) &&
        addr !== utils.getAddress("0x0000000000000000000000000000000000000000")
      ) {
        return utils.getAddress(addr);
      }
    } catch {
      /* try next */
    }
  }

  return MYRIAD_CONDITIONAL_TOKENS_BSC;
}
