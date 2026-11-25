"use client";

/**
 * Presentation for the Account popup and My orders and positions (prototype design/js/shell.js
 * `account:` view and design/orders.html): the modal shell (centred dialog, bottom sheet on phones),
 * the profile hero, the orders / trade-history links and the key-value list.
 * Everything here takes props only; AccountModal and MarketInfoModal own the data and actions.
 * Styles: styles/pages/account.css (scoped under .rx-acct, the portal root).
 */

import "@/styles/pages/account.css";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import clsx from "clsx";
import { ArrowRight, Check, Clock, Copy, List, X } from "lucide-react";

/* ---------------- modal shell ---------------- */

type AcctModalProps = {
  /** id of the heading that names the dialog */
  labelledBy: string;
  /** "rw": Account and referrals (warm aura); "orders": wide orders dialog */
  variant: "rw" | "orders";
  /** The dialog box. Callers use it for their click-outside handling. */
  modalRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

const noopSubscribe = () => () => {};

/** Portal to <body>: a scrim plus the dialog. Locks page scroll and restores focus on close. */
export function AcctModal({
  labelledBy,
  variant,
  modalRef,
  children,
}: AcctModalProps) {
  const lastFocus = useRef<Element | null>(null);
  // false on the server and while hydrating (no <body> portal there), true for client renders
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!isClient) return;
    lastFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      const el = lastFocus.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
    };
  }, [isClient, modalRef]);

  if (!isClient) return null;

  return createPortal(
    <div className="rx-acct">
      <div className="acct-scrim" aria-hidden="true" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={clsx(
          "acct-modal",
          variant === "rw" && "acct-modal--rw",
          variant === "orders" && "acct-modal--orders",
        )}
      >
        {variant === "rw" ? (
          <div className="acct-aura" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function AcctModalHead({
  id,
  title,
  eyebrow,
  description,
  onClose,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
}) {
  return (
    <div className="acct-modal__head">
      <div className="min-w-0">
        {eyebrow ? <span className="rx-eyebrow">{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <button
        type="button"
        className="rx-icon-btn rx-icon-btn--s"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Underlined view tabs (rx-tabs). */
export function AcctTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  idPrefix,
}: {
  tabs: readonly (readonly [T, ReactNode])[];
  active: T;
  onChange: (tab: T) => void;
  label: string;
  idPrefix: string;
}) {
  return (
    <div className="rx-tabs" role="tablist" aria-label={label}>
      {tabs.map(([key, text]) => (
        <button
          key={key}
          id={`${idPrefix}-tab-${key}`}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={clsx("rx-tab", active === key && "is-active")}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/* ---------------- avatar ---------------- */

const ANIMALS = [
  "giraffe",
  "panda",
  "dragon",
  "falcon",
  "bear",
  "fox",
  "raven",
  "zebra",
  "eagle",
  "shark",
  "wolf",
  "tiger",
] as const;

/** Avatar art from the animal in the username ("Raven8413" → raven); other names get a stable pick. */
export function animalAvatarSrc(username: string): string {
  const lower = username.toLowerCase();
  const named = ANIMALS.find((a) => lower.startsWith(a));
  if (named) return `/images/avatars/${named}.webp`;
  let h = 0;
  for (const c of username) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/images/avatars/${ANIMALS[h % ANIMALS.length]}.webp`;
}

/* ---------------- profile ---------------- */

export function ProfileHero({
  username,
  points,
}: {
  username: string;
  points: number;
}) {
  return (
    <div className="ac-hero acct-in">
      <span className="ac-av">
        <Image
          src={animalAvatarSrc(username)}
          alt=""
          width={84}
          height={84}
        />
      </span>
      <div className="ac-hero__t">
        <span className="ac-hero__name">{username}</span>
        <span className="ac-hero__pts">{points.toLocaleString()} points</span>
      </div>
    </div>
  );
}

export type OrdersTabKey = "positions" | "trades";

/** "My orders and positions" and "Trade history": open the orders dialog on that tab. */
export function ProfileLinks({
  onOpen,
}: {
  onOpen: (tab: OrdersTabKey) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="rx-btn rx-btn--secondary rx-btn--block ac-link"
        onClick={() => onOpen("positions")}
      >
        <span>
          <List className="size-[15px]" aria-hidden="true" />
          My orders and positions
        </span>
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rx-btn rx-btn--secondary rx-btn--block ac-link"
        onClick={() => onOpen("trades")}
      >
        <span>
          <Clock className="size-[15px]" aria-hidden="true" />
          Trade history
        </span>
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
    </>
  );
}

export const truncateAddress = (address: string) => {
  if (!address || address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

export function CopyIconButton({
  done,
  onClick,
  label,
}: {
  done: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("acct-copy", done && "is-done")}
      title={done ? "Copied" : "Copy address"}
      aria-label={done ? "Copied" : label}
    >
      {done ? (
        <Check className="size-[13px]" aria-hidden="true" />
      ) : (
        <Copy className="size-[13px]" aria-hidden="true" />
      )}
    </button>
  );
}

/** Username, the one Base wallet, email and member-since date. */
export function ProfileDetails({
  username,
  baseWallet,
  email,
  memberSince,
  copied,
  onCopyWallet,
}: {
  username: string;
  baseWallet?: string | null;
  email?: string | null;
  memberSince: string;
  copied: boolean;
  onCopyWallet: () => void;
}) {
  return (
    <dl className="rx-flat acct-kv">
      <div className="acct-kv__row">
        <dt>Username</dt>
        <dd>{username}</dd>
      </div>
      <div className="acct-kv__row">
        <dt>Base wallet</dt>
        <dd className={baseWallet ? "rx-num" : undefined}>
          {baseWallet ? (
            <>
              <span title={baseWallet}>{truncateAddress(baseWallet)}</span>
              <CopyIconButton
                done={copied}
                onClick={onCopyWallet}
                label="Copy Base wallet address"
              />
            </>
          ) : (
            <span className="text-rx-text-3">Not connected</span>
          )}
        </dd>
      </div>
      <div className="acct-kv__row">
        <dt>Email</dt>
        <dd>
          {email || <span className="text-rx-text-3">Not provided</span>}
        </dd>
      </div>
      <div className="acct-kv__row">
        <dt>Member since</dt>
        <dd className="rx-num">{memberSince}</dd>
      </div>
    </dl>
  );
}

/** Centred spinner for the popup body. */
export function AcctLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="o-loading" role="status">
      <span className="rx-spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}
