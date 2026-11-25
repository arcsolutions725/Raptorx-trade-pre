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
import clsx from "clsx";
import {
  BusyLabel,
  MarketName,
  OrdersLoading,
  OrdersState,
  RecordTable,
  SideTag,
  StatusBadge,
  type Tone,
} from "@/components/ui/modal/ordersUi";

type PredictFunMarketInfoPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "trades" | "positions";
  setActiveTab: (tab: "trades" | "positions") => void;
  eoaAddress: string | undefined;
  signer: ProvidersType.JsonRpcSigner | null;
};

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

  const signInActions =
    eoaAddress && effectiveSigner ? (
      <>
        <button
          type="button"
          onClick={() => void predictFunAuth()}
          disabled={authLoading}
          aria-busy={authLoading || undefined}
          className="rx-btn rx-btn--primary"
        >
          <BusyLabel busy={authLoading} busyText="Signing in…">
            Sign in to Predict.fun
          </BusyLabel>
        </button>
        {authError && <p className="rx-help rx-help--error">{authError}</p>}
      </>
    ) : null;

  const signInHint = !eoaAddress ? (
    <p className="text-rx-gold-hi">Connect your wallet first.</p>
  ) : !effectiveSigner ? (
    <p className="text-rx-gold-hi">Wallet signer loading…</p>
  ) : null;

  const openMarket = (slug: string) => {
    const href = `/rexmarkets/predict-fun/${encodeURIComponent(slug)}`;
    onClose();
    router.push(href);
  };

  const marketName = (title: string, slug: string | null | undefined) => (
    <MarketName
      title={title}
      venue="predictfun"
      href={slug ? `/rexmarkets/predict-fun/${encodeURIComponent(slug)}` : undefined}
      onNavigate={slug ? () => openMarket(slug) : undefined}
    />
  );

  /* View tabs (Positions / Trade history) live in the dialog's bar (MarketInfoModal). */
  return (
    <>
      {activeTab === "trades" &&
        (!eoaAddress ? (
          <OrdersState icon="wallet" title="Connect your wallet">
            <p>Connect your wallet to view Predict.fun activity.</p>
          </OrdersState>
        ) : tradesLoading ? (
          <OrdersLoading label="Loading Predict.fun trades" />
        ) : tradesError ? (
          <OrdersState icon="error" title="Couldn't load this list">
            <p className="rx-help rx-help--error">
              {tradesError instanceof Error
                ? tradesError.message
                : "Failed to load Predict.fun trades."}
            </p>
          </OrdersState>
        ) : tradeRows.length === 0 ? (
          <OrdersState
            icon="trades"
            title="No trades found"
            actions={!jwt ? signInActions : null}
          >
            {!jwt ? (
              <>
                <p>
                  Sign in to Predict.fun to view orders and trade history (BNB
                  Chain). Signing in also loads your open orders from GET
                  /orders.
                </p>
                {signInHint}
              </>
            ) : (
              <p>Orders you fill on this venue show here, newest first.</p>
            )}
          </OrdersState>
        ) : (
          <>
            {!jwt && (
              <p className="o-note m-0 text-center">
                Showing fills for your wallet. Sign in to include open orders.
              </p>
            )}
            <RecordTable
              label="Predict.fun trades"
              columns={[
                { key: "side", label: "Side" },
                { key: "price", label: "Price", num: true },
                { key: "size", label: "Size", num: true },
                { key: "role", label: "Role" },
                { key: "status", label: "Status", card: false },
                { key: "time", label: "Time", muted: true, card: "wide" },
              ]}
              rows={tradeRows.map((row) => {
                const sideTone: Tone =
                  row.sideTone === "buy"
                    ? "up"
                    : row.sideTone === "sell"
                      ? "down"
                      : "neutral";
                const statusTone: Tone =
                  row.statusStyle === "confirmed"
                    ? "up"
                    : row.statusStyle === "open"
                      ? "gold"
                      : row.statusStyle === "cancelled"
                        ? "down"
                        : "neutral";
                const status = (
                  <StatusBadge tone={statusTone}>{row.statusLabel}</StatusBadge>
                );
                return {
                  key: row.key,
                  market: marketName(row.marketTitle, row.slugForLink),
                  tag: status,
                  cells: {
                    side: <SideTag tone={sideTone}>{row.sideLabel}</SideTag>,
                    price: row.priceDisplay,
                    size: row.sizeDisplay,
                    role:
                      row.role === "—" ? (
                        "—"
                      ) : (
                        <StatusBadge tone="neutral">{row.role}</StatusBadge>
                      ),
                    status,
                    time: row.timeStr,
                  },
                };
              })}
            />
          </>
        ))}

      {activeTab === "positions" &&
        (!eoaAddress ? (
          <OrdersState icon="wallet" title="Connect your wallet">
            <p>Connect your wallet to view Predict.fun positions.</p>
          </OrdersState>
        ) : jwtLoading || positionsLoading || positionMarketMetaLoading ? (
          <OrdersLoading label="Loading Predict.fun positions" />
        ) : positionsError ? (
          <OrdersState icon="error" title="Couldn't load this list">
            <p className="rx-help rx-help--error">
              {positionsError instanceof Error
                ? positionsError.message
                : "Failed to load positions."}
            </p>
          </OrdersState>
        ) : positionRows.length === 0 ? (
          <OrdersState icon="positions" title="No positions found">
            <p>Buy Yes or No on any market and your shares appear here.</p>
          </OrdersState>
        ) : (
          <RecordTable
            label="Predict.fun positions"
            actionLabel="Actions"
            columns={[
              { key: "outcome", label: "Outcome", card: false },
              { key: "size", label: "Size", num: true, card: "full" },
            ]}
            rows={positionRows.map((row) => {
              const redeemKey = buildRedeemKey(row);
              const redeeming = isRedeeming(row.key);
              const redeemed = redeemedKeys.has(redeemKey);
              const o = (row.outcome ?? "").toString().trim().toLowerCase();
              const outcome = (
                <SideTag tone={o === "yes" ? "up" : o === "no" ? "down" : "neutral"}>
                  {row.outcome}
                </SideTag>
              );
              return {
                key: row.key,
                market: marketName(row.marketTitle, row.slugForLink),
                tag: outcome,
                cells: {
                  outcome,
                  size:
                    row.key === "usdt-collateral"
                      ? `${row.sharesDisplay} USDT`
                      : row.sharesDisplay,
                },
                action:
                  row.key === "usdt-collateral" || !row.redeemParams ? undefined : (
                    <button
                      type="button"
                      onClick={() => void handleRedeemPosition(row)}
                      data-redeem-state={
                        redeeming ? "redeeming" : redeemed ? "redeemed" : "idle"
                      }
                      disabled={
                        redeeming ||
                        redeemed ||
                        !row.redeemEligible ||
                        !effectiveSigner
                      }
                      aria-busy={redeeming || undefined}
                      title={
                        !effectiveSigner
                          ? "Connect wallet to redeem"
                          : redeemed
                            ? "Redeem submitted. Waiting for positions to sync."
                            : row.redeemEligible
                              ? "Redeem winning shares for USDT (on-chain via Predict.fun SDK)"
                              : "Redeem is available after the market resolves"
                      }
                      className={clsx(
                        "rx-btn rx-btn--s",
                        redeemed
                          ? "o-btn-ok"
                          : row.redeemEligible && effectiveSigner
                            ? "rx-btn--primary"
                            : "rx-btn--secondary",
                      )}
                    >
                      <BusyLabel busy={redeeming} busyText="Redeeming…">
                        {redeemed ? "Redeemed" : "Redeem"}
                      </BusyLabel>
                    </button>
                  ),
              };
            })}
          />
        ))}
    </>
  );
}
