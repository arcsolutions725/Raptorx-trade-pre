"use client";

/**
 * Internal admin dashboard for curating Golden / Pump report listings.
 *
 * Add a contract address + chain + classification (Golden or Pump); once saved it
 * appears in the corresponding list on the frontend. Talks to the existing
 * internal APIs (`/api/internal/{golden,pump}-reports/projects`), authenticating
 * with the `x-raptorx-internal-admin-secret` header (value = env
 * `INTERNAL_GOLDEN_REPORTS_ADMIN_SECRET`). The admin enters that secret once; it's
 * kept in sessionStorage for the tab only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  showSuccessNotification,
  showErrorNotification,
} from "@/components/ui/notification";

type ReportType = "golden" | "pump";

interface Project {
  id: string;
  contractAddress: string;
  chain: string;
  isGolden: boolean;
  authorizedEditorEmails: string[];
  teamUpdatesPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CHAINS: { value: string; label: string }[] = [
  { value: "solana", label: "Solana" },
  { value: "robinhood", label: "Robinhood" },
  { value: "base", label: "Base" },
  { value: "ethereum", label: "Ethereum" },
  { value: "bsc", label: "BNB Chain" },
  { value: "monad", label: "Monad" },
];

const FEE_PER_LISTING = 3000;
const SECRET_STORAGE_KEY = "raptorx_internal_admin_secret";
const PAGE_SIZE = 10;
const GOLDEN_API = "/api/internal/golden-reports/projects";
const PUMP_API = "/api/internal/pump-reports/projects";

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const chainLabel = (c: string) =>
  CHAINS.find((x) => x.value === c.toLowerCase())?.label ?? c;

const shorten = (s: string) =>
  s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;

export default function CuratedReportsDashboard() {
  // --- auth ---
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    try {
      setSecret(sessionStorage.getItem(SECRET_STORAGE_KEY));
    } catch {
      /* ignore */
    }
    setAuthChecked(true);
  }, []);

  // --- data ---
  const [golden, setGolden] = useState<Project[]>([]);
  const [pump, setPump] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  // --- form ---
  const [contractAddress, setContractAddress] = useState("");
  const [chain, setChain] = useState("solana");
  const [reportType, setReportType] = useState<ReportType>("golden");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  /** Set when a row is loaded for editing, so we can update it in place even if
   * its contract/chain changes (the backend keys on contract+chain, so a changed
   * key would otherwise leave the original row behind as a duplicate). */
  const [editingOriginal, setEditingOriginal] = useState<
    { contractAddress: string; chain: string; isGolden: boolean } | null
  >(null);

  // --- table ---
  const [activeTab, setActiveTab] = useState<ReportType>("golden");
  const [page, setPage] = useState(1);
  const [confirmTarget, setConfirmTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const authed = !!secret;

  const api = useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-raptorx-internal-admin-secret": secret ?? "",
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      return json;
    },
    [secret],
  );

  const refresh = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    try {
      const [g, p] = await Promise.all([api(GOLDEN_API), api(PUMP_API)]);
      setGolden(g.projects ?? []);
      setPump(p.projects ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      showErrorNotification("Couldn't load listings", msg);
      // Invalid secret → clear it so the gate reappears.
      if (/forbidden|403/i.test(msg)) {
        try {
          sessionStorage.removeItem(SECRET_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setSecret(null);
      }
    } finally {
      setLoading(false);
    }
  }, [api, secret]);

  useEffect(() => {
    if (secret) refresh();
  }, [secret, refresh]);

  const submitSecret = (e: React.FormEvent) => {
    e.preventDefault();
    const s = secretInput.trim();
    if (!s) return;
    try {
      sessionStorage.setItem(SECRET_STORAGE_KEY, s);
    } catch {
      /* ignore */
    }
    setSecret(s);
    setSecretInput("");
  };

  const signOut = () => {
    try {
      sessionStorage.removeItem(SECRET_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSecret(null);
    setGolden([]);
    setPump([]);
  };

  const resetForm = () => {
    setContractAddress("");
    setChain("solana");
    setReportType("golden");
    setEmails("");
    setEditingOriginal(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = contractAddress.trim();
    if (!addr) {
      showErrorNotification("Contract address is required");
      return;
    }
    const wasEditing = !!editingOriginal;
    setSaving(true);
    try {
      const url = reportType === "golden" ? GOLDEN_API : PUMP_API;
      const authorizedEditorEmails = emails
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api(url, {
        method: "POST",
        body: JSON.stringify({ contractAddress: addr, chain, authorizedEditorEmails }),
      });
      // Update in place: if the contract/chain identity changed while editing,
      // the backend keyed the save to a new row — remove the original so we
      // don't leave a duplicate behind.
      if (
        editingOriginal &&
        (editingOriginal.contractAddress.toLowerCase() !== addr.toLowerCase() ||
          editingOriginal.chain.toLowerCase() !== chain.toLowerCase())
      ) {
        const oldBase = editingOriginal.isGolden ? GOLDEN_API : PUMP_API;
        const q = `?contractAddress=${encodeURIComponent(editingOriginal.contractAddress)}&chain=${encodeURIComponent(editingOriginal.chain)}`;
        try {
          await api(oldBase + q, { method: "DELETE" });
        } catch {
          /* best-effort cleanup of the old key */
        }
      }
      showSuccessNotification(
        wasEditing ? "Listing updated" : "Listing added",
        `${shorten(addr)} · ${reportType === "golden" ? "Golden" : "Pump"} · ${chainLabel(chain)}`,
      );
      setContractAddress("");
      setEmails("");
      setEditingOriginal(null);
      setActiveTab(reportType);
      await refresh();
    } catch (e) {
      showErrorNotification("Save failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const doRemove = async () => {
    const p = confirmTarget;
    if (!p) return;
    setDeleting(true);
    try {
      const base = p.isGolden ? GOLDEN_API : PUMP_API;
      const q = `?contractAddress=${encodeURIComponent(p.contractAddress)}&chain=${encodeURIComponent(p.chain)}`;
      await api(base + q, { method: "DELETE" });
      showSuccessNotification(
        "Listing removed",
        `${shorten(p.contractAddress)} · ${p.isGolden ? "Golden" : "Pump"}`,
      );
      setConfirmTarget(null);
      await refresh();
    } catch (e) {
      showErrorNotification("Delete failed", e instanceof Error ? e.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const editInForm = (p: Project) => {
    setContractAddress(p.contractAddress);
    setChain(p.chain.toLowerCase());
    setReportType(p.isGolden ? "golden" : "pump");
    setEmails((p.authorizedEditorEmails ?? []).join(", "));
    setEditingOriginal({
      contractAddress: p.contractAddress,
      chain: p.chain,
      isGolden: p.isGolden,
    });
    showSuccessNotification("Editing listing", "Update the fields, then Save to apply.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const rows = activeTab === "golden" ? golden : pump;
  const totalRevenue = useMemo(
    () => (golden.length + pump.length) * FEE_PER_LISTING,
    [golden.length, pump.length],
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  // ---------- Secret gate ----------
  if (authChecked && !authed) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center p-4">
        <form
          onSubmit={submitSecret}
          className="w-full max-w-sm bg-[#161616] border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <div>
            <h1 className="text-lg font-semibold">Curated Reports — Admin</h1>
            <p className="text-sm text-white/50 mt-1">
              Enter the internal admin secret to manage listings.
            </p>
          </div>
          <input
            type="password"
            autoFocus
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Admin secret"
            className="w-full bg-[#0d0d0d] border border-white/15 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#F9B80C]/60"
          />
          <button
            type="submit"
            className="w-full bg-[#F9B80C] hover:bg-[#e0a800] text-black font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            Continue
          </button>
          <p className="text-[11px] text-white/30 leading-relaxed">
            Value of the <code className="text-white/50">INTERNAL_GOLDEN_REPORTS_ADMIN_SECRET</code> env var.
          </p>
        </form>
      </div>
    );
  }

  if (!authChecked) {
    return <div className="min-h-screen bg-[#0d0d0d]" />;
  }

  // ---------- Dashboard ----------
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header + revenue */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="text-2xl font-bold">Curated Reports</h1>
            <p className="text-sm text-white/50 mt-1.5 leading-relaxed">
              <span className="text-[#F9B80C] font-medium">Golden Reports</span> highlight higher-quality,
              lower-risk projects; <span className="text-white/80 font-medium">Pump Reports</span> cover
              riskier tokens with strong upside. Add a contract, pick a chain and report type, and it appears
              in the matching list on RexScreener.
            </p>
          </div>
          <div className="shrink-0 bg-[#161616] border border-white/10 rounded-2xl px-5 py-4 min-w-[220px]">
            <p className="text-xs text-white/40">Listings Revenue</p>
            <p className="text-3xl font-bold mt-1">{usd(totalRevenue)}</p>
            <p className="text-[11px] text-white/40 mt-1">
              {golden.length + pump.length} listings · {usd(FEE_PER_LISTING)} each
            </p>
          </div>
        </div>

        {/* Add / update form */}
        <div className="bg-[#161616] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-semibold">Add or update a project</h2>
            {editingOriginal && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-[#F9B80C]/15 text-[#F9B80C]">
                Editing {shorten(editingOriginal.contractAddress)}
              </span>
            )}
          </div>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Contract address</label>
              <input
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="Token contract mint / address"
                className="w-full bg-[#0d0d0d] border border-white/15 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#F9B80C]/60"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Chain</label>
                <select
                  value={chain}
                  onChange={(e) => setChain(e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-white/15 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#F9B80C]/60"
                >
                  {CHAINS.map((c) => (
                    <option key={c.value} value={c.value} className="bg-[#0d0d0d]">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Report type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as ReportType)}
                  className="w-full bg-[#0d0d0d] border border-white/15 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#F9B80C]/60"
                >
                  <option value="golden" className="bg-[#0d0d0d]">Golden</option>
                  <option value="pump" className="bg-[#0d0d0d]">Pump</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">
                Authorized editor emails <span className="text-white/30">(comma-separated, optional)</span>
              </label>
              <input
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="founder@project.com, ops@project.com"
                className="w-full bg-[#0d0d0d] border border-white/15 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#F9B80C]/60"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#F9B80C] hover:bg-[#e0a800] disabled:opacity-60 text-black font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors"
              >
                {saving
                  ? "Saving…"
                  : editingOriginal
                    ? "Update listing"
                    : `Save to ${reportType === "golden" ? "Golden" : "Pump"} list`}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="border border-white/15 hover:border-white/30 rounded-lg px-4 py-2.5 text-sm text-white/80 transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={signOut}
                className="ml-auto text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Sign out
              </button>
            </div>
          </form>
        </div>

        {/* Projects table */}
        <div className="bg-[#161616] border border-white/10 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold">Curated report projects</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="border border-white/15 hover:border-white/30 rounded-lg px-3 py-1.5 text-xs text-white/80 disabled:opacity-50 transition-colors"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
              {(["golden", "pump"] as ReportType[]).map((t) => {
                const count = t === "golden" ? golden.length : pump.length;
                const active = activeTab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? t === "golden"
                          ? "bg-[#F9B80C]/15 text-[#F9B80C] border border-[#F9B80C]/40"
                          : "bg-white/10 text-white border border-white/30"
                        : "text-white/50 border border-transparent hover:text-white/80"
                    }`}
                  >
                    {t === "golden" ? "Golden" : "Pump"} reports
                    <span className="ml-1.5 text-white/40">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-white/40 text-xs border-b border-white/10">
                  <th className="py-2.5 pr-4 font-medium">Contract</th>
                  <th className="py-2.5 pr-4 font-medium">Chain</th>
                  <th className="py-2.5 pr-4 font-medium">Report type</th>
                  <th className="py-2.5 pr-4 font-medium">Authorized emails</th>
                  <th className="py-2.5 pr-4 font-medium">Fees</th>
                  <th className="py-2.5 pr-4 font-medium">Last team publish</th>
                  <th className="py-2.5 pr-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-white/40">
                      {loading ? "Loading…" : `No ${activeTab} listings yet.`}
                    </td>
                  </tr>
                )}
                {pageRows.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 font-mono text-xs text-white/80" title={p.contractAddress}>
                      {shorten(p.contractAddress)}
                    </td>
                    <td className="py-3 pr-4 text-white/70">{chainLabel(p.chain)}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          p.isGolden
                            ? "bg-[#F9B80C]/15 text-[#F9B80C]"
                            : "bg-white/10 text-white/80"
                        }`}
                      >
                        {p.isGolden ? "Golden" : "Pump"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-white/60 text-xs max-w-[220px] truncate" title={(p.authorizedEditorEmails ?? []).join(", ")}>
                      {p.authorizedEditorEmails?.length ? p.authorizedEditorEmails.join(", ") : "— none —"}
                    </td>
                    <td className="py-3 pr-4 text-white/70">{usd(FEE_PER_LISTING)}</td>
                    <td className="py-3 pr-4 text-white/50 text-xs">
                      {p.teamUpdatesPublishedAt
                        ? new Date(p.teamUpdatesPublishedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 pr-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => editInForm(p)}
                          className="p-1.5 rounded-md text-white/50 hover:text-[#F9B80C] hover:bg-white/5 transition-colors"
                          title="Edit in form"
                          aria-label="Edit"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => setConfirmTarget(p)}
                          className="p-1.5 rounded-md text-white/50 hover:text-red-400 hover:bg-white/5 transition-colors"
                          title="Delete"
                          aria-label="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-xs text-white/50">
            <span>
              {rows.length} {activeTab} listing{rows.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded-md border border-white/10 disabled:opacity-40 hover:border-white/30 transition-colors"
              >
                Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded-md border border-white/10 disabled:opacity-40 hover:border-white/30 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !deleting && setConfirmTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-[#161616] border border-white/10 rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center">
                🗑
              </div>
              <h3 className="font-semibold text-white">Remove listing?</h3>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              This removes{" "}
              <span className="font-mono text-white/80">
                {shorten(confirmTarget.contractAddress)}
              </span>{" "}
              from the{" "}
              <span className={confirmTarget.isGolden ? "text-[#F9B80C]" : "text-white/80"}>
                {confirmTarget.isGolden ? "Golden" : "Pump"}
              </span>{" "}
              list — it will no longer appear on the frontend. This can&apos;t be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-white/70 border border-white/15 hover:border-white/30 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doRemove}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 hover:bg-red-600 text-white disabled:opacity-60 transition-colors"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
