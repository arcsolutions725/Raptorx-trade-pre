import { BigNumber, utils } from "ethers";

export type PredictFunChainId = 56 | 97;

export type PredictFunOrderSide = 0 | 1; // 0 = BUY, 1 = SELL
export type PredictFunSignatureType = 0 | 1 | 2; // per docs (EOA / proxy / safe)

export type PredictFunMarketFlags = {
  isNegRisk: boolean;
  isYieldBearing: boolean;
};

export type PredictFunContractOrder = {
  hash?: string;
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  /** Unix seconds (string for EIP-712 encoding, matches Predict.fun SDK) */
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;
  signatureType: number;
  signature?: string;
};

export const PREDICT_FUN_PROTOCOL_NAME = "predict.fun CTF Exchange";
export const PREDICT_FUN_PROTOCOL_VERSION = "1";

export const PREDICT_FUN_EIP712_DOMAIN = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

export const PREDICT_FUN_ORDER_STRUCTURE = [
  { name: "salt", type: "uint256" },
  { name: "maker", type: "address" },
  { name: "signer", type: "address" },
  { name: "taker", type: "address" },
  { name: "tokenId", type: "uint256" },
  { name: "makerAmount", type: "uint256" },
  { name: "takerAmount", type: "uint256" },
  { name: "expiration", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "feeRateBps", type: "uint256" },
  { name: "side", type: "uint8" },
  { name: "signatureType", type: "uint8" },
];

export const PREDICT_FUN_MAX_SALT = 2_147_483_648;

export const PREDICT_FUN_ADDRESSES_BY_CHAIN_ID: Record<
  PredictFunChainId,
  {
    YIELD_BEARING_CTF_EXCHANGE: string;
    YIELD_BEARING_NEG_RISK_CTF_EXCHANGE: string;
    CTF_EXCHANGE: string;
    NEG_RISK_CTF_EXCHANGE: string;
    YIELD_BEARING_CONDITIONAL_TOKENS: string;
    YIELD_BEARING_NEG_RISK_CONDITIONAL_TOKENS: string;
    CONDITIONAL_TOKENS: string;
    NEG_RISK_CONDITIONAL_TOKENS: string;
    USDT: string;
  }
> = {
  56: {
    YIELD_BEARING_CTF_EXCHANGE: "0x6bEb5a40C032AFc305961162d8204CDA16DECFa5",
    YIELD_BEARING_NEG_RISK_CTF_EXCHANGE: "0x8A289d458f5a134bA40015085A8F50Ffb681B41d",
    CTF_EXCHANGE: "0x8BC070BEdAB741406F4B1Eb65A72bee27894B689",
    NEG_RISK_CTF_EXCHANGE: "0x365fb81bd4A24D6303cd2F19c349dE6894D8d58A",
    YIELD_BEARING_CONDITIONAL_TOKENS: "0x9400F8Ad57e9e0F352345935d6D3175975eb1d9F",
    YIELD_BEARING_NEG_RISK_CONDITIONAL_TOKENS: "0xF64b0b318AAf83BD9071110af24D24445719A07F",
    CONDITIONAL_TOKENS: "0x22DA1810B194ca018378464a58f6Ac2B10C9d244",
    NEG_RISK_CONDITIONAL_TOKENS: "0x22DA1810B194ca018378464a58f6Ac2B10C9d244",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
  },
  97: {
    YIELD_BEARING_CTF_EXCHANGE: "0x8a6B4Fa700A1e310b106E7a48bAFa29111f66e89",
    YIELD_BEARING_NEG_RISK_CTF_EXCHANGE: "0x95D5113bc50eD201e319101bbca3e0E250662fCC",
    CTF_EXCHANGE: "0x2A6413639BD3d73a20ed8C95F634Ce198ABbd2d7",
    NEG_RISK_CTF_EXCHANGE: "0xd690b2bd441bE36431F6F6639D7Ad351e7B29680",
    YIELD_BEARING_CONDITIONAL_TOKENS: "0x38BF1cbD66d174bb5F3037d7068E708861D68D7f",
    YIELD_BEARING_NEG_RISK_CONDITIONAL_TOKENS: "0x26e865CbaAe99b62fbF9D18B55c25B5E079A93D5",
    CONDITIONAL_TOKENS: "0x2827AAef52D71910E8FBad2FfeBC1B6C2DA37743",
    NEG_RISK_CONDITIONAL_TOKENS: "0x2827AAef52D71910E8FBad2FfeBC1B6C2DA37743",
    USDT: "0xB32171ecD878607FFc4F8FC0bCcE6852BB3149E0",
  },
};

export function predictFunExchangeAddress(
  chainId: PredictFunChainId,
  flags: PredictFunMarketFlags
): string {
  const a = PREDICT_FUN_ADDRESSES_BY_CHAIN_ID[chainId];
  if (flags.isNegRisk) {
    return flags.isYieldBearing ? a.YIELD_BEARING_NEG_RISK_CTF_EXCHANGE : a.NEG_RISK_CTF_EXCHANGE;
  }
  return flags.isYieldBearing ? a.YIELD_BEARING_CTF_EXCHANGE : a.CTF_EXCHANGE;
}

export function predictFunConditionalTokensAddress(
  chainId: PredictFunChainId,
  flags: PredictFunMarketFlags
): string {
  const a = PREDICT_FUN_ADDRESSES_BY_CHAIN_ID[chainId];
  if (flags.isYieldBearing) {
    return flags.isNegRisk ? a.YIELD_BEARING_NEG_RISK_CONDITIONAL_TOKENS : a.YIELD_BEARING_CONDITIONAL_TOKENS;
  }
  return flags.isNegRisk ? a.NEG_RISK_CONDITIONAL_TOKENS : a.CONDITIONAL_TOKENS;
}

export function randomSaltString(): string {
  return String(Math.floor(Math.random() * PREDICT_FUN_MAX_SALT));
}

/** Predict.fun POST /orders: pricePerShare allows at most 2 decimal places (e.g. 0.48, not 0.475). */
export const PREDICT_FUN_PRICE_DECIMALS = 2;
export const PREDICT_FUN_PRICE_DENOM = 10 ** PREDICT_FUN_PRICE_DECIMALS;

export function roundPredictFunPrice(price01: number): number {
  const p = Number(price01);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const factor = PREDICT_FUN_PRICE_DENOM;
  return Math.round(p * factor) / factor;
}

export function predictFunPriceFraction(price01: number): {
  priceNum: number;
  priceDenom: number;
  priceRounded: number;
} {
  const priceRounded = roundPredictFunPrice(price01);
  const priceNumRaw = Math.round(priceRounded * PREDICT_FUN_PRICE_DENOM);
  const priceNum = Math.max(
    1,
    Math.min(PREDICT_FUN_PRICE_DENOM - 1, priceNumRaw)
  );
  return {
    priceNum,
    priceDenom: PREDICT_FUN_PRICE_DENOM,
    priceRounded: priceNum / PREDICT_FUN_PRICE_DENOM,
  };
}

/** pricePerShare as 18-decimal wei matching priceNum/priceDenom exactly. */
export function predictFunPricePerShareWei(priceNum: number): string {
  const exp = 18 - PREDICT_FUN_PRICE_DECIMALS;
  return BigNumber.from(priceNum)
    .mul(BigNumber.from(10).pow(exp))
    .toString();
}

export function buildPredictFunLimitOrder(params: {
  maker: string;
  signer?: string;
  tokenId: string;
  side: PredictFunOrderSide;
  makerAmount: string;
  takerAmount: string;
  feeRateBps: number;
  expirationSec?: number;
  nonce?: string;
  salt?: string;
  signatureType?: PredictFunSignatureType;
}): PredictFunContractOrder {
  const now = Math.floor(Date.now() / 1000);
  const expiration =
    typeof params.expirationSec === "number" && params.expirationSec > now
      ? params.expirationSec
      : Math.floor(new Date("2100-01-01T00:00:00Z").getTime() / 1000);

  const maker = utils.getAddress(params.maker);
  const signer = utils.getAddress(params.signer ?? params.maker);
  return {
    salt: params.salt ?? randomSaltString(),
    maker,
    signer,
    taker: utils.getAddress("0x0000000000000000000000000000000000000000"),
    tokenId: String(params.tokenId),
    makerAmount: String(params.makerAmount),
    takerAmount: String(params.takerAmount),
    expiration: String(expiration),
    nonce: String(params.nonce ?? "0"),
    feeRateBps: String(params.feeRateBps ?? 0),
    side: params.side,
    signatureType: params.signatureType ?? 0,
  };
}

export function buildPredictFunTypedData(args: {
  chainId: PredictFunChainId;
  verifyingContract: string;
  order: PredictFunContractOrder;
}) {
  return {
    primaryType: "Order",
    types: {
      EIP712Domain: PREDICT_FUN_EIP712_DOMAIN,
      Order: PREDICT_FUN_ORDER_STRUCTURE,
    },
    domain: {
      name: PREDICT_FUN_PROTOCOL_NAME,
      version: PREDICT_FUN_PROTOCOL_VERSION,
      chainId: args.chainId,
      verifyingContract: args.verifyingContract,
    },
    message: { ...args.order },
  };
}

export function hashPredictFunTypedData(typedData: ReturnType<typeof buildPredictFunTypedData>): string {
  const { EIP712Domain: _ignored, ...types } = typedData.types as any;
  return (utils as any)._TypedDataEncoder.hash(typedData.domain, types, typedData.message);
}

