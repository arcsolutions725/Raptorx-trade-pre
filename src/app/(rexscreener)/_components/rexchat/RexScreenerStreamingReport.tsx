"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import type { DexScreenerPair } from "@/lib/api/dexscreener";
import {
  parseRexScreenerReportSections,
  stripBnbOnlyReportSectionsFromMarkdown,
} from "@/lib/reportToc";
import { mergeGoldenTeamUpdatesSections } from "@/lib/goldenReportTeamUpdate";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useMarketReportStream } from "@/lib/storage/marketReportStreamStore";
import { isBscForBnbAnalyticsSections } from "@/utils/detectChain";
import { RexPilotReportSectionsStream } from "./RexPilotReportSectionsStream";
import { renderRexPilotMarkdownSection } from "./rexPilotReportMarkdown";

function contractMatchesReportToken(
  tokenAddr: string,
  reportAddr: string | undefined,
): boolean {
  if (!reportAddr) return false;
  if (tokenAddr === reportAddr) return true;
  if (tokenAddr.startsWith("0x") && reportAddr.startsWith("0x"))
    return tokenAddr.toLowerCase() === reportAddr.toLowerCase();
  return tokenAddr.trim().toLowerCase() === reportAddr.trim().toLowerCase();
}

const StreamSkeleton = memo(function StreamSkeleton({
  compact,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={clsx("space-y-4 pt-1", compact && "mt-5 opacity-50")}
      aria-hidden
    >
      <div className="space-y-2.5">
        <div className="h-3 w-[60%] max-w-[14rem] rounded-md bg-white/[0.08] animate-pulse" />
        <div className="h-2.5 w-full rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-[92%] rounded-md bg-white/[0.06] animate-pulse" />
      </div>
      <div className="space-y-2.5 pt-1">
        <div className="h-3 w-[42%] max-w-[10rem] rounded-md bg-white/[0.08] animate-pulse" />
        <div className="h-2.5 w-full rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-[88%] rounded-md bg-white/[0.05] animate-pulse" />
      </div>
      {!compact ? (
        <div className="space-y-2.5 pt-1">
          <div className="h-3 w-[40%] max-w-[11rem] rounded-md bg-white/[0.08] animate-pulse" />
          <div className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="h-16 w-20 shrink-0 rounded-lg bg-white/[0.06] animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <div className="h-2.5 w-full rounded-md bg-white/[0.06] animate-pulse" />
              <div className="h-2.5 w-[80%] rounded-md bg-white/[0.05] animate-pulse" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

const TokenStreamHeader = memo(function TokenStreamHeader({
  title,
  imageUrl,
}: {
  title: string;
  imageUrl: string | null;
}) {
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => {
    setImgErr(false);
  }, [imageUrl]);
  return (
    <div className="mb-4 flex shrink-0 items-start gap-3 border-b border-white/[0.12] pb-3 pl-1.5 sm:pl-2">
      <div
        className={clsx(
          "relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-xl",
          "bg-gradient-to-br from-white/12 to-white/[0.04]",
          "ring-2 ring-amber-400/30 ring-inset",
        )}
      >
        {imageUrl && !imgErr ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover object-center"
            sizes="(max-width: 640px) 56px, 64px"
            unoptimized={
              imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
            }
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-white/35">
            —
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <h2 className="text-left text-base font-semibold leading-snug text-white/95 sm:text-lg [word-break:break-word]">
          {title}
        </h2>
      </div>
    </div>
  );
});

type RexScreenerStreamingReportProps = {
  tokenAddress: string | null;
  token: TrendingToken | null;
  completedReport?: {
    id?: string;
    contractAddress?: string;
    content?: string;
  } | null;
};

export function RexScreenerStreamingReport({
  tokenAddress,
  token,
  completedReport = null,
}: RexScreenerStreamingReportProps) {
  const { isGenerating } = useReportGenStatus(tokenAddress || undefined);
  const { partialText } = useMarketReportStream(tokenAddress);

  const title = useMemo(
    () => token?.name || token?.symbol || "Generating report…",
    [token?.name, token?.symbol],
  );
  const logo = token?.logo ?? null;

  const streamMd = partialText.trim();
  const inlineMd =
    !isGenerating &&
    tokenAddress &&
    completedReport?.content &&
    contractMatchesReportToken(tokenAddress, completedReport.contractAddress)
      ? completedReport.content.trim()
      : "";
  const md = streamMd || inlineMd;

  const isBnbChain = useMemo(
    () =>
      isBscForBnbAnalyticsSections({
        explicitChain: token?.chainId,
        contractAddress: tokenAddress ?? "",
      }),
    [token?.chainId, tokenAddress],
  );

  const lowerChainId = token?.chainId?.toLowerCase();
  const dexChain =
    lowerChainId === "base" || token?.chainId === "8453"
      ? "base"
      : lowerChainId === "bsc" || token?.chainId === "56"
        ? "bsc"
        : lowerChainId === "monad" || token?.chainId === "10143"
          ? "monad"
          : "solana";

  const mdForDisplay = useMemo(
    () => stripBnbOnlyReportSectionsFromMarkdown(md, isBnbChain),
    [md, isBnbChain],
  );

  const parsedReportSections = useMemo(
    () => parseRexScreenerReportSections(mdForDisplay, isBnbChain),
    [mdForDisplay, isBnbChain],
  );

  /** Published Golden Report team copy — same source as Rex Pilot chat so Team Updates stream with the report. */
  const [goldenPublic, setGoldenPublic] = useState<{
    eligible: boolean;
    content: string;
    publishedAt: string | null;
  } | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setGoldenPublic(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const u = new URL(
          "/api/golden-reports/team-updates/public",
          window.location.origin,
        );
        u.searchParams.set("contractAddress", tokenAddress);
        u.searchParams.set("chain", dexChain);
        const res = await fetch(u.toString());
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (j?.ok) {
          setGoldenPublic({
            eligible: Boolean(j.eligible),
            content: typeof j.content === "string" ? j.content : "",
            publishedAt:
              typeof j.publishedAt === "string" ? j.publishedAt : null,
          });
        } else {
          setGoldenPublic({
            eligible: false,
            content: "",
            publishedAt: null,
          });
        }
      } catch {
        if (!cancelled) {
          setGoldenPublic({
            eligible: false,
            content: "",
            publishedAt: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, dexChain]);

  const reportSections = useMemo(() => {
    if (!goldenPublic?.eligible) return parsedReportSections;
    return mergeGoldenTeamUpdatesSections(
      parsedReportSections,
      goldenPublic.content || "",
      goldenPublic.publishedAt,
    );
  }, [parsedReportSections, goldenPublic]);

  /** Before first `#` / `##` line; parser skips it — must stay above any early return (Rules of Hooks). */
  const preambleMarkdown = useMemo(() => {
    if (!mdForDisplay.trim()) return "";
    const lines = mdForDisplay.split("\n");
    const firstHeadingIdx = lines.findIndex((line) => {
      const t = line.trimStart();
      return /^#+\s/.test(t);
    });
    if (firstHeadingIdx <= 0) return "";
    return lines.slice(0, firstHeadingIdx).join("\n").trim();
  }, [mdForDisplay]);

  const { data: dexPair } = useQuery({
    queryKey: ["dexscreener-embed-pair", dexChain, tokenAddress ?? ""],
    queryFn: async (): Promise<DexScreenerPair | null> => {
      const r = await fetch(
        `/api/dexscreener?contractAddress=${encodeURIComponent(tokenAddress!)}`,
      );
      const j = (await r.json()) as { error?: string } & Partial<DexScreenerPair>;
      if (!r.ok || (typeof j.error === "string" && j.error)) return null;
      if (!j.pairAddress) return null;
      return j as DexScreenerPair;
    },
    enabled: Boolean(tokenAddress),
    staleTime: 120_000,
  });

  const show =
    Boolean(tokenAddress) &&
    (isGenerating || streamMd.length > 0 || inlineMd.length > 0);

  if (!show || !tokenAddress) return null;

  const showCaret = isGenerating && streamMd.length > 0;
  const showSkeletonWhileWaiting =
    isGenerating && streamMd.length === 0 && inlineMd.length === 0;
  const showSkeletonUnderStream =
    isGenerating &&
    streamMd.length > 0 &&
    inlineMd.length === 0 &&
    !mdForDisplay.trim();

  return (
    <div className="mb-6 rounded-xl bg-black/40 px-3 py-4 sm:px-4">
      <TokenStreamHeader title={title} imageUrl={logo} />
      {mdForDisplay ? (
        <div className="rex-markets-report-md rex-markets-report-md--fluid whitespace-pre-wrap wrap-break-word overflow-x-hidden text-white/90 pl-0.5">
          {preambleMarkdown ? (
            <div className="mb-6 space-y-3">
              {renderRexPilotMarkdownSection(preambleMarkdown)}
              {showCaret && reportSections.length === 0 ? (
                <span
                  className="inline-block w-2 h-4 bg-[#ffc000]/85 animate-pulse ml-0.5 align-middle"
                  aria-hidden
                />
              ) : null}
            </div>
          ) : null}
          {reportSections.length > 0 ? (
            <RexPilotReportSectionsStream
              sections={reportSections}
              dexData={dexPair}
              isBNBToken={isBnbChain}
              showTrailingCaret={showCaret}
            />
          ) : preambleMarkdown ? null : (
            <div className="space-y-3">
              {renderRexPilotMarkdownSection(mdForDisplay)}
              {showCaret ? (
                <span
                  className="inline-block w-2 h-4 bg-[#ffc000]/85 animate-pulse ml-0.5 align-middle"
                  aria-hidden
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}
      {showSkeletonWhileWaiting ? <StreamSkeleton /> : null}
      {showSkeletonUnderStream ? <StreamSkeleton compact /> : null}
    </div>
  );
}
