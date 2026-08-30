"use client";

import Image from "next/image";
import { Instagram } from "lucide-react";
import type { ProjectSocialLinks as Links } from "@/lib/api/projectSocials";
import { hasProjectSocials } from "@/lib/api/projectSocials";

type Item = {
  key: keyof Links;
  label: string;
  href: string;
};

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M19.27 5.33A17.4 17.4 0 0 0 15.16 4c-.18.32-.39.76-.53 1.1a16.1 16.1 0 0 0-5.26 0A10.6 10.6 0 0 0 8.83 4 17.3 17.3 0 0 0 4.7 5.34C1.85 9.57 1.08 13.69 1.46 17.74A17.6 17.6 0 0 0 6.9 20c.36-.49.68-1.01.96-1.56a11.5 11.5 0 0 1-1.51-.73c.13-.09.25-.19.37-.29 2.92 1.34 6.08 1.34 8.96 0 .12.1.24.2.37.29-.48.28-.99.52-1.52.73.28.55.6 1.07.96 1.56a17.5 17.5 0 0 0 5.45-2.26c.45-4.73-.77-8.81-3.63-12.45ZM8.7 14.86c-.88 0-1.6-.8-1.6-1.79s.71-1.79 1.6-1.79 1.61.8 1.6 1.79-.71 1.79-1.6 1.79Zm6.6 0c-.88 0-1.6-.8-1.6-1.79s.71-1.79 1.6-1.79 1.61.8 1.6 1.79-.72 1.79-1.6 1.79Z" />
    </svg>
  );
}

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M14.2 3.2 16.7 8c1.05-.12 2.12.3 2.88 1.12A2.6 2.6 0 0 1 22 11.6c0 .9-.47 1.7-1.18 2.16.1 3.22-3.5 5.9-8.32 5.9s-8.42-2.68-8.32-5.9A2.6 2.6 0 0 1 3 11.6c0-1.4 1.1-2.55 2.5-2.6.76-.8 1.82-1.22 2.87-1.1l2.5-4.8a.9.9 0 0 1 1.13-.4l2.2.5Zm-2.2 8.3a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Zm4.1 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3ZM9.4 15.2c.7.7 1.6 1.05 2.6 1.05s1.9-.35 2.6-1.05a.6.6 0 0 1 .85.85c-.92.92-2.14 1.4-3.45 1.4s-2.53-.48-3.45-1.4a.6.6 0 0 1 .85-.85Z" />
    </svg>
  );
}

function itemsFrom(links: Links): Item[] {
  const rows: Item[] = [];
  if (links.twitter) rows.push({ key: "twitter", label: "X", href: links.twitter });
  if (links.website)
    rows.push({ key: "website", label: "Website", href: links.website });
  if (links.telegram)
    rows.push({ key: "telegram", label: "Telegram", href: links.telegram });
  if (links.discord)
    rows.push({ key: "discord", label: "Discord", href: links.discord });
  if (links.reddit)
    rows.push({ key: "reddit", label: "Reddit", href: links.reddit });
  if (links.instagram)
    rows.push({ key: "instagram", label: "Instagram", href: links.instagram });
  return rows;
}

function SocialGlyph({ kind }: { kind: keyof Links }) {
  if (kind === "twitter") {
    return (
      <Image src="/images/x.png" alt="" width={14} height={14} className="h-3.5 w-3.5 object-contain" />
    );
  }
  if (kind === "website") {
    return (
      <Image src="/images/earth.png" alt="" width={14} height={14} className="h-3.5 w-3.5 object-contain" />
    );
  }
  if (kind === "telegram") {
    return (
      <Image
        src="/images/telegram.png"
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-3.5 object-contain"
      />
    );
  }
  if (kind === "instagram") {
    return <Instagram className="h-3.5 w-3.5" />;
  }
  if (kind === "discord") {
    return <DiscordIcon className="h-3.5 w-3.5" />;
  }
  return <RedditIcon className="h-3.5 w-3.5" />;
}

type Props = {
  links?: Links | null;
  compact?: boolean;
  className?: string;
};

export function ProjectSocialLinks({
  links,
  compact = false,
  className = "",
}: Props) {
  if (!hasProjectSocials(links) || !links) return null;
  const items = itemsFrom(links);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${className}`}
    >
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          title={item.label}
          aria-label={item.label}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-white/70 transition hover:text-white"
        >
          <SocialGlyph kind={item.key} />
          {compact || item.key === "twitter" ? null : (
            <span>{item.label}</span>
          )}
        </a>
      ))}
    </div>
  );
}
