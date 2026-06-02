"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Image from "next/image";
import { formatPrice } from "@/utils/polymarketTrading";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { utils, BigNumber, providers } from "ethers";
import LoginModal from "@/components/ui/modal/LoginModal";
import DepositWithdrawModal from "@/components/ui/modal/DepositWithdrawModal";
import {
  showErrorNotification,
  showSuccessNotification,
  showInfoNotification,
} from "@/components/ui/notification/index";
import { useWallet } from "@/contexts/WalletContext";
import { useMyriadBscBalances } from "@/hooks/useMyriadBscBalances";
import { usePredictFunPositions } from "@/hooks/usePredictFunPositions";
import { usePredictFunAuthJwt } from "@/hooks/usePredictFunAuthJwt";
import { usePredictFunOrderBook } from "@/hooks/usePredictFunOrderBook";
import { resolvePredictFunSellableShares } from "@/lib/predictfun/resolvePredictFunSellShares";
import { findPredictFunMarketPosition } from "@/lib/predictfun/resolvePredictFunMarketPosition";
import {
  isPredictFunMarketResolved,
  isPredictFunMarketTradable,
} from "@/lib/predictfun/predictFunMarketLifecycle";
import { usePredictFunRedeem } from "@/hooks/usePredictFunRedeem";
import {
  appendPredictFunRedeemHistory,
  buildPredictFunRedeemLockKey,
  readPredictFunRedeemLocks,
  writePredictFunRedeemLock,
} from "@/lib/predictfun/predictFunRedeemHistory";
import { predictFunPositionsAddressCandidates } from "@/lib/predictfun/positionsAddress";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { PredictFunApiMarket, PredictFunOutcome } from "@/lib/predictfun/mapPredictFunMarketRow";
import {
  buildPredictFunLimitOrder,
  buildPredictFunTypedData,
  hashPredictFunTypedData,
  predictFunExchangeAddress,
  type PredictFunChainId,
} from "@/lib/predictfun/orderEip712";
import { resolvePredictFunTradePrice01 } from "@/lib/predictfun/predictFunOutcomePrices";
import {
  buildPredictFunLimitOrderAmounts,
  PREDICT_FUN_MIN_ORDER_USD,
} from "@/lib/predictfun/predictFunLimitOrderAmounts";
import { ensurePredictFunTradeApprovals } from "@/lib/predictfun/predictFunApprovals";

type OutcomeOpt = { index: number; title: string; price: number };

type SubMarketOption = {
  id: string;
  title: string;
  chance?: number;
  imageUrl?: string;
};

type PredictFunBuySellWidgetProps = {
  marketId: string;
  marketRaw?: PredictFunApiMarket | null;
  outcomeOptions: OutcomeOpt[];
  selectedOutcomeIndex: number;
  onOutcomeIndexChange?: (idx: number) => void;
  marketTitle?: string;
  categorySlug?: string | null;
  relatedMarketIds?: string[];
  symbolImageUrl?: string;
  subMarketOptions?: SubMarketOption[];
  selectedSubMarketId?: string | null;
  onSubMarketIdChange?: (id: string) => void;
};

import { authenticatePredictFun } from "@/lib/predictfun/predictFunClientAuth";
import { parsePredictFunApiErrorText } from "@/lib/predictfun/parsePredictFunApiError";
import {
  isPredictFunPredictAccount,
  signPredictFunAccountOrderHash,
} from "@/lib/predictfun/predictAccountSigning";

function parseUsdInput(s: string): number {
  const t = (s ?? "").trim();
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function getOutcomeRawForSelected(
  marketRaw: PredictFunApiMarket | null | undefined,
  selectedOutcomeIndex: number
): PredictFunOutcome | null {
  const outs = Array.isArray(marketRaw?.outcomes) ? marketRaw!.outcomes! : [];
  const match = outs.find((o) => Number(o?.indexSet) === Number(selectedOutcomeIndex));
  return match ?? outs[0] ?? null;
}

function parseMaybeWeiToFloat(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const t = v.trim();
  if (!t) return 0;
  try {
    if (/^\d+$/.test(t)) return Number(utils.formatUnits(t, 18));
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Fully wired buy/sell panel for Predict.fun (EOA JWT auth + signed limit orders). */
export default function PredictFunBuySellWidget({
  marketId,
  marketRaw,
  outcomeOptions,
  selectedOutcomeIndex,
  onOutcomeIndexChange,
  marketTitle,
  categorySlug: categorySlugProp,
  relatedMarketIds = [],
  symbolImageUrl,
  subMarketOptions = [],
  selectedSubMarketId,
  onSubMarketIdChange,
}: PredictFunBuySellWidgetProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [redeemedLockKeys, setRedeemedLockKeys] = useState<Set<string>>(new Set());
  const [fallbackSigner, setFallbackSigner] =
    useState<providers.JsonRpcSigner | null>(null);

  const { redeem, isRedeeming: isRedeemingPosition } = usePredictFunRedeem();

  const selected =
    outcomeOptions.find((o) => o.index === selectedOutcomeIndex) ??
    outcomeOptions[0];

  const yesOption =
    outcomeOptions.find((o) => /^(yes|up)$/i.test(o.title)) ?? outcomeOptions[0];
  const noOption =
    outcomeOptions.find((o) => /^(no|down)$/i.test(o.title)) ??
    outcomeOptions[1] ??
    outcomeOptions[0];
  const firstOutcomeLabel = yesOption?.title?.trim() || "Yes";
  const secondOutcomeLabel = noOption?.title?.trim() || "No";
  const currentYesPrice = yesOption?.price ?? 0;
  const currentNoPrice = noOption?.price ?? 0;
  const selectedOutcomeKind: "Yes" | "No" = /^(no|down)$/i.test(selected?.title ?? "")
    ? "No"
    : "Yes";

  const handleOutcomeSelect = useCallback(
    (outcome: "Yes" | "No") => {
      const opt = outcome === "Yes" ? yesOption : noOption;
      if (opt) onOutcomeIndexChange?.(opt.index);
    },
    [yesOption, noOption, onOutcomeIndexChange]
  );

  const subMarketSelectOptions: SelectOption[] = useMemo(
    () =>
      subMarketOptions.map((m) => ({
        value: m.id,
        label: m.title,
      })),
    [subMarketOptions]
  );

  const { authenticated, ready: privyReady, user: privyUser } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { ethersSigner } = useWallet();

  const privyEvmAddress =
    authenticated && privyUser?.wallet?.address
      ? (privyUser.wallet.address as `0x${string}`)
      : undefined;

  // Prefer the wallet matching Privy's EVM address; otherwise fall back to the first EVM wallet once loaded.
  const wallet =
    (privyEvmAddress
      ? wallets.find((w) => (w.address ?? "").toLowerCase() === privyEvmAddress.toLowerCase())
      : null) ??
    (walletsReady && wallets.length > 0 ? wallets[0] : null);

  const eoaAddress = privyEvmAddress ?? (wallet?.address as `0x${string}` | undefined);

  // Privy can be authenticated before WalletProvider initializes `ethersSigner`.
  // Create a local signer directly from the Privy wallet provider as a fallback.
  useEffect(() => {
    let cancelled = false;
    async function initFallback() {
      if (!wallet || !authenticated || !walletsReady) {
        if (!cancelled) setFallbackSigner(null);
        return;
      }
      if (ethersSigner) {
        if (!cancelled) setFallbackSigner(null);
        return;
      }
      try {
        const provider = await wallet.getEthereumProvider();
        const ethersProvider = new providers.Web3Provider(
          provider as providers.ExternalProvider,
          "any"
        );
        const signer = ethersProvider.getSigner();
        // Touch address to ensure signer is usable.
        await signer.getAddress();
        if (!cancelled) setFallbackSigner(signer);
      } catch {
        if (!cancelled) setFallbackSigner(null);
      }
    }
    initFallback();
    return () => {
      cancelled = true;
    };
  }, [wallet, authenticated, walletsReady, ethersSigner]);

  const signer = ethersSigner ?? fallbackSigner;

  const positionsEnabled = Boolean(authenticated && eoaAddress);
  const {
    jwt: predictJwt,
    tradingAddress: predictTradingAddress,
    chainId: predictChainId,
    isLoading: predictJwtLoading,
    refresh: refreshPredictAuth,
  } = usePredictFunAuthJwt(signer, eoaAddress, positionsEnabled);

  const positionAddressCandidates = useMemo(() => {
    if (!eoaAddress) return [];
    return predictFunPositionsAddressCandidates(
      eoaAddress,
      predictChainId,
      predictTradingAddress
    );
  }, [eoaAddress, predictChainId, predictTradingAddress]);

  const { positions, isLoading: positionsLoading, refetch: refetchPositions } =
    usePredictFunPositions(
      positionAddressCandidates[0] ?? null,
      positionsEnabled,
      predictJwt,
      positionAddressCandidates.slice(1),
      {
        walletAddress: eoaAddress,
        chainId: predictChainId,
        tradingAddress: predictTradingAddress,
      }
    );
  const {
    data: bscBalances,
    isLoading: bscBalancesLoading,
    refetch: refetchBscBalances,
  } = useMyriadBscBalances(eoaAddress, positionsEnabled);

  /** Buy orders spend on-chain BEP-20 USDT (same as Deposit modal), not Predict.fun API collateral. */
  const walletUsdtBalance = useMemo(() => {
    const v = bscBalances?.usdt;
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
  }, [bscBalances?.usdt]);

  const selectedOutcomeRaw = useMemo(
    () => getOutcomeRawForSelected(marketRaw, selectedOutcomeIndex),
    [marketRaw, selectedOutcomeIndex]
  );

  const selectedTokenId = String(
    (selectedOutcomeRaw as any)?.onChainId ?? (selectedOutcomeRaw as any)?.on_chain_id ?? ""
  ).trim();

  const availableSellShares = useMemo(() => {
    return resolvePredictFunSellableShares(positions, {
      marketId,
      marketTitle: marketTitle ?? marketRaw?.title ?? marketRaw?.question,
      categorySlug:
        categorySlugProp ??
        (marketRaw as { categorySlug?: string })?.categorySlug ??
        (marketRaw as { slug?: string })?.slug,
      relatedMarketIds,
      selectedOutcomeTitle: selected?.title,
      selectedTokenId,
    });
  }, [
    positions,
    marketId,
    marketTitle,
    marketRaw,
    categorySlugProp,
    relatedMarketIds,
    selected?.title,
    selectedTokenId,
  ]);

  const isBuy = activeTab === "buy";
  const availableAmount = isBuy ? walletUsdtBalance : Math.max(0, availableSellShares);
  const balancesLoading = isBuy
    ? bscBalancesLoading
    : positionsLoading || predictJwtLoading;

  const handleQuickPercent = useCallback(
    (pct: 25 | 50 | 75 | 100) => {
      const value = (availableAmount * pct) / 100;
      if (!Number.isFinite(value) || value <= 0) {
        setSize("");
        return;
      }
      if (isBuy) {
        setSize(value.toFixed(2));
      } else {
        const rounded = Math.round(value * 10000) / 10000;
        setSize(String(rounded));
      }
    },
    [availableAmount, isBuy]
  );

  const marketFlags = useMemo(() => {
    return {
      isNegRisk: Boolean((marketRaw as any)?.isNegRisk ?? false),
      isYieldBearing: Boolean((marketRaw as any)?.isYieldBearing ?? false),
    };
  }, [marketRaw]);

  const feeRateBps = Number((marketRaw as any)?.feeRateBps ?? 0) || 0;

  const marketTradable = useMemo(() => isPredictFunMarketTradable(marketRaw), [marketRaw]);
  const marketResolved = useMemo(() => isPredictFunMarketResolved(marketRaw), [marketRaw]);

  const positionFilter = useMemo(
    () => ({
      marketId,
      marketTitle: marketTitle ?? marketRaw?.title ?? marketRaw?.question,
      categorySlug:
        categorySlugProp ??
        (marketRaw as { categorySlug?: string })?.categorySlug ??
        (marketRaw as { slug?: string })?.slug,
      relatedMarketIds,
      selectedOutcomeTitle: selected?.title,
      selectedTokenId,
    }),
    [
      marketId,
      marketTitle,
      marketRaw,
      categorySlugProp,
      relatedMarketIds,
      selected?.title,
      selectedTokenId,
    ]
  );

  const marketPosition = useMemo(
    () => findPredictFunMarketPosition(positions, positionFilter, marketRaw),
    [positions, positionFilter, marketRaw]
  );

  const redeemLockKey = useMemo(() => {
    if (!marketPosition?.redeemParams) return null;
    return buildPredictFunRedeemLockKey(marketPosition.redeemParams);
  }, [marketPosition?.redeemParams]);

  useEffect(() => {
    if (!eoaAddress) return;
    setRedeemedLockKeys(readPredictFunRedeemLocks(eoaAddress, predictChainId));
  }, [eoaAddress, predictChainId, positions]);

  const redeemMode = Boolean(
    marketResolved &&
      marketPosition &&
      marketPosition.redeemEligible &&
      marketPosition.redeemParams &&
      redeemLockKey &&
      !redeemedLockKeys.has(redeemLockKey)
  );

  const { orderbook } = usePredictFunOrderBook(
    marketId,
    Boolean(marketId) && marketTradable
  );

  const tradePrice01 = useMemo(
    () =>
      resolvePredictFunTradePrice01({
        marketRaw,
        outcomeIndex: selectedOutcomeIndex,
        side: activeTab,
        orderbook: orderbook
          ? { bids: orderbook.bids, asks: orderbook.asks }
          : null,
      }),
    [marketRaw, selectedOutcomeIndex, activeTab, orderbook]
  );

  const displayYesPrice =
    selectedOutcomeKind === "Yes" && tradePrice01 > 0
      ? tradePrice01
      : currentYesPrice;
  const displayNoPrice =
    selectedOutcomeKind === "No" && tradePrice01 > 0
      ? tradePrice01
      : currentNoPrice;

  const ensureChainAndConfig = useCallback(async (): Promise<{
    chainId: PredictFunChainId;
    isTestnet: boolean;
  }> => {
    const cfgRes = await fetch("/api/predictfun/config", { cache: "no-store" });
    if (!cfgRes.ok) throw new Error("Predict.fun config unavailable");
    const cfg = (await cfgRes.json()) as { chainId: number; isTestnet: boolean };
    const chainId = (cfg.chainId === 97 ? 97 : 56) as PredictFunChainId;
    const isTestnet = Boolean(cfg.isTestnet);

    if (wallet) {
      const cid = wallet.chainId;
      const onChain = cid === `eip155:${chainId}` || cid === String(chainId);
      if (!onChain) {
        await wallet.switchChain(chainId);
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    return { chainId, isTestnet };
  }, [wallet]);


  const handleRedeem = useCallback(async () => {
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }
    if (!signer || !eoaAddress) {
      showErrorNotification("Connect wallet", "Connect your EVM wallet to redeem.");
      return;
    }
    if (!marketPosition?.redeemParams || !redeemLockKey) {
      showErrorNotification("Nothing to redeem", "No redeemable position for this outcome.");
      return;
    }
    setIsSubmitting(true);
    try {
      const txHash = await redeem({
        rowKey: redeemLockKey,
        signer,
        walletAddress: eoaAddress,
        chainId: predictChainId,
        params: marketPosition.redeemParams,
        wallet: wallet ?? undefined,
      });
      appendPredictFunRedeemHistory(eoaAddress, predictChainId, {
        key: redeemLockKey,
        marketId,
        marketTitle: marketTitle ?? marketRaw?.title ?? "Market",
        slugForLink:
          categorySlugProp ??
          (marketRaw as { categorySlug?: string })?.categorySlug ??
          marketId,
        outcome: marketPosition.outcomeLabel,
        shares: marketPosition.shares,
        txHash,
        redeemedAt: Date.now(),
      });
      setRedeemedLockKeys((prev) => {
        const next = new Set(prev);
        next.add(redeemLockKey);
        writePredictFunRedeemLock(eoaAddress, predictChainId, next);
        return next;
      });
      showSuccessNotification(
        "Redeemed",
        txHash
          ? `Winnings claimed. Tx: ${txHash.slice(0, 10)}…`
          : "Winnings claimed successfully."
      );
      setSize("");
      void refetchPositions();
      void refetchBscBalances();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const friendly = /result.*not received|not resolved/i.test(msg)
        ? "Market is not resolved on-chain yet. Try again after settlement."
        : msg;
      showErrorNotification("Redeem failed", friendly);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    authenticated,
    signer,
    eoaAddress,
    marketPosition,
    redeemLockKey,
    redeem,
    predictChainId,
    wallet,
    marketId,
    marketTitle,
    marketRaw,
    categorySlugProp,
    refetchPositions,
    refetchBscBalances,
  ]);

  const handleTrade = useCallback(async () => {
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }
    if (!marketTradable) {
      showErrorNotification(
        "Market closed",
        marketResolved
          ? "This market has ended. Redeem winning shares instead of selling."
          : "Trading is not available for this market."
      );
      return;
    }
    if (!privyReady || !walletsReady) {
      showInfoNotification("Wallet loading", "Please wait a moment and try again.");
      return;
    }
    if (!wallet || !eoaAddress) {
      showErrorNotification("Connect wallet", "No EVM wallet found. Please connect/link an EVM wallet.");
      return;
    }
    if (!signer) {
      showErrorNotification(
        "Wallet not ready",
        "Wallet signer unavailable yet. Please wait a moment and try again."
      );
      return;
    }
    if (!selectedTokenId) {
      showErrorNotification("Unsupported market", "Missing outcome token id for this market.");
      return;
    }
    const px = tradePrice01 > 0 ? tradePrice01 : Number(selected?.price ?? 0);
    if (!Number.isFinite(px) || px <= 0) {
      showErrorNotification(
        "Invalid price",
        activeTab === "sell"
          ? "No buyers in the order book for this outcome. Try again later or lower your price."
          : "Cannot trade without a valid outcome price."
      );
      return;
    }

    const n = parseUsdInput(size);
    if (!Number.isFinite(n) || n <= 0) {
      showErrorNotification("Invalid size", activeTab === "buy" ? "Enter an amount in USD." : "Enter share amount.");
      return;
    }

    if (positionsEnabled && balancesLoading) {
      showInfoNotification("Balance loading", "Please wait for your balance to load.");
      return;
    }

    if (availableAmount <= 0) {
      showErrorNotification(
        activeTab === "buy" ? "Insufficient balance" : "No shares to sell",
        activeTab === "buy"
          ? "You have no available USDT to place this order."
          : "You have no shares available for this outcome."
      );
      return;
    }

    if (n > availableAmount + 1e-9) {
      showErrorNotification(
        activeTab === "buy" ? "Insufficient balance" : "Insufficient shares",
        activeTab === "buy"
          ? `Amount exceeds available USDT (${availableAmount.toFixed(2)}).`
          : `Size exceeds available shares (${availableAmount.toFixed(4)}).`
      );
      return;
    }

    if (activeTab === "buy" && n < PREDICT_FUN_MIN_ORDER_USD) {
      showErrorNotification(
        "Amount too small",
        `Minimum order size is $${PREDICT_FUN_MIN_ORDER_USD.toFixed(1)} USD.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { chainId } = await ensureChainAndConfig();
      if (!signer) throw new Error("Connect a wallet to trade");

      let auth = await authenticatePredictFun(signer);
      const tradingAddress = auth.tradingAddress;
      const usePredictAccountSignature = Boolean(
        auth.predictAccount &&
          isPredictFunPredictAccount(auth.walletAddress, auth.predictAccount)
      );

      const { makerAmount, takerAmount, pricePerShareWei } =
        buildPredictFunLimitOrderAmounts(
          activeTab === "buy"
            ? { side: "buy", price01: px, usdAmount: n }
            : { side: "sell", price01: px, quantityShares: n }
        );

      const neededUsdtWei = BigNumber.from(
        activeTab === "buy" ? makerAmount : takerAmount
      );
      await ensurePredictFunTradeApprovals({
        signer,
        chainId,
        maker: tradingAddress,
        marketFlags,
        side: activeTab,
        neededUsdtWei,
        predictAccount: usePredictAccountSignature ? auth.predictAccount : null,
      });

      const order = buildPredictFunLimitOrder({
        maker: tradingAddress,
        signer: tradingAddress,
        tokenId: selectedTokenId,
        side: activeTab === "buy" ? 0 : 1,
        makerAmount,
        takerAmount,
        feeRateBps,
      });

      const verifyingContract = predictFunExchangeAddress(chainId, marketFlags);
      const typedData = buildPredictFunTypedData({
        chainId,
        verifyingContract,
        order,
      });

      const hash = hashPredictFunTypedData(typedData);
      const signature = usePredictAccountSignature && auth.predictAccount
        ? await signPredictFunAccountOrderHash(
            signer,
            auth.predictAccount,
            chainId,
            hash
          )
        : await (signer as any)._signTypedData(
            typedData.domain,
            (() => {
              const { EIP712Domain: _ignored, ...types } = typedData.types as any;
              return types;
            })(),
            typedData.message
          );

      const signedOrder = {
        ...order,
        signature,
        hash,
      };

      const submitOrder = async (jwt: string) => {
        const res = await fetch("/api/predictfun/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jwt,
            data: {
              order: signedOrder,
              pricePerShare: pricePerShareWei,
              strategy: "LIMIT",
            },
          }),
        });
        return res;
      };

      let res = await submitOrder(auth.jwt);
      if (res.status === 401) {
        auth = await authenticatePredictFun(signer, { forceRefresh: true });
        res = await submitOrder(auth.jwt);
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const detail = String(err.detail ?? "");
        const message = parsePredictFunApiErrorText(
          detail,
          String(err.error ?? "Order rejected")
        );
        throw new Error(message);
      }

      showSuccessNotification("Order submitted", `${activeTab === "buy" ? "Bought" : "Sold"} ${selected?.title ?? ""}`);
      setSize("");
      void refreshPredictAuth();
      void refetchPositions();
      void refetchBscBalances();
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      showErrorNotification("Trade failed", msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    authenticated,
    privyReady,
    walletsReady,
    wallet,
    eoaAddress,
    signer,
    selectedTokenId,
    selected?.price,
    selected?.title,
    tradePrice01,
    size,
    activeTab,
    marketTradable,
    marketResolved,
    ensureChainAndConfig,
    marketFlags,
    feeRateBps,
    availableAmount,
    positionsEnabled,
    balancesLoading,
    refreshPredictAuth,
    refetchPositions,
    refetchBscBalances,
  ]);

  const sizeNumber = parseUsdInput(size);
  const balancesReady = !positionsEnabled || !balancesLoading;
  const hasSpendableBalance = availableAmount > 0;
  const exceedsAvailable =
    Number.isFinite(sizeNumber) && sizeNumber > 0 && sizeNumber > availableAmount + 1e-9;

  const showDepositCta =
    marketTradable && isBuy && positionsEnabled && balancesReady && !hasSpendableBalance;

  const redeemShares = marketPosition?.shares ?? availableSellShares;
  const redeemPending =
    redeemLockKey != null && redeemedLockKeys.has(redeemLockKey);

  const primaryButtonDisabled = redeemMode
    ? isSubmitting ||
      isRedeemingPosition(redeemLockKey ?? "") ||
      !authenticated ||
      !signer ||
      redeemShares <= 0
    : showDepositCta
      ? isSubmitting
      : isSubmitting ||
        !authenticated ||
        !signer ||
        !selected ||
        !marketTradable ||
        !Number.isFinite(sizeNumber) ||
        sizeNumber <= 0 ||
        (positionsEnabled && !balancesReady) ||
        (positionsEnabled && balancesReady && !hasSpendableBalance) ||
        (positionsEnabled && balancesReady && exceedsAvailable);

  const primaryButtonLabel = redeemMode
    ? `Redeem ${selected?.title?.trim() || firstOutcomeLabel}`
    : redeemPending
      ? "Redeemed"
      : showDepositCta
        ? "Deposit USDT"
        : marketResolved && !marketTradable
          ? "Market closed"
          : `${activeTab === "buy" ? "Buy" : "Sell"} ${selected?.title ?? "—"}`;

  const handlePrimaryClick = () => {
    if (!authenticated) {
      setShowLoginModal(true);
      return;
    }
    if (redeemMode) {
      void handleRedeem();
      return;
    }
    if (showDepositCta) {
      setShowDepositModal(true);
      return;
    }
    void handleTrade();
  };

  return (
    <div className="flex w-full flex-col border border-white/10 rounded-lg overflow-hidden bg-[#0a0a0a] lg:h-full lg:min-h-0">
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <DepositWithdrawModal
        isOpen={showDepositModal}
        onClose={() => {
          setShowDepositModal(false);
          if (positionsEnabled) {
            void refetchBscBalances();
            void refetchPositions();
          }
        }}
        defaultPlatform="predictfun"
      />

      <div className="flex items-center gap-3 px-4 py-3 pr-12 lg:pr-4 border-b border-white/10">
        {symbolImageUrl ? (
          <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
            <Image
              src={symbolImageUrl}
              alt={marketTitle || "Market"}
              width={40}
              height={40}
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white/60 text-xs">?</span>
          </div>
        )}
        <div className="flex-1 min-w-0 max-w-[65%] lg:max-w-none">
          <div className="text-sm font-medium text-white truncate">
            {marketTitle ?? "Market"}
          </div>
          <div className="text-xs text-white/60">Predict.fun</div>
        </div>
      </div>

      {marketResolved ? (
        <div className="px-4 py-2 border-b border-white/10 bg-amber-500/10">
          <p className="text-xs text-amber-200/90 leading-snug">
            {redeemMode
              ? "This market has ended. Claim your winning shares for USDT."
              : redeemPending
                ? "Redeem submitted. Your position will update shortly."
                : marketPosition && marketPosition.shares > 0
                  ? "This market has ended. No winning shares to redeem for this outcome."
                  : "This market has ended. Trading is closed."}
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 gap-2">
        <div className="flex items-center gap-1 shrink-0">
          {redeemMode ? (
            <span className="px-4 py-2 text-sm font-semibold text-[#A855F7] border-b-2 border-[#A855F7]">
              Redeem
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("buy")}
                disabled={!marketTradable}
                className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${
                  activeTab === "buy"
                    ? "text-[#ffc000] border-b-2 border-[#ffc000]"
                    : "text-white/60 hover:text-white/80"
                } ${!marketTradable ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("sell")}
                disabled={!marketTradable}
                className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t ${
                  activeTab === "sell"
                    ? "text-[#ffc000] border-b-2 border-[#ffc000] bg-[#0a0a0a]"
                    : "text-white/60 hover:text-white/80"
                } ${!marketTradable ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Sell
              </button>
            </>
          )}
        </div>
        {subMarketOptions.length > 1 ? (
          <div className="min-w-[120px] max-w-[200px] flex-1">
            <Select
              value={selectedSubMarketId ?? subMarketOptions[0]?.id ?? ""}
              onChange={(value) => onSubMarketIdChange?.(value)}
              options={subMarketSelectOptions}
              placeholder="Market"
              className="w-full"
              searchable
              searchPlaceholder="Search outcomes..."
            />
          </div>
        ) : null}
      </div>

      <div className="p-4 flex gap-3 bg-[#0a0a0a]">
        <button
          type="button"
          onClick={() => handleOutcomeSelect("Yes")}
          className={`flex-1 py-2 px-2 rounded-lg font-semibold text-white transition-all ${
            selectedOutcomeKind === "Yes"
              ? "bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20"
              : "bg-gray-600 hover:bg-gray-500"
          }`}
        >
          <div className="flex flex-row items-center justify-center gap-2">
            {selectedOutcomeKind === "Yes" ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : null}
            <span className="text-sm">{firstOutcomeLabel}</span>
            <span className="text-sm font-bold">{formatPrice(displayYesPrice)}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleOutcomeSelect("No")}
          className={`flex-1 py-2 px-2 rounded-lg font-semibold text-white transition-all ${
            selectedOutcomeKind === "No"
              ? "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20"
              : "bg-gray-600 hover:bg-gray-500"
          }`}
        >
          <div className="flex flex-row items-center justify-center gap-2">
            {selectedOutcomeKind === "No" ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : null}
            <span className="text-sm">{secondOutcomeLabel}</span>
            <span className="text-sm font-bold">{formatPrice(displayNoPrice)}</span>
          </div>
        </button>
      </div>

      <div className="flex flex-col px-4 pb-4 space-y-3 lg:min-h-0 lg:flex-1">
        {redeemMode ? (
          <div className="rounded-lg border border-[#A855F7]/30 bg-[#A855F7]/10 px-3 py-3 space-y-1">
            <p className="text-xs text-white/70">Redeemable position</p>
            <p className="text-lg font-semibold text-white tabular-nums">
              {redeemShares.toFixed(4)} {marketPosition?.outcomeLabel ?? selected?.title ?? ""}
            </p>
            <p className="text-[11px] text-white/50">
              Converts winning outcome tokens to USDT on BNB Chain.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs text-white/60 block">
                {activeTab === "buy" ? "Amount" : "Size (shares)"}
              </label>
              <div className="text-xs text-white/50 text-right">
                {activeTab === "buy" ? (
                  <span>Available: ${availableAmount.toFixed(2)}</span>
                ) : (
                  <span>
                    Available: {availableAmount.toFixed(2)}{" "}
                    {selected?.title?.trim() || firstOutcomeLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="mb-2 flex items-center justify-end gap-1">
              {([25, 50, 75, 100] as const).map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleQuickPercent(pct)}
                  disabled={availableAmount <= 0 || !marketTradable}
                  className={`rounded border px-2 py-0.5 text-[11px] leading-4 transition-colors ${
                    availableAmount > 0 && marketTradable
                      ? "border-[#ffc000]/60 text-white/90 hover:bg-[#ffc000]/20"
                      : "border-white/15 text-white/35 cursor-not-allowed"
                  }`}
                >
                  {pct === 100 ? "Max" : `${pct}%`}
                </button>
              ))}
            </div>
            <div className="relative">
              {activeTab === "buy" ? (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 text-sm">
                  $
                </span>
              ) : null}
              <input
                type="text"
                inputMode="decimal"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder={activeTab === "buy" ? "0" : "0.00"}
                disabled={!marketTradable}
                className={`w-full bg-transparent border border-white/10 rounded-lg py-2.5 text-white text-sm focus:outline-none focus:border-[#ffc000] placeholder-white/30 disabled:opacity-40 ${
                  activeTab === "buy" ? "pl-6 pr-3" : "px-3"
                }`}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={primaryButtonDisabled}
          onClick={handlePrimaryClick}
          className={`w-full shrink-0 py-2.5 rounded-lg font-semibold text-sm transition-colors lg:mt-auto ${
            primaryButtonDisabled
              ? redeemMode
                ? "bg-[#A855F7]/40 text-white/50 cursor-not-allowed"
                : activeTab === "sell"
                  ? "bg-red-600/40 text-white/50 cursor-not-allowed"
                  : "bg-[#ffc000]/40 text-black/50 cursor-not-allowed"
              : redeemMode
                ? "bg-[#A855F7] text-white hover:bg-[#9333EA]"
                : showDepositCta || activeTab === "buy"
                  ? "bg-[#ffc000] text-black hover:bg-[#ffc000]/90"
                  : "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20"
          }`}
        >
          {isSubmitting || isRedeemingPosition(redeemLockKey ?? "")
            ? redeemMode
              ? "Redeeming…"
              : "Submitting…"
            : primaryButtonLabel}
        </button>
        <p className="shrink-0 text-[10px] text-white/40 text-center leading-snug">
          {redeemMode
            ? "Redeem is an on-chain transaction via Predict.fun (BNB Chain)."
            : isBuy
              ? `Trades are signed with your wallet. Minimum buy size is $${PREDICT_FUN_MIN_ORDER_USD.toFixed(1)} USDT.`
              : "Trades are signed with your connected wallet and submitted to Predict.fun."}
        </p>
      </div>
    </div>
  );
}
