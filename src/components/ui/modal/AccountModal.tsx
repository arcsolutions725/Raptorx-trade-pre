"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GoldenTeamUpdatesEditor } from "@/components/golden-report/GoldenTeamUpdatesEditor";
import { ReferralShare } from "@/components/leaderboard/ReferralInput";
import copy from "copy-to-clipboard";
import { Copy, Check, RefreshCw } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { usePolymarketDepositAddresses } from "@/hooks/usePolymarketDepositAddresses";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import {
  showErrorNotification,
  showSuccessNotification,
} from "@/components/ui/notification";
import {
  clearGoldenEditorCache,
  isGoldenEditorCacheFresh,
  readGoldenEditorCache,
  writeGoldenEditorCache,
  type GoldenEditorProjectCache,
} from "@/lib/goldenReportEditorCache";
import { canonicalTeamUpdatesMarkdown } from "@/lib/goldenReportEditorSerialization";

type User = {
  id: string;
  username: string;
  email: string | null;
  privyId: string;
  points: number;
  solanaWallet?: string | null;
  ethereumWallet?: string | null;
  referralCode?: string;
  createdAt: string;
  updatedAt: string;
};

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  isLoadingUser: boolean;
  isLoggingOut: boolean;
  onLogout: () => void;
}

const getInitials = (username: string) => {
  const lettersOnly = username.replace(/[0-9]/g, "");
  if (lettersOnly.length < 2) return lettersOnly.toUpperCase();
  return (lettersOnly[0] + lettersOnly[lettersOnly.length - 1]).toUpperCase();
};

const truncateAddress = (address: string) => {
  if (!address || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

function pickGoldenIx(
  projects: GoldenEditorProjectCache[],
  prevAddr?: string | null,
  prevChain?: string | null,
) {
  let nextIx = 0;
  if (prevAddr && projects.length > 0) {
    const found = projects.findIndex(
      (pr) =>
        pr.contractAddress === prevAddr && pr.chain === prevChain,
    );
    if (found >= 0) nextIx = found;
  }
  return nextIx;
}

export default function AccountModal({
  isOpen,
  onClose,
  currentUser,
  isLoadingUser,
  isLoggingOut,
  onLogout,
}: AccountModalProps) {
  const [activeTab, setActiveTab] = useState<
    "profile" | "goldenReport" | "referral"
  >("profile");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [goldenProjects, setGoldenProjects] = useState<
    GoldenEditorProjectCache[]
  >([]);
  const [goldenLoading, setGoldenLoading] = useState(false);
  const [goldenIx, setGoldenIx] = useState(0);
  const [goldenDraft, setGoldenDraft] = useState("");
  const [goldenSaving, setGoldenSaving] = useState(false);
  const [goldenRefreshing, setGoldenRefreshing] = useState(false);

  const goldenProjectsRef = useRef(goldenProjects);
  const goldenIxRef = useRef(goldenIx);
  goldenProjectsRef.current = goldenProjects;
  goldenIxRef.current = goldenIx;

  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  // Use only safeAddress for deposit addresses
  const safeAddress = derivedSafeAddressFromEoa;

  const {
    data: depositAddressesData,
    isLoading: isLoadingDepositAddresses,
    error: depositAddressesError,
  } = usePolymarketDepositAddresses({
    walletAddress: safeAddress || null,
    enabled: isOpen && !!safeAddress,
  });

  const handleCopyAddress = (
    address: string,
    type: "solana" | "ethereum" | "evm" | "svm" | "btc",
  ) => {
    if (!address) return;
    copy(address);
    setCopiedAddress(type);

    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

    copyTimeoutRef.current = setTimeout(() => {
      setCopiedAddress(null);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const fetchGoldenEditorFromNetwork = useCallback(
    async (userId: string, opts?: { showLoading?: boolean }) => {
      const showLoading = opts?.showLoading !== false;
      const prevList = goldenProjectsRef.current;
      const prevIx = goldenIxRef.current;
      const prevAddr = prevList[prevIx]?.contractAddress;
      const prevChain = prevList[prevIx]?.chain;

      if (showLoading) setGoldenLoading(true);
      try {
        const res = await fetch("/api/golden-reports/editor", {
          headers: { "x-user-id": userId },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        const projects: GoldenEditorProjectCache[] = Array.isArray(
          data?.projects,
        )
          ? data.projects
          : [];

        const nextIx = pickGoldenIx(projects, prevAddr, prevChain);
        writeGoldenEditorCache(userId, projects, Date.now());
        setGoldenProjects(projects);
        setGoldenIx(nextIx);
        setGoldenDraft(projects[nextIx]?.teamUpdatesContent ?? "");
        return true;
      } catch {
        if (showLoading) {
          setGoldenProjects([]);
          setGoldenDraft("");
        }
        return false;
      } finally {
        if (showLoading) setGoldenLoading(false);
      }
    },
    [],
  );

  const handleRefreshGoldenUpdates = async () => {
    if (!currentUser?.id || goldenRefreshing) return;

    if (goldenPublishDirty) {
      const shouldDiscard = window.confirm(
        "You have unsaved Team Updates changes. Refreshing will replace the editor with the latest published content. Continue?",
      );
      if (!shouldDiscard) return;
    }

    setGoldenRefreshing(true);
    try {
      const ok = await fetchGoldenEditorFromNetwork(currentUser.id, {
        showLoading: false,
      });
      if (!ok) {
        showErrorNotification(
          "Could not refresh",
          "Failed to fetch the latest Team Updates. Please try again.",
          { position: "top-right" },
        );
        return;
      }
      showSuccessNotification(
        "Team updates refreshed",
        "Loaded the latest Team Updates from the database.",
        { position: "top-right" },
      );
    } finally {
      setGoldenRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== "goldenReport" || !currentUser?.id) return;
    const uid = currentUser.id;
    const cached = readGoldenEditorCache(uid);

    if (cached && isGoldenEditorCacheFresh(cached)) {
      const projects = cached.projects;
      if (projects.length === 0) {
        void fetchGoldenEditorFromNetwork(uid, { showLoading: true });
        return;
      }
      const prevAddr = goldenProjectsRef.current[goldenIxRef.current]?.contractAddress;
      const prevChain = goldenProjectsRef.current[goldenIxRef.current]?.chain;
      const nextIx = pickGoldenIx(projects, prevAddr, prevChain);
      setGoldenProjects(projects);
      setGoldenIx(nextIx);
      setGoldenDraft(projects[nextIx]?.teamUpdatesContent ?? "");
      return;
    }

    if (cached && !isGoldenEditorCacheFresh(cached)) {
      const projects = cached.projects;
      const prevAddr = goldenProjectsRef.current[goldenIxRef.current]?.contractAddress;
      const prevChain = goldenProjectsRef.current[goldenIxRef.current]?.chain;
      const nextIx = pickGoldenIx(projects, prevAddr, prevChain);
      setGoldenProjects(projects);
      setGoldenIx(nextIx);
      setGoldenDraft(projects[nextIx]?.teamUpdatesContent ?? "");
      void fetchGoldenEditorFromNetwork(uid, { showLoading: false });
      return;
    }

    void fetchGoldenEditorFromNetwork(uid, { showLoading: true });
  }, [isOpen, activeTab, currentUser?.id, fetchGoldenEditorFromNetwork]);

  useEffect(() => {
    const p = goldenProjects[goldenIx];
    if (p) setGoldenDraft(p.teamUpdatesContent ?? "");
  }, [goldenIx, goldenProjects]);

  const goldenSavedMarkdown =
    goldenProjects[goldenIx]?.teamUpdatesContent ?? "";
  const goldenPublishDirty = useMemo(
    () =>
      canonicalTeamUpdatesMarkdown(goldenDraft) !==
      canonicalTeamUpdatesMarkdown(goldenSavedMarkdown),
    [goldenDraft, goldenSavedMarkdown],
  );

  const handlePublishTeamUpdates = async () => {
    const p = goldenProjects[goldenIx];
    if (!currentUser?.id || !p) return;
    if (!goldenPublishDirty) return;
    setGoldenSaving(true);
    try {
      const res = await fetch("/api/golden-reports/editor", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          contractAddress: p.contractAddress,
          chain: p.chain,
          content: goldenDraft,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const err =
          typeof data?.error === "string" ? data.error : "Publish failed.";
        showErrorNotification("Could not publish", err, {
          position: "top-right",
        });
        return;
      }
      showSuccessNotification(
        "Team updates published",
        "RexScreener reports will show the latest under Team Updates.",
        { position: "top-right" },
      );
      const updated = data?.project as
        | GoldenEditorProjectCache
        | undefined;
      if (updated && currentUser?.id) {
        setGoldenProjects((prev) => {
          const next = prev.map((row) =>
            row.contractAddress === updated.contractAddress &&
            row.chain === updated.chain
              ? {
                  ...row,
                  teamUpdatesContent:
                    updated.teamUpdatesContent ?? row.teamUpdatesContent,
                  teamUpdatesPublishedAt:
                    updated.teamUpdatesPublishedAt != null
                      ? String(updated.teamUpdatesPublishedAt)
                      : row.teamUpdatesPublishedAt,
                }
              : row,
          );
          writeGoldenEditorCache(currentUser.id, next, Date.now());
          return next;
        });
        setGoldenDraft(
          typeof updated.teamUpdatesContent === "string"
            ? updated.teamUpdatesContent
            : "",
        );
      }
    } catch {
      const err = "Publish failed.";
      showErrorNotification("Could not publish", err, {
        position: "top-right",
      });
    } finally {
      setGoldenSaving(false);
    }
  };

  // Handle click outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          ref={modalRef}
          className="w-125 max-w-[90%] bg-[#0D0D0D] rounded-xl shadow-2xl border border-white/10 pointer-events-auto max-h-[80vh] overflow-y-auto custom-sidebar-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-xl font-bold text-white">
              Account & Referrals
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-400 hover:text-white"
              aria-label="Close modal"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mx-4 mt-4 bg-[#141414] p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`min-w-0 flex-1 py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === "profile"
                  ? "bg-[#ffc000] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("goldenReport")}
              className={`min-w-0 flex-1 py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === "goldenReport"
                  ? "bg-[#ffc000] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Golden Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("referral")}
              className={`min-w-0 flex-1 py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === "referral"
                  ? "bg-[#ffc000] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Referrals
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {isLoadingUser ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc000]"></div>
              </div>
            ) : currentUser ? (
              <>
                {/* Profile Tab */}
                {activeTab === "profile" && (
                  <div className="space-y-6">
                    {/* User Info */}
                    <div className="flex flex-col items-center mb-6">
                      <div className="w-20 h-20 rounded-full bg-[#ffc000] text-black flex items-center justify-center text-2xl font-bold mb-4">
                        {getInitials(currentUser.username)}
                      </div>
                      <h3 className="font-bold text-white text-2xl">
                        {currentUser.username}
                      </h3>
                      <p className="text-white text-lg mt-2">
                        <span className="text-[#00B050] text-xl font-bold">
                          {currentUser.points.toLocaleString()}
                        </span>{" "}
                        points
                      </p>
                    </div>

                    {/* Account Details */}
                    <div className="bg-white/5 rounded-lg p-4">
                      <h4 className="text-white font-semibold mb-3">
                        Account Information
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Username:</span>
                          <span className="text-white">
                            {currentUser.username}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-gray-400">Solana Wallet:</span>
                          <div className="flex items-center gap-2 max-w-55">
                            <span className="text-white text-right">
                              {currentUser.solanaWallet
                                ? truncateAddress(currentUser.solanaWallet)
                                : "Not connected"}
                            </span>
                            {currentUser.solanaWallet && (
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    currentUser.solanaWallet!,
                                    "solana",
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors shrink-0"
                                title="Copy address"
                                aria-label="Copy Solana wallet address"
                              >
                                {copiedAddress === "solana" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-gray-400">BNB Wallet:</span>
                          <div className="flex items-center gap-2 max-w-55">
                            <span className="text-white text-right">
                              {currentUser.ethereumWallet
                                ? truncateAddress(currentUser.ethereumWallet)
                                : "Not connected"}
                            </span>
                            {currentUser.ethereumWallet && (
                              <button
                                onClick={() =>
                                  handleCopyAddress(
                                    currentUser.ethereumWallet!,
                                    "ethereum",
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded transition-colors shrink-0"
                                title="Copy address"
                                aria-label="Copy Ethereum wallet address"
                              >
                                {copiedAddress === "ethereum" ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Email:</span>
                          <span className="text-white">
                            {currentUser.email || "Not provided"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Member Since:</span>
                          <span className="text-white">
                            {new Date(
                              currentUser.createdAt,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Deposit Addresses Section */}
                    {/* {derivedSafeAddressFromEoa && (
                      <div className="bg-white/5 rounded-lg p-4">
                        <h4 className="text-white font-semibold mb-3">
                          Deposit Addresses
                        </h4>
                        <p className="text-xs text-gray-400 mb-3">
                          Send assets to these addresses to bridge and swap to
                          USDC.e on Polygon for trading.
                        </p>
                        {isLoadingDepositAddresses ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#ffc000]"></div>
                          </div>
                        ) : depositAddressesError ? (
                          <div className="text-red-400 text-sm py-2">
                            Failed to load deposit addresses. Please try again
                            later.
                          </div>
                        ) : depositAddressesData?.address ? (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">
                                  EVM (Ethereum/Polygon):
                                </span>
                                <button
                                  onClick={() =>
                                    handleCopyAddress(
                                      depositAddressesData.address.evm,
                                      "evm"
                                    )
                                  }
                                  className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                  title="Copy EVM address"
                                >
                                  {copiedAddress === "evm" ? (
                                    <Check className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                  )}
                                </button>
                              </div>
                              <div className="bg-black/30 rounded px-2 py-1.5 text-white text-xs font-mono break-all">
                                {depositAddressesData.address.evm}
                              </div>
                            </div>

                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">
                                  Solana (SVM):
                                </span>
                                <button
                                  onClick={() =>
                                    handleCopyAddress(
                                      depositAddressesData.address.svm,
                                      "svm"
                                    )
                                  }
                                  className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                  title="Copy Solana address"
                                >
                                  {copiedAddress === "svm" ? (
                                    <Check className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                  )}
                                </button>
                              </div>
                              <div className="bg-black/30 rounded px-2 py-1.5 text-white text-xs font-mono break-all">
                                {depositAddressesData.address.svm}
                              </div>
                            </div>

                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">
                                  Bitcoin:
                                </span>
                                <button
                                  onClick={() =>
                                    handleCopyAddress(
                                      depositAddressesData.address.btc,
                                      "btc"
                                    )
                                  }
                                  className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                  title="Copy Bitcoin address"
                                >
                                  {copiedAddress === "btc" ? (
                                    <Check className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                  )}
                                </button>
                              </div>
                              <div className="bg-black/30 rounded px-2 py-1.5 text-white text-xs font-mono break-all">
                                {depositAddressesData.address.btc}
                              </div>
                            </div>

                            {depositAddressesData.note && (
                              <p className="text-xs text-gray-500 mt-2 italic">
                                {depositAddressesData.note}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-400 text-sm py-2">
                            No deposit addresses available.
                          </div>
                        )}
                      </div>
                    )} */}
                  </div>
                )}

                {/* Golden Report — team updates (authorized editors only) */}
                {activeTab === "goldenReport" && (
                  <div className="space-y-4">
                    {goldenLoading ? (
                      <div className="flex justify-center py-12">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ffc000] border-t-transparent" />
                      </div>
                    ) : goldenProjects.length > 0 ? (
                      <div className="space-y-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <h6 className="text-[14px]! font-medium!">
                            <span className="text-[#ffc000] font-medium!">Golden Report</span> (Team updates)
                          </h6>
                          <button
                            type="button"
                            onClick={() => void handleRefreshGoldenUpdates()}
                            disabled={goldenRefreshing || goldenSaving}
                            className="inline-flex items-center justify-center p-1 text-white/90 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            title="Refresh latest team updates from database"
                            aria-label="Refresh Team Updates"
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${goldenRefreshing ? "animate-spin" : ""}`}
                            />
                          </button>
                        </div>
                        {goldenProjects.length > 1 ? (
                          <label className="mb-2 block text-xs text-gray-400">
                            Project
                            <select
                              value={goldenIx}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                const proj = goldenProjects[next];
                                setGoldenIx(next);
                                setGoldenDraft(proj?.teamUpdatesContent ?? "");
                              }}
                              className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
                            >
                              {goldenProjects.map((proj, i) => (
                                <option
                                  key={`${proj.chain}:${proj.contractAddress}`}
                                  value={i}
                                >
                                  {proj.contractAddress.slice(0, 6)}…
                                  {proj.contractAddress.slice(-4)} (
                                  {proj.chain})
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <div className="mb-3">
                          <GoldenTeamUpdatesEditor
                            documentKey={`${goldenProjects[goldenIx]?.contractAddress ?? ""}-${goldenProjects[goldenIx]?.chain ?? ""}-${goldenProjects[goldenIx]?.teamUpdatesPublishedAt ?? ""}`}
                            markdown={goldenDraft}
                            onMarkdownChange={setGoldenDraft}
                            placeholder="Share the latest official update for token holders…"
                            disabled={goldenSaving}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handlePublishTeamUpdates()}
                            disabled={goldenSaving || !goldenPublishDirty}
                            className="rounded-lg bg-[#ffc000] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#ffd000] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#ffc000]"
                          >
                            {goldenSaving ? "Publishing…" : "Publish"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-gray-400">
                        No Golden Report projects are linked to your account
                        email. If you should have access, ask the RaptorX team to
                        add your email for your project&apos;s contract.
                      </p>
                    )}
                  </div>
                )}

                {/* Referral Tab */}
                {activeTab === "referral" && (
                  <div className="space-y-4">
                    <ReferralShare
                      userId={currentUser.id}
                      referralCode={currentUser.referralCode || ""}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">User data not available</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700">
            <button
              onClick={() => {
                if (currentUser?.id) clearGoldenEditorCache(currentUser.id);
                onLogout();
              }}
              disabled={isLoggingOut}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition ${
                isLoggingOut
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-[#ffc000] text-black hover:bg-[#ffc000]/80 font-semibold"
              }`}
            >
              {isLoggingOut ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                  <span>Logging out...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3v1"
                    />
                  </svg>
                  <span>Sign Out</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
