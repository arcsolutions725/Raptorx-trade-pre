"use client";

import { useState, useCallback, useEffect } from "react";
import type { providers } from "ethers";

const AUTH_STORAGE_KEY = "limitless_auth";

type LimitlessUser = {
  id: string;
  account: string;
  rank?: { feeRateBps?: number };
  /** Session cookie for portfolio API (from login response). */
  sessionCookie?: string | null;
  [key: string]: unknown;
};

function getStored(): LimitlessUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LimitlessUser;
    if (parsed?.id != null && parsed?.account) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function setStored(user: LimitlessUser | null) {
  if (typeof window === "undefined") return;
  if (user) {
    const toStore = { ...user };
    if (toStore.sessionCookie) toStore.sessionCookie = toStore.sessionCookie;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(toStore));
  } else localStorage.removeItem(AUTH_STORAGE_KEY);
}

function normalizeAddress(addr: string) {
  return (addr || "").toLowerCase().trim();
}

/**
 * Limitless auth: get signing message, sign with wallet, login to get ownerId.
 * Uses stored session when available. Clears session when wallet changes so
 * "Profile ID does not match the order owner" cannot occur.
 */
export function useLimitlessAuth(ethersSigner: providers.JsonRpcSigner | null) {
  const [ownerId, setOwnerId] = useState<string | null>(() => {
    const u = getStored();
    return u?.id != null ? String(u.id) : null;
  });
  const [user, setUser] = useState<LimitlessUser | null>(getStored);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Restore stored session when wallet connects; clear only when wallet changes to a different account
  useEffect(() => {
    if (!ethersSigner) {
      setUser(null);
      setOwnerId(null);
      // Do NOT clear localStorage here: on refresh ethersSigner is null briefly, so we preserve
      // session and restore once wallet reconnects (same account can trade without signing again).
      return;
    }
    let cancelled = false;
    ethersSigner.getAddress().then((address) => {
      if (cancelled) return;
      const current = normalizeAddress(address);
      const stored = getStored();
      if (!stored) return;
      if (normalizeAddress(stored.account) !== current) {
        setUser(null);
        setOwnerId(null);
        setStored(null);
      } else {
        // Same account: restore from storage so session persists after refresh
        setUser(stored);
        setOwnerId(stored.id != null ? String(stored.id) : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ethersSigner]);

  const login = useCallback(async () => {
    if (!ethersSigner) {
      setError(new Error("Wallet not connected"));
      return null;
    }
    setIsLoading(true);
    setError(null);
    try {
      const msgRes = await fetch("/api/limitless/auth/signing-message", {
        method: "GET",
        cache: "no-store",
      });
      if (!msgRes.ok) throw new Error("Failed to get signing message");
      const signingMessage = await msgRes.text();
      const signingMessageHex =
        "0x" +
        Array.from(new TextEncoder().encode(signingMessage))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      const address = await ethersSigner.getAddress();
      const signature = await ethersSigner.signMessage(signingMessage);

      const loginRes = await fetch("/api/limitless/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          signingMessageHex,
          signature,
        }),
      });
      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}));
        throw new Error(err?.error || `Login failed ${loginRes.status}`);
      }
      const data = (await loginRes.json()) as LimitlessUser;
      if (!data?.id || !data?.account) throw new Error("Invalid login response");
      setUser(data);
      const idStr = String(data.id);
      setOwnerId(idStr);
      setStored(data);
      return data;
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Limitless login failed");
      setError(err);
      setUser(null);
      setOwnerId(null);
      setStored(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [ethersSigner]);

  const logout = useCallback(() => {
    setUser(null);
    setOwnerId(null);
    setStored(null);
    setError(null);
  }, []);

  // Use stored auth when this instance's state is stale (e.g. user logged in elsewhere, e.g. widget;
  // this instance e.g. in Open Orders modal was mounted before login and still has user=null).
  const stored = typeof window !== "undefined" ? getStored() : null;
  const effectiveUser = user ?? stored;
  const effectiveOwnerId = effectiveUser?.id != null ? String(effectiveUser.id) : ownerId;

  return { ownerId: effectiveOwnerId, user: effectiveUser, login, logout, isLoading, error };
}
