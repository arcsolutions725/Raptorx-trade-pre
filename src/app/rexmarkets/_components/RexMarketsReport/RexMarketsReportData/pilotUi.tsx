"use client";

/**
 * Shared pieces of the Rex Pilot sidebar (prototype design/market.html, aside.pilot-sb):
 * icons, the claw mark, the "Ask" bar and the follow-up thread.
 * Styles: styles/pages/pilot.css (scoped under .rx-pilot).
 */

import Image from "next/image";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { formatRexPilotChatLines } from "@/lib/formatRexPilotChatLines";

type IconProps = { size?: number };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconX({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4l16 16M20 4L4 20" {...stroke} strokeWidth="2" />
    </svg>
  );
}

/** Minimize (arrows pointing in). */
export function IconMin({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" {...stroke} strokeWidth="2" />
    </svg>
  );
}

/** Expand (arrows pointing out). */
export function IconExpand({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" {...stroke} strokeWidth="2" />
    </svg>
  );
}

export function IconChev({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function IconBack({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function IconDoc({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function IconClock({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4l3 2" {...stroke} strokeWidth="2" />
    </svg>
  );
}

function IconStop({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
    </svg>
  );
}

/** Claw logo on the full-colour claw chip (prototype .claw-ico). */
export function ClawIco({ size = 17 }: IconProps) {
  return (
    <Image
      className="claw-ico"
      src="/images/claw-logo-96.webp"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}

/** Red claw square used in pane headers and next to Rex Pilot answers (prototype .sb-mark). */
export function ClawMark({ size = 16 }: IconProps) {
  return (
    <span className="sb-mark" aria-hidden="true">
      <ClawIco size={size} />
    </span>
  );
}

/** Gold report square for the News intelligence pane (prototype .sb-mark--gold). */
export function ReportMark({ size = 13 }: IconProps) {
  return (
    <span className="sb-mark sb-mark--gold" aria-hidden="true">
      <IconDoc size={size} />
    </span>
  );
}

type AskBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  isSending: boolean;
  placeholder: string;
  label: string;
  taRef: RefObject<HTMLTextAreaElement | null>;
};

/** Question box + claw "Ask" button (prototype form.sb-ask). Stop replaces Ask while an answer streams. */
export function AskBar({
  value,
  onChange,
  onSend,
  onStop,
  onKeyDown,
  isSending,
  placeholder,
  label,
  taRef,
}: AskBarProps) {
  return (
    <form
      className="sb-ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isSending) onSend();
      }}
    >
      <label className="rx-input">
        <span className="sr-only">{label}</span>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={isSending}
          rows={1}
          autoComplete="off"
        />
      </label>
      {isSending ? (
        <button
          type="button"
          className="rx-btn rx-btn--secondary"
          onClick={onStop}
          aria-label="Stop generating"
          title="Stop generating"
        >
          <IconStop />
          Stop
        </button>
      ) : (
        // always bright like the prototype; the send handlers ignore an empty question
        <button type="submit" className="rx-btn rx-btn--claw" aria-label="Send question">
          <ClawIco />
          Ask
        </button>
      )}
    </form>
  );
}

type ThreadMessage = { role: string; content: string };

/** Follow-up questions (right, bubble) and Rex Pilot answers (left, claw mark). */
export function QaThread({
  messages,
  streaming,
}: {
  messages: ThreadMessage[];
  streaming?: string;
}) {
  if (messages.length === 0 && !streaming) return null;
  return (
    <div className="qa" aria-live="polite">
      {messages.map((m, idx) =>
        m.role === "user" ? (
          <div key={idx} className="qa__me">
            {m.content}
          </div>
        ) : (
          <QaAnswer key={idx}>{formatRexPilotChatLines(m.content)}</QaAnswer>
        ),
      )}
      {streaming ? (
        <QaAnswer>
          {formatRexPilotChatLines(streaming)}
          <span className="qa__caret" aria-hidden="true" />
        </QaAnswer>
      ) : null}
    </div>
  );
}

function QaAnswer({ children }: { children: ReactNode }) {
  return (
    <div className="qa__ai">
      <ClawMark size={16} />
      <div className="qa__body">{children}</div>
    </div>
  );
}

/** Skeleton lines while something loads (prototype: rx-skel rows at 90/76/84/60/70/82%). */
export function SkeletonLines({ widths = [90, 76, 84, 60, 70, 82] }: { widths?: number[] }) {
  return (
    <div className="sb-loading" aria-hidden="true">
      {widths.map((w, i) => (
        <div key={i} className="rx-skel" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
