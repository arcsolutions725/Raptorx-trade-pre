"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { GoldenTeamUpdatesEditor } from "@/components/golden-report/GoldenTeamUpdatesEditor";
import { ReferralShare } from "@/components/leaderboard/ReferralInput";
import copy from "copy-to-clipboard";
import { LogOut, RefreshCw } from "lucide-react";
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
import {
  AcctLoading,
  AcctModal,
  AcctModalHead,
  AcctTabs,
  ProfileDetails,
  ProfileHero,
  ProfileLinks,
  type OrdersTabKey,
} from "@/components/ui/modal/accountUi";

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
  /** "My orders and positions" / "Trade history": open My orders on that tab. The links are hidden without it. */
  onOpenOrders?: (tab: OrdersTabKey) => void;
}

const ACCOUNT_TABS = [
  ["profile", "Profile"],
  ["goldenReport", "Golden Report"],
  ["referral", "Referrals"],
] as const;

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
  onOpenOrders,
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
    <AcctModal labelledBy="acct-title" variant="rw" modalRef={modalRef}>
      <AcctModalHead
        id="acct-title"
        title="Account and referrals"
        onClose={onClose}
      />

      <div className="acct-modal__body">
        <AcctTabs
          idPrefix="acct"
          label="Account"
          tabs={ACCOUNT_TABS}
          active={activeTab}
          onChange={setActiveTab}
        />

        <div
          role="tabpanel"
          aria-labelledby={`acct-tab-${activeTab}`}
          className="flex flex-col gap-4"
        >
          {isLoadingUser ? (
            <AcctLoading label="Loading your account" />
          ) : currentUser ? (
            <>
              {/* Profile: hero, links to My orders, and the one Base wallet */}
              {activeTab === "profile" && (
                <>
                  <ProfileHero
                    username={currentUser.username}
                    points={currentUser.points}
                  />
                  {onOpenOrders ? <ProfileLinks onOpen={onOpenOrders} /> : null}
                  <ProfileDetails
                    username={currentUser.username}
                    baseWallet={currentUser.ethereumWallet}
                    email={currentUser.email}
                    memberSince={new Date(
                      currentUser.createdAt,
                    ).toLocaleDateString()}
                    copied={copiedAddress === "ethereum"}
                    onCopyWallet={() => {
                      if (currentUser.ethereumWallet) {
                        handleCopyAddress(currentUser.ethereumWallet, "ethereum");
                      }
                    }}
                  />
                  {/* Deposit addresses (Polymarket bridge: EVM / SVM / BTC) stay switched off, as
                      before the redesign. When they come back: depositAddressesData.address.{evm,svm,btc},
                      isLoadingDepositAddresses / depositAddressesError, and
                      handleCopyAddress(address, "evm" | "svm" | "btc") for the copy buttons. */}
                </>
              )}

              {/* Golden Report — team updates (authorized editors only) */}
              {activeTab === "goldenReport" && (
                <GoldenUpdatesPanel
                  loading={goldenLoading}
                  projects={goldenProjects}
                  ix={goldenIx}
                  onSelect={(next) => {
                    const proj = goldenProjects[next];
                    setGoldenIx(next);
                    setGoldenDraft(proj?.teamUpdatesContent ?? "");
                  }}
                  draft={goldenDraft}
                  onDraftChange={setGoldenDraft}
                  saving={goldenSaving}
                  refreshing={goldenRefreshing}
                  dirty={goldenPublishDirty}
                  onRefresh={() => void handleRefreshGoldenUpdates()}
                  onPublish={() => void handlePublishTeamUpdates()}
                />
              )}

              {/* Referrals */}
              {activeTab === "referral" && (
                <ReferralShare
                  userId={currentUser.id}
                  referralCode={currentUser.referralCode || ""}
                />
              )}
            </>
          ) : (
            <p className="m-0 py-8 text-center text-sm text-rx-text-3">
              User data not available
            </p>
          )}
        </div>
      </div>

      <div className="acct-modal__foot">
        <button
          type="button"
          onClick={() => {
            if (currentUser?.id) clearGoldenEditorCache(currentUser.id);
            onLogout();
          }}
          disabled={isLoggingOut}
          aria-busy={isLoggingOut || undefined}
          className="rx-btn rx-btn--danger rx-btn--block"
        >
          {isLoggingOut ? (
            <>
              <span className="rx-spin" aria-hidden="true" />
              Logging out…
            </>
          ) : (
            <>
              <LogOut className="size-[15px]" aria-hidden="true" />
              Sign out
            </>
          )}
        </button>
      </div>
    </AcctModal>
  );
}

/** Golden Report tab: project picker, Team Updates editor, refresh and publish (presentation only). */
export function GoldenUpdatesPanel({
  loading,
  projects,
  ix,
  onSelect,
  draft,
  onDraftChange,
  saving,
  refreshing,
  dirty,
  onRefresh,
  onPublish,
}: {
  loading: boolean;
  projects: GoldenEditorProjectCache[];
  ix: number;
  onSelect: (ix: number) => void;
  draft: string;
  onDraftChange: (markdown: string) => void;
  saving: boolean;
  refreshing: boolean;
  dirty: boolean;
  onRefresh: () => void;
  onPublish: () => void;
}) {
  if (loading) return <AcctLoading label="Loading Golden Report projects" />;

  if (projects.length === 0) {
    return (
      <p className="rx-flat m-0 p-4 text-center text-[13px] leading-normal text-rx-text-2">
        No Golden Report projects are linked to your account email. If you
        should have access, ask the RaptorX team to add your email for your
        project&apos;s contract.
      </p>
    );
  }

  const current = projects[ix];
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="rx-h3">
          Golden Report{" "}
          <span className="font-medium text-rx-text-2">· Team updates</span>
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || saving}
          className="rx-icon-btn rx-icon-btn--s disabled:cursor-not-allowed disabled:opacity-50"
          title="Refresh latest team updates from database"
          aria-label="Refresh Team Updates"
        >
          <RefreshCw
            className={clsx("size-3.5", refreshing && "animate-spin")}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className="rx-small m-0">
        Share the latest official update for token holders. It appears in the
        Team Updates section of your Golden Report.
      </p>
      {projects.length > 1 ? (
        <label className="rx-field">
          <span className="rx-label">Project</span>
          <select
            value={ix}
            onChange={(e) => onSelect(Number(e.target.value))}
            className="acct-select"
          >
            {projects.map((proj, i) => (
              <option key={`${proj.chain}:${proj.contractAddress}`} value={i}>
                {proj.contractAddress.slice(0, 6)}…
                {proj.contractAddress.slice(-4)} ({proj.chain})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <GoldenTeamUpdatesEditor
        documentKey={`${current?.contractAddress ?? ""}-${current?.chain ?? ""}-${current?.teamUpdatesPublishedAt ?? ""}`}
        markdown={draft}
        onMarkdownChange={onDraftChange}
        placeholder="Share the latest official update for token holders…"
        disabled={saving}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onPublish}
          disabled={saving || !dirty}
          aria-busy={saving || undefined}
          className="rx-btn rx-btn--primary"
        >
          {saving ? (
            <>
              <span className="rx-spin" aria-hidden="true" />
              Publishing…
            </>
          ) : (
            "Publish"
          )}
        </button>
      </div>
    </>
  );
}
