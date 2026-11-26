"use client";

/**
 * Daily missions popup (prototype design/js/shell.js `missions:` view, design/css/rewards.css).
 * Shell: AcctModal (reward family, warm aura). Styles: styles/pages/rewards.css.
 * Data and behaviour are unchanged: /api/daily-tasks on open, close via X or the footer button.
 * Left out (main has no such data): raptor tiers / tier climb, the reset countdown, per-task links.
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
import clsx from "clsx";
import {
  Check,
  CircleAlert,
  Clock,
  FileText,
  MessageCircle,
  Zap,
} from "lucide-react";
import type { DailyTasksStatus } from "@/app/api/daily-tasks/route";
import {
  AcctEmpty,
  AcctLoading,
  AcctModal,
  AcctModalHead,
} from "@/components/ui/modal/accountUi";

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

  useEffect(() => {
    if (isOpen && userId) {
      fetchDailyTasks();
    }
  }, [isOpen, userId]);

  // Page scroll is locked by the modal shell (AcctModal) while the dialog is open.

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
    <AcctModal labelledBy="dm-title" variant="rw" modalRef={modalRef}>
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
          <MissionsView tasks={tasks} userPoints={userPoints} />
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
        <button
          type="button"
          onClick={onClose}
          className="rx-btn rx-btn--primary rx-btn--block"
        >
          {tasks?.isCompleted ? "Awesome" : "Let's go"}
        </button>
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
};

function MissionsView({
  tasks,
  userPoints,
}: {
  tasks: DailyTasksStatus;
  userPoints: number;
}) {
  const missions: Mission[] = [
    {
      key: "reports",
      title: "Generate 3 reports",
      done: tasks.reportsCompleted,
      of: tasks.reportsRequired,
      icon: <FileText className="size-5" aria-hidden="true" />,
    },
    {
      key: "queries",
      title: "Ask 3 follow-up questions",
      done: tasks.queriesCompleted,
      of: tasks.queriesRequired,
      icon: <MessageCircle className="size-5" aria-hidden="true" />,
    },
  ];
  const stepsDone = missions.reduce((a, m) => a + Math.min(m.done, m.of), 0);
  const stepsAll = missions.reduce((a, m) => a + m.of, 0);
  const missionsDone = missions.filter((m) => m.done >= m.of).length;

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
              Your points <b>{userPoints.toLocaleString()}</b>
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
              {m.done > 0 ? (
                <span className="dm-earned">+{m.done * 100}</span>
              ) : (
                <span aria-hidden="true" />
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

      <h3 className="rx-h3">How it works</h3>
      <ul className="dm-how">
        <li>
          <FileText className="size-3.5" aria-hidden="true" />
          Generate a token analysis report.
        </li>
        <li>
          <MessageCircle className="size-3.5" aria-hidden="true" />
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

      <div className="acct-alert">
        <p>
          <b>Earn from referrals.</b> Earn points by referring your friends.
          Your referral link is in the Account section on the top right.
        </p>
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
