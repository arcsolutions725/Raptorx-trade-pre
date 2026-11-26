"use client";

/**
 * Daily missions popup (prototype design/js/shell.js `missions:` view, design/css/rewards.css).
 * Shell: AcctModal (reward family, warm aura). Styles: styles/pages/rewards.css.
 * Data is unchanged: /api/daily-tasks on open. Close via X, Esc or the scrim.
 * Each open mission has a Go button to where it is done: reports → the RexScreener list
 * ("Find a token"); follow-up questions → the page's Rex Pilot sidebar ("Ask Claw", the report
 * chat that /api/conversations/…/message counts; Claw AI 5.0 chats don't). "Get link" opens the
 * Account popup on its Referrals tab, the footer goes to Claw AI 5.0.
 * "Resets in" counts down to the server's next reset (lastResetDate + 24h); the tier climb bar
 * comes from the user's points (components/rewards/tiers).
 */

import "@/styles/pages/rewards.css";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, CircleAlert, Clock, FileText, Zap } from "lucide-react";
import type { DailyTasksStatus } from "@/app/api/daily-tasks/route";
import {
  AcctEmpty,
  AcctLoading,
  AcctModal,
  AcctModalHead,
} from "@/components/ui/modal/accountUi";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import {
  REX_SCREENER_ALL_HREF,
  isScreenerChainSlug,
} from "@/lib/rexscreenerRoutes";
import { markClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";
import { TierClimb } from "@/components/rewards/tiers";

/** The claw talon (design sprite #i-claw), for the follow-up question mission. */
function ClawIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 21c3-5 7-9 14-17-1 7-5 12-11 16z" fill="currentColor" />
    </svg>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Next reset: the server's day start + 24h (its midnight, UTC on Vercel); local midnight without it. */
function nextResetAt(lastResetDate: string | null): number {
  const start = lastResetDate ? Date.parse(lastResetDate) : NaN;
  if (Number.isFinite(start)) return start + DAY_MS;
  const m = new Date();
  m.setHours(24, 0, 0, 0);
  return m.getTime();
}

/** "5h 07m" until the daily reset, refreshed every 30 seconds. */
function useResetCountdown(lastResetDate: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((nextResetAt(lastResetDate) - now) / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

/** RexScreener keeps its Rex Pilot sidebar mounted and marks its wrapper aria-hidden while it is
 *  closed. The "pilot" shell action toggles the sidebar, so it is only sent when it is closed. */
function isPilotSidebarOpen(): boolean {
  if (typeof document === "undefined") return false;
  const host = document.querySelector(".rx-pilot")?.closest("[aria-hidden]");
  return host?.getAttribute("aria-hidden") === "false";
}

interface DailyTasksPopupProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DailyTasksPopup({
  userId,
  isOpen,
  onClose,
}: DailyTasksPopupProps) {
  const [tasks, setTasks] = useState<DailyTasksStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [userPoints, setUserPoints] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isOpen && userId) {
      fetchDailyTasks();
    }
  }, [isOpen, userId]);

  // Esc closes the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Page scroll is locked by the modal shell (AcctModal) while the dialog is open.

  /** "Find a token": the RexScreener list, where reports are generated (a list page stays put). */
  const goFindToken = () => {
    onClose();
    const segments = (pathname ?? "").split("/").filter(Boolean);
    const onList = segments.length === 1 && isScreenerChainSlug(segments[0]);
    if (!onList) router.push(REX_SCREENER_ALL_HREF);
  };
  /** "Ask Claw": the page's Rex Pilot sidebar (Claw AI 5.0), where report follow-ups are asked. */
  const goAskClaw = () => {
    onClose();
    if (!isPilotSidebarOpen()) requestShellAction("pilot");
  };
  /** "Get link": the Account popup on its Referrals tab, where the referral link is. */
  const goReferrals = () => {
    onClose();
    requestShellAction("referrals");
  };

  const fetchDailyTasks = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const response = await fetch("/api/daily-tasks", {
        headers: {
          "x-user-id": userId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
        setUserPoints(data.user.totalPoints);
      }
    } catch (error) {
      console.error("Failed to fetch daily tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AcctModal
      labelledBy="dm-title"
      variant="rw"
      modalRef={modalRef}
      onScrimClick={onClose}
    >
      <AcctModalHead
        id="dm-title"
        title="Daily missions"
        description="Complete tasks to earn points"
        onClose={onClose}
      />

      <div className="acct-modal__body">
        {loading ? (
          <AcctLoading label="Loading tasks" />
        ) : tasks ? (
          <MissionsView
            tasks={tasks}
            userPoints={userPoints}
            onFindToken={goFindToken}
            onAskClaw={goAskClaw}
            onReferrals={goReferrals}
          />
        ) : (
          <AcctEmpty
            icon={<CircleAlert className="size-5" />}
            title="Missions aren't available right now"
          >
            Try again in a moment.
          </AcctEmpty>
        )}
      </div>

      <div className="acct-modal__foot">
        <Link
          href="/claw-v5"
          className="rx-btn rx-btn--claw rx-btn--block"
          onClick={() => {
            markClawV5ScrollToInput();
            onClose();
          }}
        >
          <Image
            src="/images/claw-logo-96.webp"
            alt=""
            width={20}
            height={20}
            className="claw-ico"
          />
          Start with Claw AI
        </Link>
      </div>
    </AcctModal>
  );
}

type Mission = {
  key: string;
  title: string;
  done: number;
  of: number;
  icon: ReactNode;
  /** Where the mission is done. */
  go: { label: string; onClick: () => void };
};

function MissionsView({
  tasks,
  userPoints,
  onFindToken,
  onAskClaw,
  onReferrals,
}: {
  tasks: DailyTasksStatus;
  userPoints: number;
  onFindToken: () => void;
  onAskClaw: () => void;
  onReferrals: () => void;
}) {
  const missions: Mission[] = [
    {
      key: "reports",
      title: "Generate 3 reports",
      done: tasks.reportsCompleted,
      of: tasks.reportsRequired,
      icon: <FileText className="size-5" aria-hidden="true" />,
      go: { label: "Find a token", onClick: onFindToken },
    },
    {
      key: "queries",
      title: "Ask 3 follow-up questions",
      done: tasks.queriesCompleted,
      of: tasks.queriesRequired,
      icon: <ClawIcon />,
      go: { label: "Ask Claw", onClick: onAskClaw },
    },
  ];
  const stepsDone = missions.reduce((a, m) => a + Math.min(m.done, m.of), 0);
  const stepsAll = missions.reduce((a, m) => a + m.of, 0);
  const missionsDone = missions.filter((m) => m.done >= m.of).length;
  const resetIn = useResetCountdown(tasks.lastResetDate);

  return (
    <>
      <div className="dm-hero rw-in">
        <div className="dm-ringwrap">
          <MissionRing missions={missions} />
          <div className="dm-ringwrap__c">
            <b>
              {stepsDone}/{stepsAll}
            </b>
            <span>tasks today</span>
          </div>
        </div>
        <div className="dm-hero__t">
          <span className="rw-eyebrow">Today&apos;s hunt</span>
          <h3>
            {missionsDone} of {missions.length} missions done
          </h3>
          <div className="dm-meta">
            {tasks.isCompleted ? (
              <span className="dm-chip dm-chip--done">
                <Check className="size-3" aria-hidden="true" />
                Completed
              </span>
            ) : (
              <span className="dm-chip dm-chip--pts">
                Today&apos;s reward <b>{tasks.pointsAvailable} pts</b>
              </span>
            )}
            <span className="dm-chip">
              <Clock className="size-3" aria-hidden="true" />
              Resets in <b className="rx-num">{resetIn}</b>
            </span>
          </div>
        </div>
      </div>

      <div className="dm-list">
        {missions.map((m, i) => {
          const complete = m.done >= m.of;
          return (
            <div
              key={m.key}
              className={clsx("dm-card rw-in", complete && "is-done")}
              style={{ animationDelay: `${0.08 + i * 0.08}s` }}
            >
              <span className="dm-card__ico">
                {complete ? <Check className="size-5" aria-hidden="true" /> : m.icon}
              </span>
              <div className="dm-card__t">
                <b>{m.title}</b>
                <div
                  className="dm-pips"
                  role="img"
                  aria-label={`${m.done} of ${m.of} done`}
                >
                  {Array.from({ length: m.of }, (_, k) => (
                    <i key={k} className={k < m.done ? "on" : undefined} />
                  ))}
                </div>
                <span className="dm-card__m">
                  {m.done}/{m.of} done · <b>+100</b> pts each
                </span>
              </div>
              {complete ? (
                <span className="dm-earned">+{m.done * 100}</span>
              ) : (
                <button
                  type="button"
                  className="rx-btn rx-btn--report rx-btn--s dm-go"
                  onClick={m.go.onClick}
                >
                  {m.go.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {tasks.isCompleted && (
        <div className="acct-alert acct-alert--up rw-in" role="status">
          <Check className="size-4" aria-hidden="true" />
          <p>
            <b>Mission completed!</b> You have earned 600 points today. Keep up
            the great work!
          </p>
        </div>
      )}

      <TierClimb points={userPoints} />

      <h3 className="rx-h3">How it works</h3>
      <ul className="dm-how">
        <li>
          <FileText className="size-3.5" aria-hidden="true" />
          Generate a token analysis report.
        </li>
        <li>
          <ClawIcon size={14} />
          Ask a follow-up question about any report.
        </li>
        <li>
          <Clock className="size-3.5" aria-hidden="true" />
          Tasks reset daily at midnight.
        </li>
        <li>
          <Zap className="size-3.5" aria-hidden="true" />
          Each completed task earns 100 points.
        </li>
      </ul>

      <div className="acct-alert dm-ref">
        <p>
          <b>Earn from referrals.</b> Invite friends with your referral link in
          Account.
        </p>
        <button
          type="button"
          className="rx-btn rx-btn--report rx-btn--s"
          onClick={onReferrals}
        >
          Get link
        </button>
      </div>
    </>
  );
}

/** One arc per task step (6 in all); finished steps draw in with the ember gradient. */
function MissionRing({ missions }: { missions: Mission[] }) {
  const gradId = `dm-grad-${useId().replace(/:/g, "")}`;
  const steps = missions.flatMap((m) =>
    Array.from({ length: m.of }, (_, i) => i < m.done),
  );
  if (steps.length === 0) return null;
  const R = 56;
  const C = 2 * Math.PI * R;
  const gap = steps.length > 1 ? 7 : 0;
  const L = C / steps.length - gap;
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF6A13" />
          <stop offset="1" stopColor="#FFD15C" />
        </linearGradient>
      </defs>
      {steps.map((done, i) => (
        <circle
          key={i}
          className={clsx("seg", done && "is-done")}
          cx="66"
          cy="66"
          r={R}
          style={
            {
              strokeDasharray: `${L.toFixed(1)} ${(C - L).toFixed(1)}`,
              strokeDashoffset: `${(-i * (L + gap)).toFixed(1)}`,
              ...(done
                ? {
                    stroke: `url(#${gradId})`,
                    animationDelay: `${0.3 + i * 0.15}s`,
                  }
                : null),
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}
