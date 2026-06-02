"use client";

import { useState, useCallback } from "react";
import type { providers } from "ethers";
import type { Address, Hex } from "viem";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";
import { MYRIAD_PREDICTION_MARKET_BSC } from "@/lib/myriad/predictionMarket";
import { formatMyriadTradeError } from "@/lib/myriad/formatMyriadTradeError";
import {
  ensureErc20AllowanceForSpender,
  myriadHumanCollateralToWei,
} from "@/lib/myriad/ensureErc20Allowance";
import { ensureErc1155OperatorForMarket } from "@/lib/myriad/ensureOutcomeTokenApproval";
import { resolveMyriadConditionalTokensForMarket } from "@/lib/myriad/resolveConditionalTokensAddress";
import {
  waitForEthersProviderChainId,
  preflightEthCallOnBsc,
  sendBscTransactionWithViemWallet,
} from "@/lib/myriad/bscWalletTx";
import { resolveAmmSellShareHumanForQuote } from "@/lib/myriad/resolveAmmSellShareAmount";

export type MyriadAmmTradeParams = {
  /** Fallback when `marketId` + `networkId` are not both set (Myriad: use slug XOR id+network). */
  marketSlug: string;
  /**
   * Root API market id + network id (e.g. from GET /markets/:slug). Prefer over slug per Myriad quote docs.
   */
  marketId?: number;
  networkId?: number;
  /** On-chain / API outcome id (not CLOB’s 0=Yes/1=No index when those differ). */
  outcomeId: number;
  action: "buy" | "sell";
  /** Buy: collateral amount (stable / quote token units). Omit for sell-by-shares. */
  value?: number;
  /** Sell: share amount. */
  shares?: number;
  slippage?: number;
  /**
   * AMM buy: collateral ERC20 from market details (`token.address`).
   * Used to approve the prediction market before the trade tx (fixes “insufficient allowance”).
   */
  collateralTokenAddress?: string;
  /** Defaults to 18 when omitted. */
  collateralDecimals?: number;
  /** Portfolio “available” for this outcome — caps / trims near-max sells (API `tokenId` is not ERC1155 id). */
  availableSharesCeiling?: number | null;
};

export type MyriadAmmTradeResult = {
  success: boolean;
  txHash?: string;
  error?: string;
};

type QuoteApiResponse = {
  calldata?: string;
  to?: string;
  contract?: string;
  error?: string;
  /** Collateral charged (human units); may differ slightly from request after fees/rounding. */
  value?: number;
};

/**
 * AMM markets: POST /markets/quote then submit returned calldata on BSC.
 */
export function useMyriadAmmTrade(ethersSigner: providers.JsonRpcSigner | null) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { wallets } = useWallets();
  const { user } = usePrivy();

  const executeAmmTrade = useCallback(
    async (params: MyriadAmmTradeParams): Promise<MyriadAmmTradeResult> => {
      if (!ethersSigner) {
        return { success: false, error: "Connect a wallet to trade" };
      }
      const slug = params.marketSlug?.trim();
      const mid =
        params.marketId != null && Number.isFinite(params.marketId) && params.marketId > 0
          ? Math.floor(params.marketId)
          : 0;
      const nid =
        params.networkId != null && Number.isFinite(params.networkId) && params.networkId > 0
          ? Math.floor(params.networkId)
          : 0;
      if (!slug && !(mid > 0 && nid > 0)) {
        return { success: false, error: "Missing market" };
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
              error: `Switch to BNB Smart Chain to trade. (${msg})`,
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
            "Your wallet must stay on BNB Smart Chain (BSC) for Myriad trades. Switch network and try again.",
        };
      }

      // Myriad POST /markets/quote: exactly one of (market_slug) OR (market_id + network_id); buy omits `shares`; sell sends exactly one of value/shares.
      const body: Record<string, unknown> =
        mid > 0 && nid > 0
          ? { market_id: mid, network_id: nid, outcome_id: params.outcomeId, action: params.action }
          : { market_slug: slug, outcome_id: params.outcomeId, action: params.action };
      const slip = params.slippage ?? 0.02;
      if (Number.isFinite(slip)) body.slippage = slip;

      if (params.action === "buy") {
        const v = params.value;
        if (v == null || !Number.isFinite(v) || v <= 0) {
          return { success: false, error: "Invalid buy amount" };
        }
        body.value = v;
      } else {
        const sh = params.shares;
        if (sh != null && Number.isFinite(sh) && sh > 0) {
          const floored = Math.floor(sh * 1_000_000) / 1_000_000;
          if (floored <= 0) {
            return { success: false, error: "Sell size is too small" };
          }
          const resolved = resolveAmmSellShareHumanForQuote({
            flooredHuman: floored,
            availableSharesCeiling: params.availableSharesCeiling,
          });
          if ("error" in resolved) {
            return { success: false, error: resolved.error };
          }
          body.shares = resolved.shares;
        } else if (params.value != null && Number.isFinite(params.value) && params.value > 0) {
          body.value = params.value;
        } else {
          return { success: false, error: "Sell requires shares or value" };
        }
      }

      setIsSubmitting(true);
      try {
        const res = await fetch("/api/myriad/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as QuoteApiResponse & { error?: string };
        if (!res.ok) {
          return {
            success: false,
            error: formatMyriadTradeError(data?.error || `Quote failed (${res.status})`),
          };
        }
        const calldata = typeof data.calldata === "string" ? data.calldata.trim() : "";
        if (!calldata.startsWith("0x")) {
          return { success: false, error: "Invalid quote: missing calldata" };
        }
        const to =
          typeof data.to === "string" && data.to.startsWith("0x")
            ? data.to
            : typeof data.contract === "string" && data.contract.startsWith("0x")
              ? data.contract
              : MYRIAD_PREDICTION_MARKET_BSC;

        if (params.action === "buy" && params.collateralTokenAddress) {
          const dec =
            params.collateralDecimals != null && Number.isFinite(params.collateralDecimals)
              ? Math.floor(params.collateralDecimals)
              : 18;
          const req = params.value ?? 0;
          const quoted =
            typeof data.value === "number" && Number.isFinite(data.value) && data.value > 0
              ? data.value
              : req;
          const allowanceHuman = Math.max(req, quoted);
          const minWei = myriadHumanCollateralToWei(allowanceHuman, dec);
          await ensureErc20AllowanceForSpender(
            ethersSigner,
            params.collateralTokenAddress,
            to,
            minWei
          );
        }

        if (params.action === "sell") {
          const ctf = await resolveMyriadConditionalTokensForMarket(to);
          await ensureErc1155OperatorForMarket(ethersSigner, ctf, to);
        }

        const fromAddr = (await ethersSigner.getAddress()) as Address;
        const pre = await preflightEthCallOnBsc({
          from: fromAddr,
          to: to as Address,
          data: calldata as Hex,
        });
        if (!pre.ok) {
          return { success: false, error: formatMyriadTradeError(pre.message) };
        }

        let txHash: string;
        if (wallet) {
          const ep = await wallet.getEthereumProvider();
          const sent = await sendBscTransactionWithViemWallet(ep, fromAddr, {
            to: to as Address,
            data: calldata as Hex,
            value: BigInt(0),
          });
          txHash = sent.txHash;
        } else {
          const tx = await ethersSigner.sendTransaction({
            to,
            data: calldata,
            value: 0,
          });
          const receipt = await tx.wait(1);
          txHash = receipt?.transactionHash ?? tx.hash;
        }
        return { success: true, txHash };
      } catch (e) {
        let msg = formatMyriadTradeError(e);
        if (
          params.action === "sell" &&
          (msg.includes("could not be simulated") ||
            msg.toLowerCase().includes("estimate gas") ||
            msg.toLowerCase().includes("unpredictable_gas_limit"))
        ) {
          msg = `${msg} If you are selling, confirm ERC1155 approval (setApprovalForAll) on Conditional Tokens for the Prediction Market, that you hold enough outcome shares on BSC, and that you have BNB for gas.`;
        }
        return { success: false, error: msg };
      } finally {
        setIsSubmitting(false);
      }
    },
    [ethersSigner, wallets, user?.wallet?.address]
  );

  return { executeAmmTrade, isSubmitting };
}
