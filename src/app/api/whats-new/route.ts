/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
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

type ProjectMeta = {
  links: ProjectSocialLinks;
  imageUrl?: string;
};

async function loadProjectMeta(
  contractAddress: string,
  chain?: string,
): Promise<ProjectMeta> {
  if (!contractAddress) return { links: {} };
  try {
    const dex = await Promise.race([
      getDexscreenerData(contractAddress, chain),
      new Promise<{ error: string }>((resolve) =>
        setTimeout(() => resolve({ error: "timeout" }), 6000),
      ),
    ]);
    if (!dex || "error" in dex) return { links: {} };
    return {
      links: collectProjectSocials({ info: dex.info }),
      imageUrl: dex.info?.imageUrl || undefined,
    };
  } catch {
    return { links: {} };
  }
}

export type WhatsNewParagraph = { title: string; body: string };

function parseParagraphs(raw: string): WhatsNewParagraph[] | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : parsed?.paragraphs;
    if (!Array.isArray(arr)) return null;
    const out = arr
      .map((p: { title?: unknown; body?: unknown }) => ({
        title: String(p?.title || "").trim(),
        body: String(p?.body || "").trim(),
      }))
      .filter((p: WhatsNewParagraph) => p.title && p.body);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/whats-new
 * Lightweight "What's New" brief: top 5 quality tweets + mini-paragraph interpretation.
 */
export async function POST(req: NextRequest) {
  try {
    requireUserId(req);
    const body = await req.json();
    const contractAddress = String(body?.contractAddress || "").trim();
    const ticker = String(body?.ticker || "").trim();
    const projectName =
      typeof body?.projectName === "string" ? body.projectName.trim() : "";
    const chain =
      typeof body?.chain === "string" ? body.chain.trim() : "";
    const fallbackImageUrl =
      typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";

    const metaPromise = loadProjectMeta(contractAddress, chain || undefined);

    if (!ticker) {
      return NextResponse.json(
        { ok: false, error: "ticker is required" },
        { status: 400 },
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
      return NextResponse.json(
        {
          ok: false,
          error: "Couldn't load What's New right now. Please try again.",
        },
        { status: 503 },
      );
    }

    if (!tweetsResult.success && !(tweetsResult.data && tweetsResult.data.length)) {
      const detail =
        typeof tweetsResult.error === "string"
          ? tweetsResult.error
          : tweetsResult.error?.message || "Tweet search is temporarily unavailable.";
      console.error("whats-new: tweet search failed:", detail);
      return NextResponse.json(
        {
          ok: false,
          error: /timed out/i.test(detail)
            ? "Tweet search timed out. Please try again."
            : "Couldn't load recent tweets right now. Please try again.",
        },
        { status: 503 },
      );
    }

    const raw = Array.isArray(tweetsResult.data) ? tweetsResult.data : [];
    const top = selectTopQualityTweets(raw, 5, {
      ticker,
      projectName: projectName || undefined,
    }).map(toWhatsNewTweet);

    let summary =
      "No recent tweets were found for this ticker, so a social readout is not available yet.";
    let paragraphs: WhatsNewParagraph[] = [
      {
        title: "What's happening",
        body: summary,
      },
    ];

    if (top.length > 0) {
      const prompt = `You are a markets social analyst. Write 3 to 5 mini-paragraphs about $${ticker} itself — its own price action, news, and developments.
- Use only tweets that are about $${ticker} as the subject asset
- Ignore tweets about other tokens that merely mention $${ticker} as a chain, quote, or launch venue
- Interpret sentiment and notable claims (without inventing facts)
- Flag hype, caution, or disagreement if present
- Do not list tweets one-by-one; synthesize them
- Do not fabricate links, prices, or partnerships not in the tweets
- If the tweets are not actually about $${ticker}, say that a clean readout is not available

Each item needs:
- title: 2–6 words, a short label (e.g. "Market pulse", "Community tone")
- body: 1–2 sentences

Output ONLY a JSON array, no markdown:
[{"title":"...","body":"..."}]

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
                "You write concise markets social briefings as JSON mini-paragraphs. Output only the JSON array.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 550,
        });
        const text = completion.choices?.[0]?.message?.content?.trim();
        if (text) {
          const parsed = parseParagraphs(text);
          if (parsed) {
            paragraphs = parsed;
            summary = parsed.map((p) => `${p.title}: ${p.body}`).join(" ");
          } else {
            summary = text;
            paragraphs = [{ title: "What's happening", body: text }];
          }
        }
      } catch (llmErr: any) {
        console.error("whats-new: LLM failed:", llmErr?.message || llmErr);
        summary =
          "Tweet data was retrieved, but the AI summary could not be generated. Review the top tweets below.";
        paragraphs = [
          {
            title: "What's happening",
            body: summary,
          },
        ];
      }
    }

    const meta = await metaPromise;
    return NextResponse.json({
      ok: true,
      summary,
      paragraphs,
      tweets: top,
      tweetsFetched: raw.length,
      metadata: {
        contractAddress,
        ticker,
        projectName: projectName || null,
        generatedAt: new Date().toISOString(),
        links: meta.links,
        imageUrl: meta.imageUrl || fallbackImageUrl || null,
      },
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("whats-new:", msg);
    const status = /x-user-id/.test(msg) ? 401 : 500;
    const safe = /x-user-id/.test(msg)
      ? "Sign in to view What's New."
      : "Couldn't load What's New right now. Please try again.";
    return NextResponse.json({ ok: false, error: safe }, { status });
  }
}
