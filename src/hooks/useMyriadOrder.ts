"use client";

import { useState, useCallback } from "react";
import { BigNumber } from "ethers";
import type { providers } from "ethers";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import {
  getMyriadOrderDomain,
  getMyriadOrderEip712Types,
  myriadPriceToWeiString,
  myriadRandomNonceString,
  myriadSharesToWeiString,
  MYRIAD_OB_EXCHANGE_BSC,
  MYRIAD_ORDER_BOOK_CHAIN_ID,
} from "@/lib/myriad/orderBookEip712";
import { ensureErc20AllowanceForSpender } from "@/lib/myriad/ensureErc20Allowance";
import { ensureErc1155OperatorForMarket } from "@/lib/myriad/ensureOutcomeTokenApproval";
import { MYRIAD_PREDICTION_MARKET_BSC } from "@/lib/myriad/predictionMarket";
import { resolveMyriadConditionalTokensForMarket } from "@/lib/myriad/resolveConditionalTokensAddress";
import { waitForEthersProviderChainId } from "@/lib/myriad/bscWalletTx";
import { formatMyriadTradeError } from "@/lib/myriad/formatMyriadTradeError";

export type MyriadTimeInForce = "GTC" | "GTD" | "FOK" | "FAK";

export type MyriadPlaceOrderParams = {
  /** On-chain market id */
  marketId: number;
  /**
   * Ignored for POST /orders — Myriad Order Book API expects `network_id` = **EVM chain id** (BSC `56`),
   * not the market’s protocol `networkId` (e.g. `2741` from GET /markets). We always send `56`.
   * @see https://docs.myriad.markets/builders/myriad-order-book/order-book-api
   */
  networkId?: number;
  /** 0 = Yes, 1 = No */
  outcomeId: 0 | 1;
  /** 0 = buy, 1 = sell */
  side: 0 | 1;
  /** Human share amount (used when amountWei omitted) */
  shares: number;
  /** Limit / market price 0–1 (used when priceWei omitted) */
  price: number;
  /** Exact `price` field for API/EIP-712 (1e18-scaled decimal string). Prefer for limits from whole cents. */
  priceWei?: string;
  /** Exact `amount` field for API/EIP-712 (share wei). Prefer for buys from USD notional. */
  amountWei?: string;
  timeInForce?: MyriadTimeInForce;
  /** GTD only — unix seconds */
  expiration?: number;
  /**
   * Buy orders: ERC20 collateral from market (`token.address` on BSC). Required so we can
   * `approve(MYRIAD_OB_EXCHANGE_BSC)` before POST /orders — API rejects with insufficient allowance otherwise.
   */
  collateralTokenAddress?: string;
  /**
   * Sell orders: optional PredictionMarket / factory used to resolve the ERC1155 Conditional Tokens registry.
   * Defaults to `MYRIAD_PREDICTION_MARKET_BSC` so `setApprovalForAll(MYRIAD_OB_EXCHANGE_BSC)` runs on the correct CTF contract.
   */
  predictionMarketForCtfResolution?: string;
};

export type MyriadPlaceOrderResult = {
  success: boolean;
  orderHash?: string;
  status?: string;
  error?: string;
};

function parseMyriadOrderError(errorStr: string): string {
  if (!errorStr || typeof errorStr !== "string") return errorStr;
  const idx = errorStr.indexOf("Myriad orders ");
  if (idx === -1) return errorStr;
  const jsonStart = errorStr.indexOf("{", idx);
  if (jsonStart === -1) return errorStr.slice(idx);
  try {
    const obj = JSON.parse(errorStr.slice(jsonStart)) as {
      detail?: string;
      message?: string;
      error?: string;
    };
    return obj.error || obj.detail || obj.message || errorStr;
  } catch {
    return errorStr;
  }
}

/**
 * Sign Myriad CLOB order (EIP-712) and POST via /api/myriad/orders.
 * Switches the Privy wallet to BSC (56) before signing when needed.
 */
export function useMyriadOrder(ethersSigner: providers.JsonRpcSigner | null) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { wallets } = useWallets();
  const { user } = usePrivy();

  const placeOrder = useCallback(
    async (params: MyriadPlaceOrderParams): Promise<MyriadPlaceOrderResult> => {
      if (!ethersSigner) {
        return { success: false, error: "Connect a wallet to trade" };
      }
      const mid = params.marketId;
      if (!Number.isFinite(mid) || mid <= 0) {
        return { success: false, error: "Invalid market" };
      }
      const shares = params.shares;
      const price = params.price;
      const hasAmountWei =
        typeof params.amountWei === "string" && params.amountWei.length > 0 && params.amountWei !== "0";
      const hasPriceWei =
        typeof params.priceWei === "string" && params.priceWei.length > 0 && params.priceWei !== "0";
      if (!hasAmountWei && (!Number.isFinite(shares) || shares <= 0)) {
        return { success: false, error: "Invalid size or price" };
      }
      if (!hasPriceWei && (!Number.isFinite(price) || price <= 0 || price > 1)) {
        return { success: false, error: "Invalid size or price" };
      }

      const wallet = wallets.find((w) => w.address === user?.wallet?.address);
      if (wallet) {
        const cid = wallet.chainId;
        const onBsc =
          cid === `eip155:${MYRIAD_ORDER_BOOK_CHAIN_ID}` ||
          cid === String(MYRIAD_ORDER_BOOK_CHAIN_ID);
        if (!onBsc) {
          try {
            await wallet.switchChain(MYRIAD_ORDER_BOOK_CHAIN_ID);
            await new Promise((r) => setTimeout(r, 400));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return {
              success: false,
              error: `Switch to BNB Smart Chain to sign this order. (${msg})`,
            };
          }
        }
      }

      const ethProv = ethersSigner.provider as providers.Web3Provider | undefined;
      const onBscProvider = await waitForEthersProviderChainId(
        ethProv,
        MYRIAD_ORDER_BOOK_CHAIN_ID
      );
      if (!onBscProvider) {
        return {
          success: false,
          error:
            "Your wallet must be on BNB Smart Chain to trade the order book. Switch network and try again.",
        };
      }

      const traderAddress = await ethersSigner.getAddress();
      const priceWei = params.priceWei ?? myriadPriceToWeiString(price);
      const amountWei = params.amountWei ?? myriadSharesToWeiString(shares);
      if (amountWei === "0" || priceWei === "0") {
        return { success: false, error: "Amount too small after rounding" };
      }

      /** Buys lock collateral via the OB exchange; Myriad checks ERC20 allowance (see API error: insufficient collateral allowance). */
      if (params.side === 0) {
        const token = params.collateralTokenAddress?.trim();
        if (!token || !token.startsWith("0x")) {
          return {
            success: false,
            error:
              "This market has no collateral token on file — cannot approve for the order book. Reload the market page and try again.",
          };
        }
        const minAllowance = BigNumber.from(amountWei);
        try {
          await ensureErc20AllowanceForSpender(
            ethersSigner,
            token,
            MYRIAD_OB_EXCHANGE_BSC,
            minAllowance
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            success: false,
            error: formatMyriadTradeError(
              `Collateral approval failed: ${msg}. Approve the Myriad order book contract to spend your market collateral on BNB Smart Chain.`
            ),
          };
        }
      }

      /** Sells move ERC1155 outcome shares via the OB exchange — needs `setApprovalForAll(exchange, true)` on Conditional Tokens. */
      if (params.side === 1) {
        const pm =
          params.predictionMarketForCtfResolution?.trim() &&
          params.predictionMarketForCtfResolution.startsWith("0x")
            ? params.predictionMarketForCtfResolution.trim()
            : MYRIAD_PREDICTION_MARKET_BSC;
        try {
          const ctf = await resolveMyriadConditionalTokensForMarket(pm);
          await ensureErc1155OperatorForMarket(
            ethersSigner,
            ctf,
            MYRIAD_OB_EXCHANGE_BSC
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            success: false,
            error: formatMyriadTradeError(
              `Outcome token approval failed: ${msg}. Approve the Myriad order book to transfer your position tokens (ERC1155) on BNB Smart Chain.`
            ),
          };
        }
      }

      const nonce = myriadRandomNonceString();
      const tif = params.timeInForce ?? "GTC";
      const expiration =
        tif === "GTD" && params.expiration && params.expiration > 0
          ? String(params.expiration)
          : "0";

      const orderForApi = {
        trader: traderAddress,
        marketId: String(mid),
        outcomeId: params.outcomeId,
        side: params.side,
        amount: amountWei,
        price: priceWei,
        minFillAmount: "0",
        nonce,
        expiration,
      };

      const domain = getMyriadOrderDomain();
      const types = getMyriadOrderEip712Types();
      const message = {
        trader: traderAddress,
        marketId: BigNumber.from(mid),
        outcomeId: params.outcomeId,
        side: params.side,
        amount: BigNumber.from(amountWei),
        price: BigNumber.from(priceWei),
        minFillAmount: BigNumber.from(0),
        nonce: BigNumber.from(nonce),
        expiration: BigNumber.from(expiration),
      };

      setIsSubmitting(true);
      setError(null);

      try {
        const signature = await (
          ethersSigner as providers.JsonRpcSigner & {
            _signTypedData: (
              domain: unknown,
              types: unknown,
              value: unknown
            ) => Promise<string>;
          }
        )._signTypedData(domain, types, message);

        const res = await fetch("/api/myriad/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order: orderForApi,
            signature,
            networkId: MYRIAD_ORDER_BOOK_CHAIN_ID,
            time_in_force: tif,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          orderHash?: string;
          status?: string;
        };
        if (!res.ok) {
          const raw = data?.error || `Order failed (${res.status})`;
          throw new Error(raw);
        }
        return {
          success: true,
          orderHash: data.orderHash,
          status: data.status,
        };
      } catch (e) {
        const err = e instanceof Error ? e : new Error("Order failed");
        const message = formatMyriadTradeError(parseMyriadOrderError(err.message));
        setError(new Error(message));
        return { success: false, error: message };
      } finally {
        setIsSubmitting(false);
      }
    },
    [ethersSigner, wallets, user?.wallet?.address]
  );

  return { placeOrder, isSubmitting, error };
}
