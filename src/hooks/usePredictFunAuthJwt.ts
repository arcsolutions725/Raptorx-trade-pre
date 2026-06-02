"use client";

import { useEffect, useState } from "react";
import type { providers } from "ethers";
import { authenticatePredictFun } from "@/lib/predictfun/predictFunClientAuth";
import { readPredictFunJwt } from "@/lib/predictfun/jwtStorage";
import {
  readPredictFunPredictAccount,
  writePredictFunPredictAccount,
} from "@/lib/predictfun/predictFunAccountStorage";
import type { PredictFunChainId } from "@/lib/predictfun/orderEip712";

/**
 * Cached Predict.fun JWT for positions/orders (uses localStorage; refreshes via authenticatePredictFun).
 */
export function usePredictFunAuthJwt(
  signer: providers.JsonRpcSigner | null,
  walletAddress: string | undefined,
  enabled: boolean
) {
  const [jwt, setJwt] = useState<string | null>(null);
  const [tradingAddress, setTradingAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<PredictFunChainId>(56);
  const [apiBase, setApiBase] = useState("mainnet");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !walletAddress) {
      setJwt(null);
      setTradingAddress(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const cfgRes = await fetch("/api/predictfun/config", { cache: "no-store" });
        const cfg = cfgRes.ok
          ? ((await cfgRes.json()) as { chainId?: number; base?: string })
          : {};
        const cid = (cfg.chainId === 97 ? 97 : 56) as PredictFunChainId;
        const base = String(cfg.base ?? "mainnet");
        if (cancelled) return;
        setChainId(cid);
        setApiBase(base);

        const predictAccount = readPredictFunPredictAccount(cid, walletAddress);
        const authSigner = predictAccount ?? walletAddress;
        const cached = readPredictFunJwt(cid, authSigner, base);
        if (cached && !cancelled) {
          setJwt(cached);
          let trading = predictAccount ?? walletAddress;
          if (!predictAccount) {
            try {
              const accRes = await fetch("/api/predictfun/account", {
                cache: "no-store",
                headers: { Authorization: `Bearer ${cached}` },
              });
              if (accRes.ok) {
                const json = (await accRes.json()) as { data?: { address?: string } };
                const addr = String(json?.data?.address ?? "").trim();
                if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
                  writePredictFunPredictAccount(cid, walletAddress, addr);
                  trading = addr;
                }
              }
            } catch {
              /* use EOA */
            }
          }
          setTradingAddress(trading);
        }

        if (!signer) return;

        setIsLoading(true);
        const auth = await authenticatePredictFun(signer);
        if (!cancelled) {
          setJwt(auth.jwt);
          setTradingAddress(auth.tradingAddress);
          setChainId(auth.chainId);
          setApiBase(auth.apiBase);
        }
      } catch {
        if (!cancelled) setJwt(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, walletAddress, signer]);

  return {
    jwt,
    tradingAddress,
    chainId,
    apiBase,
    isLoading,
    refresh: async () => {
      if (!signer) return null;
      const auth = await authenticatePredictFun(signer, { forceRefresh: true });
      setJwt(auth.jwt);
      setTradingAddress(auth.tradingAddress);
      return auth;
    },
  };
}
