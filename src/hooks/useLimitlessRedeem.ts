"use client";

import { useState, useCallback } from "react";
import { createWalletClient, custom, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { useWallets } from "@privy-io/react-auth";
import { USDC_BASE_ADDRESS, LIMITLESS_CTF_BASE_ADDRESS } from "@/constants/tokens";

/** Conditional Tokens (CTF) contract: redeemPositions */
const CTF_REDEEM_ABI = [
  {
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    name: "redeemPositions",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const PARENT_COLLECTION_ID = ("0x" + "0".repeat(64)) as `0x${string}`;
/** Binary market: redeem both outcome index sets [1, 2] so winnings are sent to user. */
const INDEX_SETS = [BigInt(1), BigInt(2)] as const;

/**
 * Normalize condition ID to bytes32 (0x + 64 hex chars).
 * Limitless/API may return with or without 0x prefix.
 */
function toConditionIdBytes32(value: string): `0x${string}` {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length > 64) return (`0x${hex.slice(-64)}` as `0x${string}`);
  if (hex.length < 64) return (`0x${hex.padStart(64, "0")}` as `0x${string}`);
  return (`0x${hex}` as `0x${string}`);
}

export type LimitlessRedeemResult = { hash: string };

/**
 * Redeem resolved Limitless market positions via the Conditional Tokens Framework on Base.
 * Calls redeemPositions(collateralToken, parentCollectionId, conditionId, indexSets)
 * with USDC as collateral, parent = 0x0, index sets [1, 2] as per Limitless team.
 */
export function useLimitlessRedeem() {
  const { wallets } = useWallets();
  const [isRedeeming, setIsRedeeming] = useState(false);

  const redeem = useCallback(
    async (
      account: `0x${string}`,
      marketSlug: string
    ): Promise<LimitlessRedeemResult> => {
      if (!marketSlug?.trim()) {
        throw new Error("Market slug is required to claim winnings.");
      }

      const detailsRes = await fetch(
        `/api/limitless/market-details?slug=${encodeURIComponent(marketSlug.trim())}`,
        { cache: "no-store" }
      );
      if (!detailsRes.ok) {
        const err = (await detailsRes.json()).error ?? detailsRes.statusText;
        throw new Error(`Failed to load market: ${err}`);
      }

      const details = (await detailsRes.json()) as {
        conditionId?: string | null;
      };
      const rawConditionId = details.conditionId;
      if (rawConditionId == null || String(rawConditionId).trim() === "") {
        throw new Error(
          "This market does not expose a condition ID for redemption. Please try again later or contact support."
        );
      }

      // Use the official Limitless CTF on Base (all CLOB markets resolve and redeem here)
      // @see https://docs.limitless.exchange/user-guide/smart-contracts
      const ctfAddress = LIMITLESS_CTF_BASE_ADDRESS as `0x${string}`;
      const conditionId = toConditionIdBytes32(String(rawConditionId).trim());

      // No pre-check: attempt redeem and let the contract decide (avoids blocking when API conditionId or our read differs from on-chain state)
      const NOT_RECEIVED_MSG =
        "The market result has not been reported on-chain yet. Claim will be available shortly after the market resolves. Please try again in a few minutes.";

      const eoa = account.toLowerCase();
      const wallet = wallets?.find(
        (w) => (w.address as string).toLowerCase() === eoa
      );
      if (!wallet) {
        throw new Error("Wallet not found. Please connect your wallet.");
      }

      const provider = await (
        wallet as { getEthereumProvider?: () => Promise<unknown> }
      ).getEthereumProvider?.();
      if (!provider) {
        throw new Error("Could not get wallet provider.");
      }

      const walletWithSwitch = wallet as {
        chainId?: string | number;
        switchChain?: (chainId: number) => Promise<void>;
      };
      const currentChainId = walletWithSwitch.chainId;
      const isOnBase =
        currentChainId === base.id ||
        currentChainId === `eip155:${base.id}` ||
        currentChainId === String(base.id);
      if (!isOnBase && typeof walletWithSwitch.switchChain === "function") {
        await walletWithSwitch.switchChain(base.id);
      }

      const client = createWalletClient({
        account,
        chain: base,
        transport: custom(provider as Parameters<typeof custom>[0]),
      });

      setIsRedeeming(true);
      try {
        const hash = await client.sendTransaction({
          to: ctfAddress,
          data: encodeFunctionData({
            abi: CTF_REDEEM_ABI,
            functionName: "redeemPositions",
            args: [
              USDC_BASE_ADDRESS as `0x${string}`,
              PARENT_COLLECTION_ID,
              conditionId,
              [...INDEX_SETS],
            ],
          }),
        });
        return { hash };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          /result for condition not received yet|result not received/i.test(msg)
        ) {
          throw new Error(NOT_RECEIVED_MSG);
        }
        throw err;
      } finally {
        setIsRedeeming(false);
      }
    },
    [wallets]
  );

  return { redeem, isRedeeming };
}
