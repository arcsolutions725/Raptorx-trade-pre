export const USDC_E_CONTRACT_ADDRESS =
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

export const USDC_E_DECIMALS = 6;

export const CTF_CONTRACT_ADDRESS =
  "0x4d97dcd97ec945f40cf65f87097ace5ea0476045" as const;

export const CTF_EXCHANGE_ADDRESS =
  "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;

export const NEG_RISK_CTF_EXCHANGE_ADDRESS =
  "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;

export const NEG_RISK_ADAPTER_ADDRESS =
  "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;

/** Native USDC on Base mainnet (Circle). Used by Limitless. */
export const USDC_BASE_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const USDC_BASE_DECIMALS = 6;

/**
 * Conditional Tokens Framework (CTF) on Base mainnet (generic deployment).
 * Not used for Limitless; use LIMITLESS_CTF_BASE_ADDRESS instead.
 */
export const CTF_BASE_ADDRESS: `0x${string}` =
  (process.env.NEXT_PUBLIC_CTF_BASE_ADDRESS as `0x${string}`) ||
  "0x506160f32cfeb1067e47286d96310d63fcf55db7";

/**
 * Limitless Exchange Conditional Tokens (CTF) on Base.
 * All Limitless CLOB markets use this contract for prepareCondition, reportPayouts, and redeemPositions.
 * @see https://docs.limitless.exchange/user-guide/smart-contracts
 */
export const LIMITLESS_CTF_BASE_ADDRESS =
  "0xC9c98965297Bc527861c898329Ee280632B76e18" as const;
