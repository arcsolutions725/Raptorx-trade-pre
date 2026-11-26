"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import type {
  PortfolioHistoryResponse,
  PortfolioRange,
  PortfolioResponse,
} from "@/lib/portfolio/types";
import { shortAddr } from "./portfolioMath";

export type PfUser = {
  id: string;
  username: string;
  points: number;
  referralCode?: string | null;
  ethereumWallet?: string | null;
};

/** The signed-in RaptorX user (same lookup the other pages do: POST /api/user). */
export function usePortfolioUser() {
  const { authenticated: privyAuth, ready, user: privyUser } = usePrivy();
  const { isAuthenticated: phantomAuth, user: phantomUser } = usePhantomConnect();
  const authenticated = privyAuth || phantomAuth;
  const [user, setUser] = useState<PfUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!ready && !phantomAuth) return;
      const authId = privyUser?.id || phantomUser?.id;
      if (!authenticated || !authId) {
        setUser(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let email: string | undefined;
        if (phantomUser?.email) email = phantomUser.email;
        else if (privyUser) {
          const e = (privyUser as { email?: { address?: string } | string }).email;
          email = (typeof e === "object" && e?.address) || (typeof e === "string" && e) || undefined;
        }
        const res = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(privyUser?.id ? { privyId: privyUser.id } : { phantomId: phantomUser!.id }),
            email,
          }),
        });
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setUser((data?.user as PfUser) ?? null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, privyUser, phantomUser, phantomAuth]);

  return { authenticated, ready: ready || phantomAuth, user, loading };
}

export type PfWallet = {
  /** lowercase */
  address: string;
  label: string;
  logo: string;
  short: string;
};

type LinkedWallet = { type?: string; address?: string; chainType?: string; walletClientType?: string };

const WALLET_BRANDS: Record<string, [string, string]> = {
  privy: ["RaptorX Base wallet", "base"],
  metamask: ["MetaMask", "metamask"],
  rabby_wallet: ["Rabby", "rabby"],
  coinbase_wallet: ["Coinbase Wallet", "coinbase"],
  coinbase_smart_wallet: ["Coinbase Wallet", "coinbase"],
  phantom: ["Phantom", "phantom"],
  wallet_connect: ["WalletConnect", "walletconnect"],
  wallet_connect_v2: ["WalletConnect", "walletconnect"],
};

/** EVM wallets of the user: the RaptorX (Privy embedded) Base wallet first, then linked wallets. */
export function usePortfolioWallets(user: PfUser | null): PfWallet[] {
  const { user: privyUser, authenticated: privyAuth } = usePrivy();
  const { isAuthenticated: phantomAuth, user: phantomUser } = usePhantomConnect();
  return useMemo(() => {
    const out: PfWallet[] = [];
    const add = (address: string | null | undefined, brand: [string, string]) => {
      const a = (address || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(a) || out.some((w) => w.address === a)) return;
      out.push({ address: a, label: brand[0], logo: `/images/brands/${brand[1]}.webp`, short: shortAddr(a) });
    };
    const linked = privyAuth
      ? (((privyUser as { linkedAccounts?: LinkedWallet[] } | null)?.linkedAccounts ?? []).filter(
          (w) => w.type === "wallet" && w.chainType === "ethereum" && w.address,
        ) as LinkedWallet[])
      : [];
    const embedded = linked.filter((w) => w.walletClientType === "privy");
    embedded.forEach((w) => add(w.address, WALLET_BRANDS.privy));
    // the wallet saved on the account is the RaptorX Base wallet (Profile → Base wallet)
    add(user?.ethereumWallet, WALLET_BRANDS.privy);
    linked
      .filter((w) => w.walletClientType !== "privy")
      .forEach((w) => add(w.address, WALLET_BRANDS[w.walletClientType ?? ""] ?? ["Wallet", "base"]));
    if (phantomAuth) add(phantomUser?.ethereumWallet, WALLET_BRANDS.phantom);
    return out;
  }, [privyUser, privyAuth, phantomAuth, phantomUser, user?.ethereumWallet]);
}

export function usePortfolio(wallets: PfWallet[], userId: string | null) {
  const list = wallets.map((w) => w.address).sort().join(",");
  return useQuery({
    queryKey: ["portfolio", list, userId],
    enabled: list.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PortfolioResponse> => {
      const res = await fetch(`/api/portfolio?wallets=${list}`, {
        headers: userId ? { "x-user-id": userId } : undefined,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`portfolio ${res.status}`);
      return res.json();
    },
  });
}

export function usePortfolioHistory(pools: string[], range: PortfolioRange, enabled = true) {
  const key = pools.join(",");
  return useQuery({
    queryKey: ["portfolio-history", range, key],
    enabled: enabled && pools.length > 0,
    staleTime: range === "24H" ? 120_000 : 600_000,
    queryFn: async (): Promise<PortfolioHistoryResponse> => {
      const res = await fetch(`/api/portfolio/history?range=${range}&pools=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`history ${res.status}`);
      return res.json();
    },
  });
}
