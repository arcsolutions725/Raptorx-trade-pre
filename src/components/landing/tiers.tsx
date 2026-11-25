/** RaptorX tier badges, ported from design/js/tiers.js (display only, rendered on the server). */

type Tier = {
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

// Claw slashes: tapered curved strokes, like the logo's talons.
const slash = (x: number) =>
  `M${x - 3.2} 13.5 C${x - 1.2} 20 ${x + 1.4} 25 ${x + 4.2} 31.5 C${x + 2.2} 25.6 ${x + 0.6} 20.4 ${x - 0.6} 13.2 Z`;

function Marks({ n }: { n: Tier["marks"] }) {
  if (n === 0)
    return (
      <>
        <ellipse cx="20" cy="22.5" rx="6.2" ry="7.8" fill="currentColor" opacity=".95" />
        <path
          d="M14.4 21.5l2.6 1.7 2.1-2.1 2.4 2.3 2.2-1.9 2.4 1.6"
          fill="none"
          stroke="#353433"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </>
    );
  const xs = n === 1 ? [19] : n === 2 ? [15.6, 22.2] : [12.6, 18.8, 25];
  return (
    <>
      {xs.map((x) => (
        <path key={x} d={slash(x)} fill="currentColor" />
      ))}
    </>
  );
}

export function TierBadge({ tierKey, size = 22 }: { tierKey: string; size?: number }) {
  const t = TIERS.find((x) => x.k === tierKey);
  if (!t) return null;
  const id = `lp-tg-${t.k}`;
  return (
    <svg
      className={`tier-badge tier-badge--${t.k}`}
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 40 44"
      role="img"
      aria-label={`${t.name} tier`}
      style={{ color: t.ink }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.a} />
          <stop offset="1" stopColor={t.b} />
        </linearGradient>
      </defs>
      <path d="M20 1.5 37 8v14.2c0 9.6-7.1 16.9-17 20.3C10.1 39.1 3 31.8 3 22.2V8Z" fill={`url(#${id})`} />
      <path
        d="M20 5.2 33.6 10.4v11.8c0 7.8-5.6 13.8-13.6 16.8-8-3-13.6-9-13.6-16.8V10.4Z"
        fill="#120C08"
        opacity=".62"
      />
      <path d="M20 1.5 37 8v2L20 3.6 3 10V8Z" fill="#fff" opacity=".35" />
      {t.crown ? <path d="M13 9.6l2.6 2.6L20 7.4l4.4 4.8L27 9.6l-1 4.2H14Z" fill="#FFD670" /> : null}
      <Marks n={t.marks} />
    </svg>
  );
}
