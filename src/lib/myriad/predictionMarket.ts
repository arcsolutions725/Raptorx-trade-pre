/**
 * BSC mainnet PredictionMarket (AMM trades via POST /markets/quote `calldata`).
 * @see https://docs.myriad.markets/builders/myriad-api-reference (quote / quote_with_fee examples)
 */
const fromEnv =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MYRIAD_PREDICTION_MARKET?.trim() : undefined;

export const MYRIAD_PREDICTION_MARKET_BSC: string =
  fromEnv && fromEnv.startsWith("0x") ? fromEnv : "0x39E66eE6b2ddaf4DEfDEd3038E0162180dbeF340";
