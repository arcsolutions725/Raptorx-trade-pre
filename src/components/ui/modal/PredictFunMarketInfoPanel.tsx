"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { providers } from "ethers";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { providers as ProvidersType } from "ethers";
import {
  buildPredictFunPositionRows,
  buildPredictFunUnifiedTradeRows,
} from "@/lib/predictfun/parsePredictFunModalApi";
import {
  usePredictFunOrderMatches,
  usePredictFunOrdersHistory,
} from "@/hooks/usePredictFunOpenOrdersModal";
import { usePredictFunPositions } from "@/hooks/usePredictFunPositions";
import { usePredictFunPositionsMarketMeta } from "@/hooks/usePredictFunPositionsMarketMeta";
import { usePredictFunAuthJwt } from "@/hooks/usePredictFunAuthJwt";
import { usePredictFunRedeem } from "@/hooks/usePredictFunRedeem";
import type { PredictFunModalPositionRow } from "@/lib/predictfun/parsePredictFunModalApi";
import { predictFunPositionsAddressCandidates } from "@/lib/predictfun/positionsAddress";
import {
  showErrorNotification,
  showSuccessNotification,
} from "@/components/ui/notification";
import {
  appendPredictFunRedeemHistory,
  buildPredictFunRedeemLockKey,
  readPredictFunRedeemHistory,
  redeemHistoryToTradeRows,
} from "@/lib/predictfun/predictFunRedeemHistory";

type PredictFunMarketInfoPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "trades" | "positions";
  setActiveTab: (tab: "trades" | "positions") => void;
  eoaAddress: string | undefined;
  signer: ProvidersType.JsonRpcSigner | null;
};

const ACCENT = "#A855F7";
const REDEEM_LOCK_TTL_MS = 5 * 60 * 1000;

export default function PredictFunMarketInfoPanel({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  eoaAddress,
  signer,
}: PredictFunMarketInfoPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [redeemedKeys, setRedeemedKeys] = useState<Set<string>>(new Set());
  const { redeem, isRedeeming } = usePredictFunRedeem();

  const panelEnabled = isOpen && !!eoaAddress;

  const { authenticated, user: privyUser } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [fallbackSigner, setFallbackSigner] =
    useState<ProvidersType.JsonRpcSigner | null>(null);

  const privyEvmAddress =
    authenticated && privyUser?.wallet?.address
      ? (privyUser.wallet.address as `0x${string}`)
      : undefined;
  const wallet =
    (privyEvmAddress
      ? wallets.find(
          (w) => (w.address ?? "").toLowerCase() === privyEvmAddress.toLowerCase()
        )
      : null) ??
    (walletsReady && wallets.length > 0 ? wallets[0] : null);

  useEffect(() => {
    let cancelled = false;
    async function initFallback() {
      if (!panelEnabled || !wallet || !authenticated || !walletsReady) {
        if (!cancelled) setFallbackSigner(null);
        return;
      }
      if (signer) {
        if (!cancelled) setFallbackSigner(null);
        return;
      }
      try {
        const provider = await wallet.getEthereumProvider();
        const ethersProvider = new providers.Web3Provider(
          provider as providers.ExternalProvider,
          "any"
        );
        const s = ethersProvider.getSigner();
        await s.getAddress();
        if (!cancelled) setFallbackSigner(s);
      } catch {
        if (!cancelled) setFallbackSigner(null);
      }
    }
    void initFallback();
    return () => {
      cancelled = true;
    };
  }, [panelEnabled, wallet, authenticated, walletsReady, signer]);

  const effectiveSigner = signer ?? fallbackSigner;

  const {
    jwt,
    tradingAddress,
    chainId,
    isLoading: jwtLoading,
    refresh: refreshPredictAuth,
  } = usePredictFunAuthJwt(effectiveSigner, eoaAddress, panelEnabled);
  const activityAddress = tradingAddress ?? eoaAddress ?? null;

  const buildRedeemKey = useCallback((row: PredictFunModalPositionRow): string => {
    if (!row.redeemParams) return row.key;
    return buildPredictFunRedeemLockKey(row.redeemParams);
  }, []);

  const redeemLockStorageKey = useMemo(
    () =>
      eoaAddress
        ? `predictfun_redeem_locks:${eoaAddress.toLowerCase()}:${chainId}`
        : null,
    [eoaAddress, chainId]
  );

  const loadRedeemLocks = useCallback((): Set<string> => {
    if (!redeemLockStorageKey || typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(redeemLockStorageKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as Record<string, number>;
      const now = Date.now();
      const activeKeys = Object.entries(parsed)
        .filter(([, expiresAt]) => Number.isFinite(expiresAt) && expiresAt > now)
        .map(([k]) => k);
      return new Set(activeKeys);
    } catch {
      return new Set();
    }
  }, [redeemLockStorageKey]);

  const persistRedeemLocks = useCallback(
    (keys: Set<string>) => {
      if (!redeemLockStorageKey || typeof window === "undefined") return;
      const now = Date.now();
      const obj: Record<string, number> = {};
      keys.forEach((k) => {
        obj[k] = now + REDEEM_LOCK_TTL_MS;
      });
      localStorage.setItem(redeemLockStorageKey, JSON.stringify(obj));
    },
    [redeemLockStorageKey]
  );

  const predictFunAuth = useCallback(async () => {
    if (!eoaAddress || !effectiveSigner) {
      showErrorNotification("Connect wallet", "Connect your EVM wallet to sign in.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await refreshPredictAuth();
      showSuccessNotification("Signed in", "Predict.fun session ready.");
      void queryClient.invalidateQueries({ queryKey: ["predictfun-orders-history"] });
      void queryClient.invalidateQueries({ queryKey: ["predictfun-order-matches"] });
      void queryClient.invalidateQueries({ queryKey: ["predictfun-positions"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAuthError(msg);
      showErrorNotification("Predict.fun sign-in failed", msg);
    } finally {
      setAuthLoading(false);
    }
  }, [eoaAddress, effectiveSigner, refreshPredictAuth, queryClient]);

  const {
    data: ordersBody,
    isLoading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = usePredictFunOrdersHistory(jwt, activityAddress, panelEnabled && !!jwt);

  const {
    data: matchesBody,
    isLoading: matchesLoading,
    error: matchesError,
    refetch: refetchMatches,
  } = usePredictFunOrderMatches(jwt, activityAddress, panelEnabled);

  const positionAddressCandidates = useMemo(() => {
    if (!eoaAddress) return [];
    return predictFunPositionsAddressCandidates(eoaAddress, chainId, tradingAddress);
  }, [eoaAddress, chainId, tradingAddress]);

  const primaryPositionsAddress = positionAddressCandidates[0] ?? null;
  const extraPositionAddresses = positionAddressCandidates.slice(1);

  const {
    positions,
    isLoading: positionsLoading,
    error: positionsError,
    refetch: refetchPositions,
  } = usePredictFunPositions(
    primaryPositionsAddress,
    panelEnabled,
    jwt,
    extraPositionAddresses,
    {
      walletAddress: eoaAddress,
      chainId,
      tradingAddress,
    }
  );

  const { marketById: positionMarketMeta, isLoading: positionMarketMetaLoading } =
    usePredictFunPositionsMarketMeta(positions, panelEnabled && !!positions);

  useEffect(() => {
    if (!panelEnabled) return;
    void refetchMatches();
    void refetchPositions();
    if (jwt) void refetchOrders();
  }, [panelEnabled, jwt, activeTab, refetchOrders, refetchMatches, refetchPositions]);

  const redeemHistoryRows = useMemo(() => {
    if (!eoaAddress) return [];
    return redeemHistoryToTradeRows(readPredictFunRedeemHistory(eoaAddress, chainId));
  }, [eoaAddress, chainId, redeemedKeys.size]);

  const tradeRows = useMemo(() => {
    if (!activityAddress) return redeemHistoryRows;
    return buildPredictFunUnifiedTradeRows(
      ordersBody,
      matchesBody,
      activityAddress,
      redeemHistoryRows
    );
  }, [ordersBody, matchesBody, activityAddress, redeemHistoryRows]);

  const positionRows = useMemo(() => {
    if (!eoaAddress || !positions) return [];
    return buildPredictFunPositionRows(
      positions,
      eoaAddress,
      positions?.data?.usdtBalanceWei ?? null,
      positionAddressCandidates,
      {
        skipOwnerFilter: true,
        hideRedeemKeys: redeemedKeys,
        marketMetaById: positionMarketMeta,
      }
    );
  }, [positions, eoaAddress, positionAddressCandidates, redeemedKeys, positionMarketMeta]);

  useEffect(() => {
    setRedeemedKeys(loadRedeemLocks());
  }, [loadRedeemLocks]);

  useEffect(() => {
    if (redeemedKeys.size === 0) return;
    const liveKeys = new Set(
      positionRows
        .filter((r) => !!r.redeemParams && r.redeemEligible)
        .map((r) => buildRedeemKey(r))
    );
    setRedeemedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (liveKeys.has(k)) next.add(k);
        else changed = true;
      }
      if (changed) persistRedeemLocks(next);
      return changed ? next : prev;
    });
  }, [positionRows, redeemedKeys.size, buildRedeemKey, persistRedeemLocks]);

  const tradesLoading =
    matchesLoading || (!!jwt && ordersLoading);
  const tradesError = matchesError ?? (jwt ? ordersError : null);

  const handleRedeemPosition = useCallback(
    async (row: PredictFunModalPositionRow) => {
      if (!row.redeemParams || !eoaAddress) return;
      if (!effectiveSigner) {
        showErrorNotification("Connect wallet", "Connect your EVM wallet to redeem.");
        return;
      }
      try {
        const txHash = await redeem({
          rowKey: row.key,
          signer: effectiveSigner,
          walletAddress: eoaAddress,
          chainId,
          params: row.redeemParams,
          wallet: wallet ?? undefined,
        });
        showSuccessNotification(
          "Redeemed",
          txHash
            ? `Position redeemed. Tx: ${txHash.slice(0, 10)}…`
            : "Position redeemed successfully."
        );
        const redeemKey = buildRedeemKey(row);
        appendPredictFunRedeemHistory(eoaAddress, chainId, {
          key: redeemKey,
          marketId: row.marketId,
          marketTitle: row.marketTitle,
          slugForLink: row.slugForLink,
          outcome: row.outcome,
          shares: row.shares,
          txHash,
          redeemedAt: Date.now(),
        });
        setRedeemedKeys((prev) => {
          const next = new Set(prev);
          next.add(redeemKey);
          persistRedeemLocks(next);
          return next;
        });
        setActiveTab("trades");
        void queryClient.invalidateQueries({ queryKey: ["predictfun-positions"] });
        void queryClient.invalidateQueries({ queryKey: ["predictfun-orders-history"] });
        void queryClient.invalidateQueries({ queryKey: ["predictfun-order-matches"] });
        void refetchPositions();
        void refetchOrders();
        void refetchMatches();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const friendly = /result.*not received|not resolved/i.test(msg)
          ? "Market is not resolved on-chain yet. Try again after settlement."
          : msg;
        showErrorNotification("Redeem failed", friendly);
      }
    },
    [
      eoaAddress,
      effectiveSigner,
      chainId,
      redeem,
      wallet,
      queryClient,
      refetchPositions,
      refetchOrders,
      refetchMatches,
      buildRedeemKey,
    ]
  );

  const signInBlock = (
    <div className="text-center py-12 space-y-4">
      <p className="text-gray-400">
        Sign in to Predict.fun to view orders and trade history (BNB Chain).
      </p>
      {!eoaAddress ? (
        <p className="text-sm text-amber-400">Connect your wallet first.</p>
      ) : !effectiveSigner ? (
        <p className="text-sm text-amber-400">Wallet signer loading…</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void predictFunAuth()}
            disabled={authLoading}
            className="px-6 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {authLoading ? "Signing in…" : "Sign in to Predict.fun"}
          </button>
          {authError && <p className="text-sm text-red-400">{authError}</p>}
        </>
      )}
    </div>
  );

  return (
    <>
      <div className="flex border-b border-white/10 sticky top-[73px] bg-[#0D0D0D] z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-0">
        <button
          type="button"
          onClick={() => setActiveTab("trades")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "trades"
              ? "border-[#A855F7] text-[#A855F7]"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Trades
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("positions")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "positions"
              ? "border-[#A855F7] text-[#A855F7]"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Positions
        </button>
      </div>

      {activeTab === "trades" && (
        <>
          {!eoaAddress ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Connect your wallet to view Predict.fun activity.</p>
            </div>
          ) : tradesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2"
                style={{ borderColor: ACCENT }}
              />
            </div>
          ) : tradesError ? (
            <div className="text-center py-8">
              <p className="text-red-400">
                {tradesError instanceof Error
                  ? tradesError.message
                  : "Failed to load Predict.fun trades."}
              </p>
            </div>
          ) : tradeRows.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <p className="text-gray-400 text-lg">No trades found.</p>
              {!jwt && (
                <>
                  <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Sign in to also load your open orders from{" "}
                    <span className="text-white/70">GET /orders</span>.
                  </p>
                  {signInBlock}
                </>
              )}
            </div>
          ) : (
            <>
              {!jwt && (
                <p className="text-gray-500 text-xs text-center mb-3 px-4">
                  Showing fills for your wallet. Sign in to include open orders.
                </p>
              )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Market
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Side
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Price
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Size
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Role
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Status
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tradeRows.map((row) => {
                    const sideClass =
                      row.sideTone === "buy"
                        ? "bg-green-500/20 text-green-400"
                        : row.sideTone === "sell"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-white/10 text-white/90";
                    const statusClass =
                      row.statusStyle === "confirmed"
                        ? "bg-green-500/20 text-green-400"
                        : row.statusStyle === "open"
                          ? "bg-blue-500/20 text-blue-300"
                          : row.statusStyle === "cancelled"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-gray-500/20 text-gray-400";

                    return (
                      <tr
                        key={row.key}
                        className="border-b border-white/5 hover:bg-white/5"
                      >
                        <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                          {row.slugForLink ? (
                            <a
                              href={`/rexmarkets/predict-fun/${encodeURIComponent(row.slugForLink)}`}
                              onClick={(e) => {
                                e.preventDefault();
                                onClose();
                                router.push(
                                  `/rexmarkets/predict-fun/${encodeURIComponent(row.slugForLink)}`
                                );
                              }}
                              className="max-w-[200px] truncate block hover:text-[#A855F7] underline decoration-dotted"
                              title={row.marketTitle}
                            >
                              {row.marketTitle}
                            </a>
                          ) : (
                            row.marketTitle
                          )}
                        </td>
                        <td className="py-3 px-2 sm:px-4">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium ${sideClass}`}
                          >
                            {row.sideLabel}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm tabular-nums">
                          {row.priceDisplay}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm tabular-nums">
                          {row.sizeDisplay}
                        </td>
                        <td className="py-3 px-2 sm:px-4">
                          {row.role === "—" ? (
                            <span className="text-gray-500 text-xs">—</span>
                          ) : (
                            <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                              {row.role}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 sm:px-4">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusClass}`}
                          >
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-gray-400 text-xs whitespace-nowrap">
                          {row.timeStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}

      {activeTab === "positions" && (
        <>
          {!eoaAddress ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Connect your wallet to view Predict.fun positions.</p>
            </div>
          ) : jwtLoading || positionsLoading || positionMarketMetaLoading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2"
                style={{ borderColor: ACCENT }}
              />
            </div>
          ) : positionsError ? (
            <div className="text-center py-8">
              <p className="text-red-400">
                {positionsError instanceof Error
                  ? positionsError.message
                  : "Failed to load positions."}
              </p>
            </div>
          ) : positionRows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">No positions found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Market
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Outcome
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Size
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {positionRows.map((row) => (
                    <tr key={row.key} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                        {row.slugForLink ? (
                          <a
                            href={`/rexmarkets/predict-fun/${encodeURIComponent(row.slugForLink)}`}
                            onClick={(e) => {
                              e.preventDefault();
                              onClose();
                              router.push(
                                `/rexmarkets/predict-fun/${encodeURIComponent(row.slugForLink)}`
                              );
                            }}
                            className="max-w-[200px] truncate block hover:text-[#A855F7] underline decoration-dotted"
                            title={row.marketTitle}
                          >
                            {row.marketTitle}
                          </a>
                        ) : (
                          row.marketTitle
                        )}
                      </td>
                      <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm">
                        {row.outcome}
                      </td>
                      <td className="py-3 px-2 sm:px-4 text-white text-xs sm:text-sm tabular-nums">
                        {row.key === "usdt-collateral"
                          ? `${row.sharesDisplay} USDT`
                          : row.sharesDisplay}
                      </td>
                      <td className="py-3 px-2 sm:px-4">
                        {row.key === "usdt-collateral" || !row.redeemParams ? (
                          <span className="text-gray-500 text-xs">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleRedeemPosition(row)}
                            data-redeem-state={
                              isRedeeming(row.key)
                                ? "redeeming"
                                : redeemedKeys.has(buildRedeemKey(row))
                                  ? "redeemed"
                                  : "idle"
                            }
                            disabled={
                              isRedeeming(row.key) ||
                              redeemedKeys.has(buildRedeemKey(row)) ||
                              !row.redeemEligible ||
                              !effectiveSigner
                            }
                            title={
                              !effectiveSigner
                                ? "Connect wallet to redeem"
                                : redeemedKeys.has(buildRedeemKey(row))
                                  ? "Redeem submitted. Waiting for positions to sync."
                                : row.redeemEligible
                                  ? "Redeem winning shares for USDT (on-chain via Predict.fun SDK)"
                                  : "Redeem is available after the market resolves"
                            }
                            className={`min-w-[72px] px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              isRedeeming(row.key)
                                ? "bg-[#A855F7]/70 cursor-wait text-white"
                                : row.redeemEligible && effectiveSigner
                                  ? "bg-[#A855F7] hover:bg-[#9333EA] text-white"
                                  : "bg-white/10 text-gray-500 cursor-not-allowed"
                            }`}
                          >
                            {isRedeeming(row.key) ? (
                              <span className="flex items-center justify-center">
                                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              </span>
                            ) : redeemedKeys.has(buildRedeemKey(row)) ? (
                              "Redeemed"
                            ) : (
                              "Redeem"
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
