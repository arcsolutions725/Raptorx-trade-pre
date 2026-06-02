"use client";

import { utils, type providers } from "ethers";
import type { PredictFunChainId } from "@/lib/predictfun/orderEip712";
import {
  clearPredictFunJwt,
  readPredictFunJwt,
  writePredictFunJwt,
} from "@/lib/predictfun/jwtStorage";
import {
  clearPredictFunPredictAccount,
  readPredictFunPredictAccount,
  writePredictFunPredictAccount,
} from "@/lib/predictfun/predictFunAccountStorage";
import {
  isPredictFunPredictAccount,
  signPredictFunAccountAuthMessage,
} from "@/lib/predictfun/predictAccountSigning";

export type PredictFunAuthContext = {
  jwt: string;
  walletAddress: string;
  authSigner: string;
  predictAccount: string | null;
  tradingAddress: string;
  chainId: PredictFunChainId;
  apiBase: string;
};

async function fetchPredictFunConfig(): Promise<{
  chainId: PredictFunChainId;
  apiBase: string;
}> {
  const cfgRes = await fetch("/api/predictfun/config", { cache: "no-store" });
  if (!cfgRes.ok) throw new Error("Predict.fun config unavailable");
  const cfg = (await cfgRes.json()) as {
    chainId?: number;
    base?: string;
  };
  return {
    chainId: (cfg.chainId === 97 ? 97 : 56) as PredictFunChainId,
    apiBase: String(cfg.base ?? "mainnet"),
  };
}

async function fetchAuthMessage(): Promise<string> {
  const msgRes = await fetch("/api/predictfun/auth-message", { cache: "no-store" });
  if (!msgRes.ok) throw new Error("Failed to get Predict.fun auth message");
  const msgJson = (await msgRes.json()) as { data?: { message?: string } };
  const message = String(msgJson?.data?.message ?? "").trim();
  if (!message) throw new Error("Predict.fun auth message missing");
  return message;
}

async function exchangeAuthForJwt(body: {
  signer: string;
  message: string;
  signature: string;
}): Promise<string> {
  const authRes = await fetch("/api/predictfun/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!authRes.ok) {
    const err = await authRes.json().catch(() => ({ error: authRes.statusText }));
    throw new Error(err.error || "Predict.fun auth failed");
  }
  const authJson = (await authRes.json()) as { data?: { token?: string } };
  const jwt = String(authJson?.data?.token ?? "").trim();
  if (!jwt) throw new Error("Predict.fun JWT missing from response");
  return jwt;
}

async function fetchConnectedAccountAddress(jwt: string): Promise<string | null> {
  const res = await fetch("/api/predictfun/account", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { address?: string } };
  const addr = String(json?.data?.address ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? utils.getAddress(addr) : null;
}

async function authenticateWithSigner(args: {
  signer: providers.JsonRpcSigner;
  chainId: PredictFunChainId;
  apiBase: string;
  authSigner: string;
  predictAccount: string | null;
  usePredictAccountSignature: boolean;
}): Promise<string> {
  const message = await fetchAuthMessage();
  const signature = args.usePredictAccountSignature
    ? await signPredictFunAccountAuthMessage(
        args.signer,
        args.authSigner,
        args.chainId,
        message
      )
    : await args.signer.signMessage(message);

  const jwt = await exchangeAuthForJwt({
    signer: args.authSigner,
    message,
    signature,
  });

  writePredictFunJwt(args.chainId, args.authSigner, jwt, args.apiBase);
  return jwt;
}

/**
 * Obtain a Predict.fun JWT for the connected wallet (EOA or Predict Account).
 * @see https://dev.predict.fun/doc-663127
 */
export async function authenticatePredictFun(
  signer: providers.JsonRpcSigner,
  options?: { forceRefresh?: boolean }
): Promise<PredictFunAuthContext> {
  const walletAddress = utils.getAddress(await signer.getAddress());
  const { chainId, apiBase } = await fetchPredictFunConfig();

  const storedPredictAccount = readPredictFunPredictAccount(chainId, walletAddress);
  let predictAccount = storedPredictAccount
    ? utils.getAddress(storedPredictAccount)
    : null;

  let authSigner = predictAccount ?? walletAddress;
  const usePredictAccountSignature = Boolean(
    predictAccount && isPredictFunPredictAccount(walletAddress, predictAccount)
  );

  if (!options?.forceRefresh) {
    const cached = readPredictFunJwt(chainId, authSigner, apiBase);
    if (cached) {
      return {
        jwt: cached,
        walletAddress,
        authSigner,
        predictAccount,
        tradingAddress: predictAccount ?? walletAddress,
        chainId,
        apiBase,
      };
    }
  } else {
    clearPredictFunJwt(chainId, authSigner, apiBase);
    clearPredictFunJwt(chainId, walletAddress, apiBase);
  }

  let jwt = await authenticateWithSigner({
    signer,
    chainId,
    apiBase,
    authSigner,
    predictAccount,
    usePredictAccountSignature,
  });

  const accountAddress = await fetchConnectedAccountAddress(jwt);
  if (
    accountAddress &&
    isPredictFunPredictAccount(walletAddress, accountAddress)
  ) {
    writePredictFunPredictAccount(chainId, walletAddress, accountAddress);
    predictAccount = accountAddress;

    if (authSigner.toLowerCase() !== accountAddress.toLowerCase()) {
      clearPredictFunJwt(chainId, authSigner, apiBase);
      authSigner = accountAddress;
      jwt = await authenticateWithSigner({
        signer,
        chainId,
        apiBase,
        authSigner: accountAddress,
        predictAccount: accountAddress,
        usePredictAccountSignature: true,
      });
    }
  } else if (predictAccount) {
    clearPredictFunPredictAccount(chainId, walletAddress);
    predictAccount = null;
    authSigner = walletAddress;
  }

  return {
    jwt,
    walletAddress,
    authSigner,
    predictAccount,
    tradingAddress: predictAccount ?? walletAddress,
    chainId,
    apiBase,
  };
}

export function clearPredictFunSession(
  chainId: number,
  walletAddress: string,
  authSigner: string,
  apiBase: string
): void {
  clearPredictFunJwt(chainId, authSigner, apiBase);
  clearPredictFunJwt(chainId, walletAddress, apiBase);
  clearPredictFunPredictAccount(chainId, walletAddress);
}
