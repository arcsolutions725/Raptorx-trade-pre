"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { toDexChainSlug, type DexScreenerPair } from "@/lib/api/dexscreener";
import {
  parseRexScreenerReportSections,
  stripBnbOnlyReportSectionsFromMarkdown,
} from "@/lib/reportToc";
import { mergeGoldenTeamUpdatesSections } from "@/lib/goldenReportTeamUpdate";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useMarketReportStream } from "@/lib/storage/marketReportStreamStore";
import { isBscForBnbAnalyticsSections } from "@/utils/detectChain";
import { RexPilotReportSectionsStream } from "./RexPilotReportSectionsStream";
import { renderScreenerReportMarkdown } from "./rexPilotReportMarkdown";
import { SkeletonLines } from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/pilotUi";

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
    <div className={compact ? "ss-skel--compact" : undefined} aria-hidden="true">
      <SkeletonLines widths={compact ? [60, 92, 84] : [42, 90, 76, 84, 38, 70, 82]} />
    </div>
  );
});

/** Token logo + name above the report while it streams (pilot.css .rep-head). */
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
    <div className="rep-head">
      <div className="rep-head__img">
        {imageUrl && !imgErr ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="44px"
            unoptimized={
              imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
            }
            onError={() => setImgErr(true)}
          />
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </div>
      <h2>{title}</h2>
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

  const dexChain = toDexChainSlug(token?.chainId) ?? "solana";

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
        `/api/dexscreener?contractAddress=${encodeURIComponent(tokenAddress!)}&chain=${encodeURIComponent(dexChain)}`,
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
    <div className="ss-stream" aria-busy={isGenerating || undefined}>
      <TokenStreamHeader title={title} imageUrl={logo} />
      {mdForDisplay ? (
        <div>
          {preambleMarkdown ? (
            <div className="ss-stream__pre">
              {renderScreenerReportMarkdown(preambleMarkdown)}
              {showCaret && reportSections.length === 0 ? (
                <span className="ss-caret" aria-hidden="true" />
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
            <div className="ss-report">
              {renderScreenerReportMarkdown(mdForDisplay)}
              {showCaret ? <span className="ss-caret" aria-hidden="true" /> : null}
            </div>
          )}
        </div>
      ) : null}
      {showSkeletonWhileWaiting ? <StreamSkeleton /> : null}
      {showSkeletonUnderStream ? <StreamSkeleton compact /> : null}
    </div>
  );
}
