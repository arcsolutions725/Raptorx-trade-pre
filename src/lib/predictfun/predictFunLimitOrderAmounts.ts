import { BigNumber, constants, utils } from "ethers";
import {
  predictFunPriceFraction,
  predictFunPricePerShareWei,
} from "@/lib/predictfun/orderEip712";

/** Predict.fun REST API minimum order notional (USDT). */
export const PREDICT_FUN_MIN_ORDER_USD = 0.9;

const MIN_SHARES_WEI = BigNumber.from("10000000000000000"); // 0.01 shares
const MIN_ORDER_WEI = utils.parseUnits(
  PREDICT_FUN_MIN_ORDER_USD.toFixed(2),
  18
);

/** Mirrors @predictdotfun/sdk retainSignificantDigits (bigint). */
function retainSignificantDigitsWei(value: BigNumber, significantDigits: number): BigNumber {
  if (value.isZero()) return value;
  const negative = value.lt(0);
  const abs = negative ? value.mul(-1) : value;
  const s = abs.toString();
  const excess = s.length - significantDigits;
  if (excess <= 0) return value;
  const divisor = BigNumber.from(10).pow(excess);
  const truncated = abs.div(divisor).mul(divisor);
  return negative ? truncated.mul(-1) : truncated;
}

function assertBuyAmountsMatchPrice(
  makerAmount: BigNumber,
  takerAmount: BigNumber,
  priceWei: BigNumber
): void {
  if (!makerAmount.mul(constants.WeiPerEther).eq(takerAmount.mul(priceWei))) {
    throw new Error("Maker/Taker Limit amounts do not match order price");
  }
}

function assertSellAmountsMatchPrice(
  makerAmount: BigNumber,
  takerAmount: BigNumber,
  priceWei: BigNumber
): void {
  if (!takerAmount.mul(constants.WeiPerEther).eq(makerAmount.mul(priceWei))) {
    throw new Error("Maker/Taker Limit amounts do not match order price");
  }
}

/**
 * Limit order maker/taker amounts in 18-decimal wei.
 * Matches @predictdotfun/sdk getLimitOrderAmounts:
 *   BUY:  maker = (price * qty) / 1e18, taker = qty
 *   SELL: maker = qty, taker = (price * qty) / 1e18
 */
export function buildPredictFunLimitOrderAmounts(args: {
  side: "buy" | "sell";
  price01: number;
  /** USDT to spend (buy only). */
  usdAmount?: number;
  /** Outcome shares to sell (sell only). */
  quantityShares?: number;
}): {
  makerAmount: string;
  takerAmount: string;
  pricePerShareWei: string;
  priceRounded: number;
  orderValueUsd: number;
} {
  const { priceNum, priceRounded } = predictFunPriceFraction(args.price01);
  const priceWei = retainSignificantDigitsWei(
    BigNumber.from(predictFunPricePerShareWei(priceNum)),
    3
  );

  if (args.side === "buy") {
    const usd = Number(args.usdAmount ?? 0);
    if (!Number.isFinite(usd) || usd <= 0) {
      throw new Error("Enter a valid USD amount.");
    }
    if (usd < PREDICT_FUN_MIN_ORDER_USD - 1e-9) {
      throw new Error(
        `Order must have a value of at least ${PREDICT_FUN_MIN_ORDER_USD} USD`
      );
    }

    const usdWeiTarget = utils.parseUnits(usd.toFixed(2), 18);

    // Shares from budget (floor), then maker from SDK formula so ratio is exact.
    let takerAmount = retainSignificantDigitsWei(
      usdWeiTarget.mul(constants.WeiPerEther).div(priceWei),
      5
    );

    let makerAmount = priceWei.mul(takerAmount).div(constants.WeiPerEther);

    if (makerAmount.lt(MIN_ORDER_WEI)) {
      // Ceil share count so notional meets minimum while preserving exact ratio.
      takerAmount = retainSignificantDigitsWei(
        MIN_ORDER_WEI.mul(constants.WeiPerEther)
          .add(priceWei.sub(1))
          .div(priceWei),
        5
      );
      makerAmount = priceWei.mul(takerAmount).div(constants.WeiPerEther);
    }

    if (takerAmount.lt(MIN_SHARES_WEI) || makerAmount.lt(MIN_ORDER_WEI)) {
      throw new Error(
        `Order must have a value of at least ${PREDICT_FUN_MIN_ORDER_USD} USD`
      );
    }

    assertBuyAmountsMatchPrice(makerAmount, takerAmount, priceWei);

    const orderValueUsd = Number(utils.formatUnits(makerAmount, 18));

    return {
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      pricePerShareWei: priceWei.toString(),
      priceRounded,
      orderValueUsd,
    };
  }

  const shares = Number(args.quantityShares ?? 0);
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new Error("Enter a valid share amount.");
  }

  const makerAmount = retainSignificantDigitsWei(
    utils.parseUnits(shares.toFixed(5).replace(/\.?0+$/, "") || "0", 18),
    5
  );

  if (makerAmount.lt(MIN_SHARES_WEI)) {
    throw new Error("Order size is too small");
  }

  const takerAmount = priceWei.mul(makerAmount).div(constants.WeiPerEther);

  if (takerAmount.lt(MIN_ORDER_WEI)) {
    throw new Error(
      `Order must have a value of at least ${PREDICT_FUN_MIN_ORDER_USD} USD`
    );
  }

  assertSellAmountsMatchPrice(makerAmount, takerAmount, priceWei);

  return {
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    pricePerShareWei: priceWei.toString(),
    priceRounded,
    orderValueUsd: Number(utils.formatUnits(takerAmount, 18)),
  };
}
