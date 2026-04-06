"use client";

import { useState, useCallback } from "react";
import { BigNumber } from "ethers";
import type { providers } from "ethers";

const BASE_CHAIN_ID = 8453;
const SCALING = 1e6; // USDC 6 decimals, shares 1e6

/** For 3-decimal price, contracts must end with 3 zeros (multiple of 1000). See Limitless tick violation. */
const CONTRACTS_TICK = 1000;

/** Extract Limitless API message from error string e.g. "Limitless orders 400: {\"message\":\"Insufficient collateral...\"}" */
function parseLimitlessErrorMessage(errorStr: string): string {
  if (!errorStr || typeof errorStr !== "string") return errorStr;
  const colonSpace = errorStr.indexOf(": {");
  if (colonSpace === -1) return errorStr;
  try {
    const jsonStr = errorStr.slice(colonSpace + 2).trim();
    const obj = JSON.parse(jsonStr) as { message?: string | Array<{ message?: string }> };
    const msg = obj?.message;
    if (typeof msg === "string") return msg;
    if (Array.isArray(msg) && msg.length > 0 && typeof msg[0]?.message === "string")
      return msg[0].message;
  } catch {
    // fallback: take content of first "message":"..."
    const i = errorStr.indexOf('"message":"');
    if (i !== -1) {
      const start = i + '"message":"'.length;
      const end = errorStr.indexOf('"', start);
      if (end !== -1) return errorStr.slice(start, end).replace(/\\"/g, '"');
    }
  }
  return errorStr;
}

export type LimitlessVenue = {
  exchange: string;
  adapter?: string;
};

export type LimitlessOrderResult = {
  success: boolean;
  orderId?: string;
  error?: string;
  matched?: boolean;
  settlementStatus?: string;
};

export type LimitlessOrderParams = {
  side: "BUY" | "SELL";
  outcome: "Yes" | "No";
  /** Price in dollars (0–1), e.g. 0.65 for 65¢ */
  price: number;
  /** For BUY: number of shares. For SELL: number of shares. */
  amountShares: number;
  /** Fee rate in basis points from user rank */
  feeRateBps?: number;
};

function getOrderTypes() {
  return {
    Order: [
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
    ],
  };
}

function buildOrderPayload(
  makerAddress: string,
  tokenId: string,
  side: 0 | 1,
  makerAmount: number,
  takerAmount: number,
  feeRateBps: number
) {
  const salt = Math.floor(Date.now()) + 24 * 60 * 60 * 1000;
  // EIP-712 signing uses numeric expiration; Limitless API expects order.expiration as string (converted in API route)
  return {
    salt,
    maker: makerAddress,
    signer: makerAddress,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId,
    makerAmount,
    takerAmount,
    expiration: 0,
    nonce: 0,
    feeRateBps,
    side,
    signatureType: 0,
  };
}

/**
 * Build and sign a Limitless order (EIP-712), then submit via our API.
 * Requires venue.exchange and positionIds from GET /markets/:slug.
 */
export function useLimitlessOrder(
  ethersSigner: providers.JsonRpcSigner | null,
  venue: LimitlessVenue | null,
  positionIds: string[] | null,
  ownerId: string | null,
  feeRateBps: number = 0
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submitOrder = useCallback(
    async (
      params: LimitlessOrderParams,
      marketSlug: string,
      orderType: "GTC" | "FOK" = "GTC",
      /** When provided (e.g. right after login), use this instead of hook ownerId to avoid race. */
      overrideOwnerId?: string | null,
      /** When provided (e.g. user.account from login), use for order maker/signer so it matches Limitless profile (EIP-55). */
      overrideMakerAddress?: string | null,
      /** User's Limitless session cookie so the API can identify the profile (avoids "Profile ID does not match order owner"). */
      sessionCookie?: string | null
    ): Promise<LimitlessOrderResult> => {
      const effectiveOwnerId = overrideOwnerId != null ? String(overrideOwnerId) : ownerId != null ? String(ownerId) : null;
      const slug = typeof marketSlug === "string" ? marketSlug.trim() : "";
      if (!ethersSigner || !venue?.exchange || !positionIds?.length || !effectiveOwnerId) {
        return {
          success: false,
          error: !ethersSigner
            ? "Wallet not connected"
            : !venue?.exchange
              ? "Market venue not available"
              : !positionIds?.length
                ? "Market position IDs not available"
                : "Please sign in to Limitless first",
        };
      }
      if (!slug) {
        return { success: false, error: "Market slug is required" };
      }

      const tokenId =
        params.outcome === "Yes" ? positionIds[0]! : positionIds[1] ?? positionIds[0]!;
      const side = params.side === "BUY" ? 0 : 1;
      const price3 = parseFloat((params.price).toFixed(3));

      let makerAmount: number;
      let takerAmount: number;

      if (params.side === "BUY") {
        takerAmount = Math.round(params.amountShares * SCALING);
        takerAmount = Math.floor(takerAmount / CONTRACTS_TICK) * CONTRACTS_TICK;
        if (takerAmount < CONTRACTS_TICK) takerAmount = CONTRACTS_TICK;
        makerAmount = Math.round(price3 * takerAmount);
      } else {
        makerAmount = Math.round(params.amountShares * SCALING);
        makerAmount = Math.floor(makerAmount / CONTRACTS_TICK) * CONTRACTS_TICK;
        if (makerAmount < CONTRACTS_TICK) makerAmount = CONTRACTS_TICK;
        takerAmount = Math.round(price3 * makerAmount);
      }

      const walletAddress = await ethersSigner.getAddress();
      const makerAddress =
        typeof overrideMakerAddress === "string" && overrideMakerAddress.trim()
          ? overrideMakerAddress.trim()
          : walletAddress;
      const payload = buildOrderPayload(
        makerAddress,
        tokenId,
        side,
        makerAmount,
        takerAmount,
        params.feeRateBps ?? feeRateBps
      );

      const domain = {
        name: "Limitless CTF Exchange",
        version: "1",
        chainId: BASE_CHAIN_ID,
        verifyingContract: venue.exchange,
      };

      const types = getOrderTypes();
      const message = {
        salt: payload.salt,
        maker: payload.maker,
        signer: payload.signer,
        taker: payload.taker,
        tokenId: BigNumber.from(payload.tokenId),
        makerAmount: BigNumber.from(payload.makerAmount),
        takerAmount: BigNumber.from(payload.takerAmount),
        expiration: payload.expiration,
        nonce: payload.nonce,
        feeRateBps: payload.feeRateBps,
        side: payload.side,
        signatureType: payload.signatureType,
      };

      setIsSubmitting(true);
      setError(null);

      try {
        const signature = await (ethersSigner as providers.JsonRpcSigner & {
          _signTypedData: (
            domain: unknown,
            types: unknown,
            value: unknown
          ) => Promise<string>;
        })._signTypedData(domain, types, message);

        const priceRounded =
          Number.isFinite(params.price) && params.price >= 0
            ? parseFloat((params.price).toFixed(3))
            : params.price;
        const order = {
          ...payload,
          price: priceRounded,
          signature,
        };

        const requestBody: Record<string, unknown> = {
          order,
          ownerId: effectiveOwnerId,
          orderType,
          marketSlug: slug,
        };
        if (typeof sessionCookie === "string" && sessionCookie.trim())
          requestBody.sessionCookie = sessionCookie.trim();

        const res = await fetch("/api/limitless/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const raw = data?.error || `Order failed ${res.status}`;
          throw new Error(parseLimitlessErrorMessage(raw));
        }
        const orderId =
          data?.order?.id ?? data?.id ?? data?.orderId ?? undefined;
        const matched = data?.execution?.matched === true;
        const settlementStatus = data?.execution?.settlementStatus;
        return {
          success: true,
          orderId,
          matched,
          settlementStatus,
        };
      } catch (e) {
        const err = e instanceof Error ? e : new Error("Order failed");
        const message = parseLimitlessErrorMessage(err.message);
        setError(new Error(message));
        return {
          success: false,
          error: message,
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [ethersSigner, venue, positionIds, ownerId, feeRateBps]
  );

  return { submitOrder, isSubmitting, error };
}
