export type ProjectSocialLinks = {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  reddit?: string;
  instagram?: string;
};

type DexInfo = {
  websites?: { label?: string; url?: string }[];
  socials?: { type?: string; url?: string }[];
};

function absUrl(raw?: string | null): string | undefined {
  const s = (raw || "").trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s.replace(/^\/+/, "")}`;
}

function classifyHost(url: string): keyof ProjectSocialLinks | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com") return "twitter";
    if (
      host === "t.me" ||
      host === "telegram.me" ||
      host === "telegram.org" ||
      host.endsWith(".t.me")
    ) {
      return "telegram";
    }
    if (host.includes("discord")) return "discord";
    if (host.includes("reddit.com")) return "reddit";
    if (host.includes("instagram.com")) return "instagram";
    return "website";
  } catch {
    return undefined;
  }
}

function setIfEmpty(
  out: ProjectSocialLinks,
  key: keyof ProjectSocialLinks,
  url?: string,
) {
  const abs = absUrl(url);
  if (!abs || out[key]) return;
  out[key] = abs;
}

/** Pull official website + socials from DexScreener (and optional extras). */
export function collectProjectSocials(input: {
  info?: DexInfo | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  discord?: string | null;
  reddit?: string | null;
  instagram?: string | null;
}): ProjectSocialLinks {
  const out: ProjectSocialLinks = {};

  for (const site of input.info?.websites || []) {
    const url = absUrl(site?.url);
    if (!url) continue;
    const kind = classifyHost(url) || "website";
    setIfEmpty(out, kind, url);
  }

  for (const social of input.info?.socials || []) {
    const url = absUrl(social?.url);
    if (!url) continue;
    const type = String(social?.type || "").toLowerCase();
    const fromType: keyof ProjectSocialLinks | undefined =
      type === "twitter" || type === "x"
        ? "twitter"
        : type === "telegram"
          ? "telegram"
          : type === "discord"
            ? "discord"
            : type === "reddit"
              ? "reddit"
              : type === "instagram"
                ? "instagram"
                : type === "website"
                  ? "website"
                  : classifyHost(url);
    if (fromType) setIfEmpty(out, fromType, url);
  }

  setIfEmpty(out, "website", input.website || undefined);
  setIfEmpty(out, "twitter", input.twitter || undefined);
  setIfEmpty(out, "telegram", input.telegram || undefined);
  setIfEmpty(out, "discord", input.discord || undefined);
  setIfEmpty(out, "reddit", input.reddit || undefined);
  setIfEmpty(out, "instagram", input.instagram || undefined);

  return out;
}

export function hasProjectSocials(links?: ProjectSocialLinks | null): boolean {
  if (!links) return false;
  return Boolean(
    links.website ||
      links.twitter ||
      links.telegram ||
      links.discord ||
      links.reddit ||
      links.instagram,
  );
}
