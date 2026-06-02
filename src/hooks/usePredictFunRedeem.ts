"use client";

import { useCallback, useState } from "react";
import type { providers } from "ethers";
import type { PredictFunChainId } from "@/lib/predictfun/orderEip712";
import type { PredictFunPositionRedeemParams } from "@/lib/predictfun/parsePredictFunRedeem";
import { redeemPredictFunPositions } from "@/lib/predictfun/predictFunRedeem";
import { readPredictFunPredictAccount } from "@/lib/predictfun/predictFunAccountStorage";

type PrivyWalletLike = {
  chainId?: string | number;
  switchChain?: (chainId: number) => Promise<void>;
};

async function ensureBnbChain(
  wallet: PrivyWalletLike | null | undefined,
  chainId: PredictFunChainId
): Promise<void> {
  if (!wallet?.switchChain) return;
  const current = wallet.chainId;
  const onBnb =
    current === chainId ||
    current === `eip155:${chainId}` ||
    current === String(chainId);
  if (!onBnb) {
    await wallet.switchChain(chainId);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * Redeem resolved Predict.fun positions on BNB Chain (ethers v5, SDK-compatible calldata).
 * @see https://github.com/PredictDotFun/sdk#how-to-redeem-positions
 */
export function usePredictFunRedeem() {
  const [redeemingKey, setRedeemingKey] = useState<string | null>(null);

  const redeem = useCallback(
    async (args: {
      rowKey: string;
      signer: providers.JsonRpcSigner;
      walletAddress: string;
      chainId: PredictFunChainId;
      params: PredictFunPositionRedeemParams;
      wallet?: PrivyWalletLike | null;
    }): Promise<string | undefined> => {
      const { rowKey, signer, walletAddress, chainId, params, wallet } = args;
      setRedeemingKey(rowKey);
      try {
        await ensureBnbChain(wallet, chainId);
        const predictAccount = readPredictFunPredictAccount(chainId, walletAddress);
        return await redeemPredictFunPositions(
          signer,
          chainId,
          params,
          predictAccount
        );
      } finally {
        setRedeemingKey(null);
      }
    },
    []
  );

  return {
    redeem,
    redeemingKey,
    isRedeeming: (key: string) => redeemingKey === key,
  };
}
