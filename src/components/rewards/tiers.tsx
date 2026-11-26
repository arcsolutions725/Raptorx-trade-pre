/**
 * RaptorX raptor tiers (design/js/tiers.js): worked out from season points only, display only.
 * One source for the landing page (server), Daily missions, the Leaderboard, the Account popup and
 * the PNL share card. No client-only hooks here (useId works on the server too).
 * Styles: .tier-badge / .rw-tier / .rw-climb / .lb-tiers in styles/pages/rewards.css (.rx-acct).
 */

import { useId, type CSSProperties } from "react";

export type Tier = {
  k: string;
  name: string;
  min: number;
  a: string;
  b: string;
  ink: string;
  marks: 0 | 1 | 2 | 3;
  crown?: boolean;
};

export const TIERS: Tier[] = [
  { k: "hatchling", name: "Hatchling", min: 0, a: "#888786", b: "#454443", ink: "#E9E2D8", marks: 0 },
  { k: "fledgling", name: "Fledgling", min: 10000, a: "#E2A06C", b: "#8A4A22", ink: "#FFE6D2", marks: 1 },
  { k: "talon", name: "Talon", min: 30000, a: "#F1EEE8", b: "#8C8B8A", ink: "#FFFFFF", marks: 2 },
  { k: "raptor", name: "Raptor", min: 60000, a: "#FFD670", b: "#B97E00", ink: "#FFF4D6", marks: 3 },
  { k: "apex", name: "Apex", min: 100000, a: "#FF5A3A", b: "#9E0F1C", ink: "#FFE2A0", marks: 3, crown: true },
];

export function tierOf(points: number): Tier {
  return TIERS.reduce((t, x) => (points >= x.min ? x : t), TIERS[0]);
}

export function nextTier(t: Tier): Tier | null {
  return TIERS[TIERS.indexOf(t) + 1] ?? null;
}

/* ---------------- badge drawing (viewBox 0 0 40 44) ---------------- */

const SHIELD = "M20 1.5 37 8v14.2c0 9.6-7.1 16.9-17 20.3C10.1 39.1 3 31.8 3 22.2V8Z";
const INNER = "M20 5.2 33.6 10.4v11.8c0 7.8-5.6 13.8-13.6 16.8-8-3-13.6-9-13.6-16.8V10.4Z";
const SHINE = "M20 1.5 37 8v2L20 3.6 3 10V8Z";
const CROWN = "M13 9.6l2.6 2.6L20 7.4l4.4 4.8L27 9.6l-1 4.2H14Z";
const EGG_CRACK = "M14.4 21.5l2.6 1.7 2.1-2.1 2.4 2.3 2.2-1.9 2.4 1.6";

// Claw slashes: tapered curved strokes, like the logo's talons.
const slash = (x: number) =>
  `M${x - 3.2} 13.5 C${x - 1.2} 20 ${x + 1.4} 25 ${x + 4.2} 31.5 C${x + 2.2} 25.6 ${x + 0.6} 20.4 ${x - 0.6} 13.2 Z`;
const slashXs = (n: Tier["marks"]) => (n === 1 ? [19] : n === 2 ? [15.6, 22.2] : n === 3 ? [12.6, 18.8, 25] : []);

function Marks({ n }: { n: Tier["marks"] }) {
  if (n === 0)
    return (
      <>
        <ellipse cx="20" cy="22.5" rx="6.2" ry="7.8" fill="currentColor" opacity=".95" />
        <path d={EGG_CRACK} fill="none" stroke="#353433" strokeWidth="1.2" strokeLinejoin="round" />
      </>
    );
  return (
    <>
      {slashXs(n).map((x) => (
        <path key={x} d={slash(x)} fill="currentColor" />
      ))}
    </>
  );
}

export function TierBadge({
  tier,
  tierKey,
  size = 22,
  className,
  decorative = false,
}: {
  tier?: Tier;
  tierKey?: string;
  size?: number;
  className?: string;
  /** Hide from assistive tech when the tier name is already written next to it. */
  decorative?: boolean;
}) {
  const uid = useId();
  const t = tier ?? TIERS.find((x) => x.k === tierKey);
  if (!t) return null;
  const gradId = `tg${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className={`tier-badge tier-badge--${t.k}${className ? ` ${className}` : ""}`}
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 40 44"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `${t.name} tier` })}
      style={{ color: t.ink }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.a} />
          <stop offset="1" stopColor={t.b} />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#${gradId})`} />
      <path d={INNER} fill="#120C08" opacity=".62" />
      <path d={SHINE} fill="#fff" opacity=".35" />
      {t.crown ? <path d={CROWN} fill="#FFD670" /> : null}
      <Marks n={t.marks} />
    </svg>
  );
}

/** Paints the badge on a canvas (the PNL share card) with Path2D, so the card never loads an SVG
 *  image and stays exportable everywhere. (x, y) is the top-left corner, w the width. */
export function paintTierBadge(c: CanvasRenderingContext2D, t: Tier, x: number, y: number, w: number) {
  const s = w / 40;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.shadowColor = "rgba(0,0,0,.6)";
  c.shadowBlur = 4 / s;
  c.shadowOffsetY = 2 / s;
  const g = c.createLinearGradient(0, 1.5, 0, 42.5);
  g.addColorStop(0, t.a);
  g.addColorStop(1, t.b);
  c.fillStyle = g;
  c.fill(new Path2D(SHIELD));
  c.shadowColor = "transparent";
  c.globalAlpha = 0.62;
  c.fillStyle = "#120C08";
  c.fill(new Path2D(INNER));
  c.globalAlpha = 0.35;
  c.fillStyle = "#fff";
  c.fill(new Path2D(SHINE));
  c.globalAlpha = 1;
  if (t.crown) {
    c.fillStyle = "#FFD670";
    c.fill(new Path2D(CROWN));
  }
  c.fillStyle = t.ink;
  if (t.marks === 0) {
    c.globalAlpha = 0.95;
    c.beginPath();
    c.ellipse(20, 22.5, 6.2, 7.8, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = "#353433";
    c.lineWidth = 1.2;
    c.lineJoin = "round";
    c.stroke(new Path2D(EGG_CRACK));
  } else {
    for (const sx of slashXs(t.marks)) c.fill(new Path2D(slash(sx)));
  }
  c.restore();
}

/* ---------------- tier progress (missions + account) ---------------- */

const fmt = (n: number) => n.toLocaleString("en-US");

/** "Talon tier · 12,550 points to Raptor" with a bar to the next tier (design `climb()`). */
export function TierClimb({ points, style }: { points: number; style?: CSSProperties }) {
  const t = tierOf(points);
  const nx = nextTier(t);
  const pct = nx ? Math.max(0, Math.min(100, Math.round(((points - t.min) / (nx.min - t.min)) * 100))) : 100;
  return (
    <div className="rw-climb rw-in" style={{ animationDelay: ".18s", ...style }}>
      <TierBadge tier={t} size={40} decorative />
      <div className="rw-climb__body">
        <div className="rw-climb__row">
          <b>{t.name} tier</b>
          <span>
            {nx ? (
              <>
                <b>{fmt(nx.min - points)}</b> points to {nx.name}
              </>
            ) : (
              "Top tier reached"
            )}
          </span>
        </div>
        <div
          className="rx-bar"
          role="progressbar"
          aria-label={nx ? `Progress to ${nx.name} tier` : `${t.name} tier`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      {nx ? <TierBadge tier={nx} size={26} /> : null}
    </div>
  );
}
