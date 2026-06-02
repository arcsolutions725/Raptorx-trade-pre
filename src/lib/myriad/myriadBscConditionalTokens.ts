/**
 * Conditional Tokens (ERC1155 outcome positions) on BSC for Myriad.
 * Official docs list this under Order Book; AMM sells pull shares via the same CTF pattern.
 * @see https://docs.myriad.markets/builders/contract-addresses (OBConditionalTokens)
 */
const fromEnv =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_MYRIAD_CONDITIONAL_TOKENS_BSC?.trim()
    : undefined;

export const MYRIAD_CONDITIONAL_TOKENS_BSC: `0x${string}` =
  fromEnv && fromEnv.startsWith("0x")
    ? (fromEnv as `0x${string}`)
    : "0x6413734f92248D4B29ae35883290BD93212654Dc";
