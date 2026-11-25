import Image from "next/image";
import clsx from "clsx";
import { Globe } from "lucide-react";

/** Every source Claw can be pointed at: venues, chains and the two category levels. */
export type SourceLogoKind =
  | "internet"
  | "crypto"
  | "prediction"
  | "solana"
  | "ethereum"
  | "base"
  | "bnb"
  | "monad"
  | "polymarket"
  | "kalshi"
  | "limitless"
  | "myriad"
  | "predictfun";

/** Real venue / chain logos (hosted prototype: "real venue / chain logos in menus"). */
const LOGOS: Record<Exclude<SourceLogoKind, "internet">, { src: string; bg?: string; pad?: boolean }> = {
  crypto: { src: "/images/crypto.webp" },
  prediction: { src: "/images/predection-markets.png" },
  solana: { src: "/images/solana.png" },
  ethereum: { src: "/images/ETH_light_logo.webp" },
  base: { src: "/images/brands/base.webp" },
  bnb: { src: "/images/bnbchain.png" },
  monad: { src: "/images/monad.png" },
  polymarket: { src: "/images/brands/polymarket.webp" },
  kalshi: { src: "/images/brands/kalshi.webp" },
  limitless: { src: "/images/limitless-logo-new.webp", bg: "#c3ff01", pad: true },
  myriad: { src: "/images/myriad.webp" },
  predictfun: { src: "/images/predict-fun.webp" },
};

/**
 * Logo tile used in the composer's source menu, on the source button and next to the
 * prediction-card groups. Styles: `.menu__ico` in styles/pages/claw.css.
 * `onButton` renders the round 18px version (Internet Markets shows a bare globe there).
 */
export default function SourceLogo({
  kind,
  onButton = false,
}: {
  kind: SourceLogoKind;
  onButton?: boolean;
}) {
  if (kind === "internet") {
    if (onButton) {
      return <Globe className="size-3.5 shrink-0" aria-hidden="true" />;
    }
    return (
      <span
        className="menu__ico"
        style={{ background: "var(--rx-gold)", color: "var(--rx-gold-ink)" }}
        aria-hidden="true"
      >
        <Globe className="size-3" />
      </span>
    );
  }
  const it = LOGOS[kind];
  return (
    <span
      className={clsx("menu__ico menu__ico--logo", it.pad && "menu__ico--pad")}
      style={it.bg ? { background: it.bg } : undefined}
      aria-hidden="true"
    >
      <Image src={it.src} alt="" width={20} height={20} />
    </span>
  );
}
