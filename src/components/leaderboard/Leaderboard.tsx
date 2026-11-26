"use client";

/**
 * Leaderboard (prototype design/js/shell.js `leaderboard:` view, design/css/rewards.css):
 * "The apex three" podium, the full ranked list with pages, and the "You" card.
 * Renders the popup body and footer for LeaderboardModal (AcctModal shell, reward family).
 * Data and behaviour are unchanged (useLeaderboard: pages, page size, current user's rank).
 * Main's badge names stand in for the prototype's raptor tiers; the tier legend is left out.
 */

import "@/styles/pages/rewards.css";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Crown, Users } from "lucide-react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";
import {
  AcctEmpty,
  AcctLoading,
  animalAvatarSrc,
} from "@/components/ui/modal/accountUi";

export type LeaderboardView = "podium" | "table";

interface LeaderboardProps {
  currentUserId?: string;
  /** Controlled view (the modal widens for the full list). Uncontrolled when omitted. */
  view?: LeaderboardView;
  onViewChange?: (view: LeaderboardView) => void;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/* ============================ Podium ============================ */

type PodiumUser = Pick<
  LeaderboardEntry,
  "id" | "username" | "points" | "rank" | "badge"
>;

function PodiumSpot({
  user,
  position,
}: {
  user: PodiumUser | undefined;
  position: 1 | 2 | 3;
}) {
  const size = position === 1 ? 100 : 72;
  return (
    <div
      className={clsx("pd__p", `pd__p--${position}`, !user && "is-empty")}
    >
      {position === 1 && user ? (
        <Crown className="pd__crown size-8" aria-hidden="true" />
      ) : null}
      <span className="pd__av">
        {user ? (
          <Image
            src={animalAvatarSrc(user.username)}
            alt=""
            width={size}
            height={size}
          />
        ) : null}
      </span>
      <span className="pd__name" title={user?.username}>
        {user ? user.username : "Open spot"}
      </span>
      <span className="pd__pts">{user ? fmt(user.points) : "—"}</span>
      <span className="pd__base" aria-hidden="true">
        {position}
      </span>
      <span className="sr-only">
        {user ? `Rank ${position}: ${user.username}, ${fmt(user.points)} points` : `Rank ${position}: open`}
      </span>
    </div>
  );
}

/* ============================ Ranked list ============================ */

function LeaderboardRow({
  user,
  isCurrentUser,
  index,
}: {
  user: LeaderboardEntry;
  isCurrentUser: boolean;
  index: number;
}) {
  return (
    <li
      className={clsx(
        "lb-row",
        user.rank <= 3 && `lb-row--${user.rank}`,
        isCurrentUser && "is-you",
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
    >
      <span className="lb-row__r">{user.rank}</span>
      <span className="lb-row__u">
        <Image
          className="rw-av"
          src={animalAvatarSrc(user.username)}
          alt=""
          width={34}
          height={34}
        />
        <span title={user.username}>{user.username}</span>
        {isCurrentUser && <span className="rx-badge rx-badge--gold">You</span>}
      </span>
      <span className="lb-row__tier">{user.badge?.name}</span>
      <span className="lb-row__p">{fmt(user.points)}</span>
    </li>
  );
}

/* ============================ Pager (.rx-pgr) ============================ */

type Slot = number | "gap";

/** 7 slots at most: first and last always, the current page with its neighbours, "…" for gaps. */
function pageSlots(cur: number, last: number): Slot[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, "gap", last];
  if (cur >= last - 3) return [1, "gap", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "gap", cur - 1, cur, cur + 1, "gap", last];
}

function LeaderboardPager({
  page,
  totalPages,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onPage,
  pageSize,
  sizes,
  onSize,
}: {
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPage: (page: number) => void;
  pageSize: number;
  sizes: number[];
  onSize: (size: number) => void;
}) {
  const last = Math.max(1, totalPages);
  return (
    <nav className="rx-pgr" aria-label="Leaderboard pages">
      <label className="rx-pgr__size">
        <span className="rx-pgr__label">Show</span>
        <span className="rx-pgr__sel">
          <select
            value={pageSize}
            onChange={(e) => onSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown className="size-3" aria-hidden="true" />
        </span>
        <span className="rx-pgr__label">per page</span>
      </label>
      <div className="rx-pgr__nav">
        <button
          type="button"
          className="rx-btn rx-btn--secondary rx-btn--s rx-pgr__step"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          <span className="rx-pgr__label">Previous</span>
        </button>
        <ol className="rx-pgr__pages">
          {pageSlots(page, last).map((n, i) =>
            n === "gap" ? (
              <li key={`gap-${i}`} className="rx-pgr__gap" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={n}>
                <button
                  type="button"
                  className="rx-pgr__num rx-num"
                  aria-current={n === page ? "page" : undefined}
                  aria-label={`Page ${n}${n === last ? ", last page" : ""}`}
                  onClick={() => onPage(n)}
                >
                  {n}
                </button>
              </li>
            ),
          )}
        </ol>
        <span className="rx-pgr__mobile rx-num">
          Page {fmt(page)} of {fmt(last)}
        </span>
        <button
          type="button"
          className="rx-btn rx-btn--secondary rx-btn--s rx-pgr__step"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next page"
        >
          <span className="rx-pgr__label">Next</span>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/* ============================ Leaderboard ============================ */

export function Leaderboard({
  currentUserId,
  view: viewProp,
  onViewChange,
}: LeaderboardProps) {
  const {
    leaderboard,
    loading,
    error,
    pagination,
    nextPage,
    prevPage,
    setPageIndex,
    setPageSize,
  } = useLeaderboard();
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [innerView, setInnerView] = useState<LeaderboardView>("podium");
  const view = viewProp ?? innerView;
  const setView = (next: LeaderboardView) => {
    setInnerView(next);
    onViewChange?.(next);
  };

  const topThree = useMemo(() => {
    if (!leaderboard || leaderboard.length === 0) return [];
    // Ensure sorted by rank ascending, then take 1..3
    const sorted = [...leaderboard].sort((a, b) => a.rank - b.rank);
    return sorted.slice(0, 3);
  }, [leaderboard]);

  useEffect(() => {
    if (leaderboard && currentUserId) {
      const userEntry = leaderboard.find((user) => user.id === currentUserId);
      setCurrentUserRank(userEntry ? userEntry.rank : null);
    }
  }, [leaderboard, currentUserId]);

  const me = currentUserId
    ? leaderboard?.find((u) => u.id === currentUserId)
    : undefined;
  const above = me ? leaderboard?.find((u) => u.rank === me.rank - 1) : undefined;

  if (loading) {
    return (
      <div className="acct-modal__body">
        <AcctLoading label="Loading leaderboard" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="acct-modal__body">
        <AcctEmpty
          tone="error"
          icon={<CircleAlert className="size-5" />}
          title="Failed to load leaderboard"
        >
          {error}
        </AcctEmpty>
      </div>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="acct-modal__body">
        <AcctEmpty icon={<Users className="size-5" />} title="No rankings yet">
          Be the first to earn points and claim the top spot!
        </AcctEmpty>
      </div>
    );
  }

  return (
    <>
      <div className="acct-modal__body">
        <div className="lb-top rw-in">
          <div className="lb-season">
            <span className="rw-eyebrow">RaptorX top traders</span>
            <b>{view === "podium" ? "The apex three" : "Full leaderboard"}</b>
          </div>
          {pagination.totalUsers > 0 && (
            <span className="rx-small rx-num">
              {fmt(pagination.totalUsers)} traders
            </span>
          )}
        </div>

        {view === "podium" ? (
          <div className="pd">
            <PodiumSpot user={topThree[1]} position={2} />
            <PodiumSpot user={topThree[0]} position={1} />
            <PodiumSpot user={topThree[2]} position={3} />
          </div>
        ) : (
          <>
            <ol className="lb-list" aria-label="Leaderboard">
              {leaderboard.map((user, i) => (
                <LeaderboardRow
                  key={user.id}
                  user={user}
                  index={i}
                  isCurrentUser={currentUserId === user.id}
                />
              ))}
            </ol>
            <LeaderboardPager
              page={pagination.page}
              totalPages={pagination.totalPages}
              hasPrev={pagination.hasPrev}
              hasNext={pagination.hasNext}
              onPrev={prevPage}
              onNext={nextPage}
              onPage={setPageIndex}
              pageSize={pagination.pageSize}
              sizes={[25, 50]}
              onSize={setPageSize}
            />
          </>
        )}

        {currentUserRank && (
          <div className="lb-you rw-in" style={{ animationDelay: ".2s" }}>
            <span className="lb-you__rank">#{currentUserRank}</span>
            {me ? (
              <Image
                className="rw-av"
                src={animalAvatarSrc(me.username)}
                alt=""
                width={40}
                height={40}
              />
            ) : null}
            <div className="lb-you__t">
              <b>
                You
                {me?.badge?.name ? ` · ${me.badge.name}` : ""}
              </b>
              {me && me.rank === 1 ? (
                <span>Top of the leaderboard</span>
              ) : me && above ? (
                <span>
                  <b>{fmt(Math.max(0, above.points - me.points))}</b> points
                  behind {above.username}
                </span>
              ) : (
                <span>Your current rank</span>
              )}
            </div>
            {me ? <span className="lb-you__pts">{fmt(me.points)}</span> : null}
          </div>
        )}
      </div>

      <div className="acct-modal__foot">
        {view === "podium" ? (
          <button
            type="button"
            className="rx-btn rx-btn--secondary rx-btn--block"
            onClick={() => setView("table")}
          >
            Show full leaderboard
          </button>
        ) : (
          <button
            type="button"
            className="rx-btn rx-btn--secondary rx-btn--block"
            onClick={() => setView("podium")}
          >
            Back to top 3
          </button>
        )}
      </div>
    </>
  );
}
