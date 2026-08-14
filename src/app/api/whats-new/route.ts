/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getTweetsSearch } from "@/lib/api/tweet";
import { getDexscreenerData } from "@/lib/api/dexscreener";
import {
  collectProjectSocials,
  type ProjectSocialLinks,
} from "@/lib/api/projectSocials";
import {
  formatTweetsForPrompt,
  selectTopQualityTweets,
  toWhatsNewTweet,
} from "@/lib/api/tweetQuality";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

async function loadProjectSocials(
  contractAddress: string,
  chain?: string,
): Promise<ProjectSocialLinks> {
  if (!contractAddress) return {};
  try {
    const dex = await Promise.race([
      getDexscreenerData(contractAddress, chain),
      new Promise<{ error: string }>((resolve) =>
        setTimeout(() => resolve({ error: "timeout" }), 6000),
      ),
    ]);
    if (!dex || "error" in dex) return {};
    return collectProjectSocials({ info: dex.info });
  } catch {
    return {};
  }
}

/**
 * POST /api/whats-new
 * Lightweight "What's New" brief: top 5 quality tweets + one-paragraph interpretation.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = requireUserId(req);
    const body = await req.json();
    const contractAddress = String(body?.contractAddress || "").trim();
    const ticker = String(body?.ticker || "").trim();
    const projectName =
      typeof body?.projectName === "string" ? body.projectName.trim() : "";
    const chain =
      typeof body?.chain === "string" ? body.chain.trim() : "";

    const socialsPromise = loadProjectSocials(contractAddress, chain || undefined);

    if (!ticker) {
      return NextResponse.json(
        { ok: false, error: "ticker is required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 401 },
      );
    }

    let tweetsResult: Awaited<ReturnType<typeof getTweetsSearch>>;
    try {
      tweetsResult = await getTweetsSearch(
        contractAddress,
        ticker,
        projectName || undefined,
        40,
      );
    } catch (tweetErr: any) {
      console.error("whats-new: tweet fetch failed:", tweetErr?.message || tweetErr);
      const links = await socialsPromise;
      return NextResponse.json({
        ok: true,
        summary:
          "Tweet search timed out. Please try What's New again in a moment.",
        tweets: [],
        tweetsFetched: 0,
        metadata: {
          contractAddress,
          ticker,
          projectName: projectName || null,
          generatedAt: new Date().toISOString(),
          links,
        },
      });
    }

    if (!tweetsResult.success && !(tweetsResult.data && tweetsResult.data.length)) {
      const detail =
        typeof tweetsResult.error === "string"
          ? tweetsResult.error
          : tweetsResult.error?.message || "Tweet search is temporarily unavailable.";
      const links = await socialsPromise;
      return NextResponse.json({
        ok: true,
        summary: `${detail} Try What's New again in a moment.`,
        tweets: [],
        tweetsFetched: 0,
        metadata: {
          contractAddress,
          ticker,
          projectName: projectName || null,
          generatedAt: new Date().toISOString(),
          links,
        },
      });
    }

    const raw = Array.isArray(tweetsResult.data) ? tweetsResult.data : [];
    const top = selectTopQualityTweets(raw, 5).map(toWhatsNewTweet);

    let summary =
      "No recent tweets were found for this ticker, so a social readout is not available yet.";

    if (top.length > 0) {
      const prompt = `You are a markets social analyst. Given the asset and its top recent high-quality tweets, write ONE tight paragraph (4–7 sentences) that:
- Summarizes what the community is talking about right now
- Interprets sentiment and notable claims (without inventing facts)
- Flags hype, caution, or disagreement if present
- Does not list tweets one-by-one; synthesize them
- Does not fabricate links, prices, or partnerships not in the tweets

Project: ${projectName || ticker} ($${ticker})
${contractAddress ? `Contract: ${contractAddress}` : ""}

Tweets:
${formatTweetsForPrompt(top)}`;

      try {
        const completion = await client.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "You write concise markets social briefings. Output only the paragraph, no headings or bullet lists.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 450,
        });
        const text = completion.choices?.[0]?.message?.content?.trim();
        if (text) summary = text;
      } catch (llmErr: any) {
        console.error("whats-new: LLM failed:", llmErr?.message || llmErr);
        summary =
          "Tweet data was retrieved, but the AI summary could not be generated. Review the top tweets below.";
      }
    }

    const links = await socialsPromise;
    return NextResponse.json({
      ok: true,
      summary,
      tweets: top,
      tweetsFetched: raw.length,
      metadata: {
        contractAddress,
        ticker,
        projectName: projectName || null,
        generatedAt: new Date().toISOString(),
        links,
      },
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
