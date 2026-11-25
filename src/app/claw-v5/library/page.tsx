"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { ChevronRight, MessageSquare, Plus, Search } from "lucide-react";
import RexHeader from "@/components/ui/layout/Header";
import Footer from "@/components/ui/layout/Footer";
import {
  getChatsFromStorage,
  saveChatsToStorage,
  type Chat,
} from "@/lib/storage/chatStorage";

/**
 * Claw AI 5.0 · chat history ("Chats and Library" in the design prototype).
 * Reads the same data as the Claw sidebar: the cached list in localStorage, refreshed from
 * GET /api/claw-v5/chats once the user is known. The prototype's "Library" tab (saved
 * answers and reports) has no backend yet, so only the chats view is shown.
 */

type Group = "Today" | "Yesterday" | "Previous 7 days" | "Older";
const GROUPS: Group[] = ["Today", "Yesterday", "Previous 7 days", "Older"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function groupFor(date: Date, now: Date): Group {
  const day = 86_400_000;
  const diff = startOfDay(now) - startOfDay(date);
  if (diff <= 0) return "Today";
  if (diff <= day) return "Yesterday";
  if (diff <= 7 * day) return "Previous 7 days";
  return "Older";
}

function timeLabel(date: Date, group: Group): string {
  if (group === "Today" || group === "Yesterday") {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Wraps matches of `q` in <mark> (case-insensitive). */
function highlight(text: string, q: string) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const at = lower.indexOf(q, i);
    if (at === -1) {
      out.push(text.slice(i));
      break;
    }
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={k++}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  return out;
}

export default function ClawLibraryPage() {
  const { authenticated: privyAuthenticated, user: privyUser, ready } =
    usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } =
    usePhantomConnect();
  const authenticated = privyAuthenticated || phantomAuthenticated;

  const [chats, setChats] = useState<Chat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Cached chats + ?q= from the sidebar search, on mount (client only).
  useEffect(() => {
    setChats(getChatsFromStorage());
    setLoaded(true);
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setQuery(q);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, []);

  // Resolve the user id (same request as the Claw pages).
  useEffect(() => {
    const fetchUser = async () => {
      if (!ready && !phantomAuthenticated) return;
      const authId = privyUser?.id || phantomUser?.id;
      if (!authenticated || !authId) {
        setCurrentUserId("");
        return;
      }
      try {
        let email: string | undefined;
        if (phantomUser?.email) {
          email = phantomUser.email;
        } else if (privyUser) {
          const privyUserWithEmail = privyUser as {
            email?: { address?: string } | string;
          };
          email =
            (typeof privyUserWithEmail.email === "object" &&
              privyUserWithEmail.email?.address) ||
            (typeof privyUserWithEmail.email === "string" &&
              privyUserWithEmail.email) ||
            undefined;
        }
        const res = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(privyUser?.id
              ? { privyId: privyUser.id }
              : { phantomId: phantomUser!.id }),
            email,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data?.user?.id || "");
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    };
    fetchUser();
  }, [
    ready,
    authenticated,
    privyUser,
    phantomUser,
    phantomAuthenticated,
  ]);

  // Refresh the list from the backend once the user is known.
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/claw-v5/chats?userId=${currentUserId}`);
        if (!res.ok) return;
        const data = await res.json();
        const fetched: Chat[] = data.chats || [];
        saveChatsToStorage(fetched);
        if (!cancelled) setChats(getChatsFromStorage());
      } catch (error) {
        console.error("Error fetching chats:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // Keep ?q= in the URL so a search can be shared or reloaded.
  useEffect(() => {
    if (!loaded) return;
    const url = query.trim()
      ? `${window.location.pathname}?q=${encodeURIComponent(query.trim())}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, [query, loaded]);

  // "/" focuses the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const now = new Date();
    return chats
      .map((chat) => {
        const first = chat.messages?.[0]?.content?.trim() || "";
        // The title is the first 50 characters of the opening question; show the full
        // question underneath when it adds something.
        const preview =
          first && first !== chat.title.trim() ? first : "";
        const date = new Date(chat.updatedAt || chat.createdAt);
        const valid = !Number.isNaN(date.getTime());
        const group: Group = valid ? groupFor(date, now) : "Older";
        return {
          chat,
          preview,
          group,
          time: valid ? timeLabel(date, group) : "",
        };
      })
      .filter(
        (r) =>
          !q ||
          `${r.chat.title} ${r.preview}`.toLowerCase().includes(q),
      );
  }, [chats, q]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <RexHeader onHistoryClick={() => {}} showExchangeButton={false} />

      <main className="custom-chat-messages-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-[18px] px-[14px] pt-[18px] pb-10 md:px-[var(--claw-gutter)] md:pt-8 md:pb-12">
          <nav
            className="flex min-w-0 items-center gap-2 text-[13px] text-rx-text-3"
            aria-label="Breadcrumb"
          >
            <Link
              href="/claw-v5"
              className="shrink-0 text-rx-text-2 hover:text-rx-gold-hi"
            >
              Claw AI 5.0
            </Link>
            <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden="true" />
            <span aria-current="page" className="truncate text-rx-text">
              Chats and Library
            </span>
          </nav>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="claw-mark" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="claw-ico claw-logo"
                  src="/images/claw-logo-96.webp"
                  width={28}
                  height={28}
                  alt=""
                />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="rx-eyebrow">Claw AI 5.0</span>
                <h1 className="lib-title">Your chats</h1>
              </div>
            </div>
            <Link href="/claw-v5" className="rx-btn rx-btn--claw">
              <Plus className="size-[15px]" aria-hidden="true" />
              New chat
            </Link>
          </div>

          <div className="rx-tabs" role="tablist" aria-label="View">
            <span
              className="rx-tab is-active"
              role="tab"
              aria-selected="true"
            >
              <MessageSquare className="size-3.5" aria-hidden="true" />
              Chats
              <span className="rx-badge rx-badge--neutral rx-num h-5 px-1.5 text-[10px]">
                {chats.length}
              </span>
            </span>
          </div>

          <label className="rx-input h-12 rounded-[14px] text-[15px]">
            <Search className="size-4 shrink-0 text-rx-text-3" aria-hidden="true" />
            <span className="sr-only">Search your chats</span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search your chats"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="rx-kbd hidden sm:inline">/</span>
          </label>

          {rows.length > 0 ? (
            <div className="flex flex-col gap-5">
              {GROUPS.map((g) => {
                const list = rows.filter((r) => r.group === g);
                if (list.length === 0) return null;
                return (
                  <section key={g} className="flex flex-col gap-1.5" aria-label={g}>
                    <span className="rx-eyebrow px-1 pb-1">{g}</span>
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {list.map(({ chat, preview, time }) => (
                        <li key={chat.id}>
                          <Link href={`/claw-v5/${chat.id}`} className="lib-row">
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-rx-line bg-rx-surface-2 text-rx-gold-hi"
                              aria-hidden="true"
                            >
                              <MessageSquare className="size-[15px]" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                              <span className="truncate text-sm font-semibold text-rx-text">
                                {highlight(chat.title, q)}
                              </span>
                              {preview && (
                                <span className="truncate text-[13px] text-rx-text-3">
                                  {highlight(preview, q)}
                                </span>
                              )}
                            </span>
                            {time && (
                              <time
                                className="rx-num hidden shrink-0 text-[11px] text-rx-text-3 md:inline"
                                dateTime={chat.updatedAt}
                              >
                                {time}
                              </time>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : loaded ? (
            <div className="rx-raised flex flex-col items-center gap-2.5 px-3 py-7 text-center">
              <span className="claw-mark claw-mark--l" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="claw-ico claw-logo"
                  src="/images/claw-logo-96.webp"
                  width={28}
                  height={28}
                  alt=""
                />
              </span>
              <span className="lib-empty-title">
                {q ? "Nothing matches that search" : "No chats yet"}
              </span>
              <span className="max-w-[300px] text-[13px] text-rx-text-2">
                {q
                  ? "Try fewer words, or start a new chat and ask Claw."
                  : authenticated
                    ? "Ask Claw about a token or a market to start."
                    : "Sign in and ask Claw about a token or a market to start."}
              </span>
              <Link href="/claw-v5" className="rx-btn rx-btn--secondary rx-btn--s">
                Start a new chat
              </Link>
            </div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
