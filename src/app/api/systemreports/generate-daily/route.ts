/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { getTokenData } from "@/lib/api/tokenData";
import { getTweetsSearch } from "@/lib/api/tweet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = ["iad1"];

const MAX_REPORTS = 200;
const PAGE_SIZE = 50;
const PAGE_DELAY_MS = 500;
const PAGE_MAX_RETRIES = 6;
const PAGE_BACKOFF_BASE_MS = 900;
const PAGE_BACKOFF_JITTER_MS = 300;

const systemPrompt = `You are a professional crypto research analyst and technical writer. Your task is to generate a well-structured, comprehensive, and visually appealing technical report about a cryptocurrency project.

### Requirements:
- Output must be in **detailed, document-style format** with **clear headings** and **multiple sections**.
- Use complete sentences and **well-written paragraphs**. Avoid single-line summaries unless explicitly instructed.
- Use **Markdown formatting** for sections, sub-sections, and bullet points.
- Include relevant stats and analytics from the provided Dexscreener, CoinGecko, and Twitter data.
- Incorporate latest community trends, news, and updates whenever available.
- Do NOT fabricate any data. If some data is missing, clearly state **"Data not available"**.

### Report Structure:

## 1. What It Is
A concise summary of the project mentioning the ticker, project name, and contract address. Include basic project description and key characteristics from the data.

## 2. Community Chatter
Analyze sentiment from Twitter, community channels, and user chatter based on the provided tweets data. Structure this section as:
- Overall sentiment analysis (bullish/bearish/neutral)
- Key community discussions and trending topics
- Engagement metrics and social activity
- Notable influencer mentions or whale discussions
- Caution flags or positive momentum indicators

Example style: "The community on X are bullishly rallying around $AURA. 24-hour timeline shows activity that has picked up where engagement has 5X'd with people calling for all sorts of high valuations. While the majority of emotions are bullishly high, some request to exercise caution due to bundling, etc."

## 3. Individual Tweets
Show the **5 most relevant tweets** based on engagement from the provided tweets data. For each tweet, format as:
**Username:** Tweet content
- Prioritize tweets containing the ticker, contract address, or project name
- Include engagement context where available
- If no tweets provided, state "No tweet data available for analysis"

## 4. Coin-O-Metry
Present key statistics in a structured format:
- **Token Price:** Current USD price
- **Market Cap:** Current market capitalization  
- **All-Time High Price:** Highest price reached
- **All-Time High Market Cap:** Peak market cap
- **24-Hour Price Change:** Percentage change
- **24-Hour Volume:** Trading volume
- **Total Holders:** Number of token holders (if available)
- **Launch Date & Token Age:** When launched and how old
- **Launchpad:** Platform used for launch (if available)
- **Contract Address:** With clear formatting for copying

## 5. Technical Analysis
Split into focused categories:
### Price & Market Overview
- Current metrics, ATH/ATL analysis, liquidity assessment

### Trading Indicators  
- Volume analysis, buy/sell pressure, trend patterns

### On-chain Metrics
- Holder distribution, wallet behavior, transaction patterns

### Exchange Listings & Availability
- Current listings, trading pairs, accessibility

### Recent News & Updates
- Latest developments from social media and official channels

### Risk Assessment
- Potential concerns, volatility analysis, caution areas

### Instructions:
- Make the report visually structured like a professional research document
- Use clear headings and subheadings for easy navigation  
- Focus on factual analysis based on provided data
- Maintain professional tone while being accessible
- Include specific numbers and metrics wherever possible
- If data is missing for any section, clearly state "Data not available" rather than guessing`;

const DS_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";

const BIRDEYE_TOKENLIST = "https://public-api.birdeye.so/defi/tokenlist";
const JUP_VERIFIED_URL = "https://lite-api.jup.ag/tokens/v2/tag?query=verified";

const normAddr = (s: string) => s.trim().toLowerCase();
const normTicker = (s: string) => s.trim().toUpperCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function limiter(concurrency: number) {
  let active = 0;
  const q: Array<() => void> = [];
  const next = () => {
    active--;
    if (q.length) q.shift()!();
  };
  return async <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const start = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          next();
        }
      };
      if (active < concurrency) start();
      else q.push(start);
    });
}

function isAuthorized(req: NextRequest) {
  // 1) Scheduled run from Vercel Cron
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  // 2) Manual run via Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const byBearer =
    !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;

  // 3) (Optional) Manual run via x-cron-secret header that you already used
  const byHeader =
    !!process.env.CRON_SECRET &&
    (req.headers.get("x-cron-secret") ?? "") === process.env.CRON_SECRET;

  return isVercelCron || byBearer || byHeader;
}

async function getJupiterVerifiedSet(): Promise<Set<string>> {
  console.log("🔄 Fetching Jupiter verified set...");
  const res = await fetch(JUP_VERIFIED_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Jupiter HTTP ${res.status}`);
  const arr = (await res.json()) as any[];
  const set = new Set<string>();
  for (const it of arr) {
    const mint =
      typeof it === "string"
        ? it
        : it?.id || it?.mint || it?.address || it?.mintAddress || it?.tokenMint;
    if (mint && typeof mint === "string") set.add(mint.toLowerCase());
  }
  console.log(`✅ Jupiter verified set size: ${set.size}`);
  return set;
}

type BirdeyeListResult = {
  ok: boolean;
  tokens?: any[];
  status?: number;
  error?: string;
  retryAfterSec?: number;
};

async function fetchBirdeyePage(opts: {
  chain: string;
  offset: number;
  sort_by: string;
  sort_type: "asc" | "desc";
  min_liquidity: number;
  ui_amount_mode: "raw" | "scaled";
}): Promise<BirdeyeListResult> {
  const { chain, offset, sort_by, sort_type, min_liquidity, ui_amount_mode } =
    opts;
  const url = new URL(BIRDEYE_TOKENLIST);
  url.searchParams.set("sort_by", sort_by);
  url.searchParams.set("sort_type", sort_type);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("min_liquidity", String(Math.max(0, min_liquidity)));
  url.searchParams.set("ui_amount_mode", ui_amount_mode);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-chain": chain,
      "X-API-KEY": BIRDEYE_API_KEY,
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSec = retryAfterHeader
      ? Math.max(1, parseInt(retryAfterHeader, 10))
      : undefined;
    return {
      ok: false,
      status: 429,
      retryAfterSec,
      error: "Too many requests",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: text || `Birdeye HTTP ${res.status}`,
    };
  }

  const json = (await res.json()) as any;
  const tokens: any[] = Array.isArray(json?.data?.tokens)
    ? json.data.tokens
    : [];
  return { ok: true, tokens, status: 200 };
}

async function fetchBirdeyePageWithRetry(
  params: Parameters<typeof fetchBirdeyePage>[0],
  pageNum: number
) {
  let attempt = 0;
  while (attempt <= PAGE_MAX_RETRIES) {
    const res = await fetchBirdeyePage(params);
    if (res.ok) {
      console.log(
        `✅ Birdeye page ${pageNum} fetched (${res.tokens?.length} tokens)`
      );
      return res;
    }
    if (res.status !== 429)
      throw new Error(res.error || `Birdeye failed (${res.status})`);
    const waitMs =
      (res.retryAfterSec
        ? res.retryAfterSec * 1000
        : PAGE_BACKOFF_BASE_MS * Math.pow(2, attempt)) +
      Math.floor(Math.random() * PAGE_BACKOFF_JITTER_MS);
    console.log(
      `⚠️ 429 on Birdeye page ${pageNum}, retrying in ${waitMs}ms (attempt ${
        attempt + 1
      })`
    );
    await sleep(waitMs);
    attempt++;
  }
  throw new Error("Birdeye 429 after retries");
}

async function collectVerified200() {
  console.log("🔄 Collecting 200 Jupiter-verified tokens from Birdeye...");
  const jupVerified = await getJupiterVerifiedSet();
  const seen = new Set<string>();
  const out: Array<{ address: string; ticker: string; name?: string }> = [];

  let offset = 0;
  let pageNum = 1;
  while (out.length < MAX_REPORTS) {
    const listed = await fetchBirdeyePageWithRetry(
      {
        chain: "solana",
        offset,
        sort_by: "v24hUSD",
        sort_type: "desc",
        min_liquidity: 100,
        ui_amount_mode: "scaled",
      },
      pageNum
    );

    const tokens = listed.tokens ?? [];
    if (tokens.length === 0) break;

    for (const t of tokens) {
      const addr = (t?.address ?? t?.mint ?? "").toLowerCase();
      const symbol = t?.symbol;
      if (!addr || !symbol) continue;
      if (!jupVerified.has(addr)) continue;
      if (seen.has(addr)) continue;
      seen.add(addr);
      out.push({ address: addr, ticker: symbol, name: t?.name });
      if (out.length >= MAX_REPORTS) break;
    }

    console.log(`📊 Collected ${out.length}/${MAX_REPORTS} so far...`);
    offset += PAGE_SIZE;
    pageNum++;

    if (out.length < MAX_REPORTS) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  if (out.length < MAX_REPORTS) {
    throw new Error(
      `Only collected ${out.length} verified tokens; need ${MAX_REPORTS}`
    );
  }
  console.log("✅ Finished collecting 200 verified tokens.");
  return out;
}

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: DS_API_KEY,
});

async function generateOne(addr: string, tkr: string, projectName?: string) {
  console.log(`📝 Generating report for ${tkr} (${addr})`);
  const tokenData = await getTokenData(addr);
  const tweetsData = await getTweetsSearch(addr, tkr, projectName, 40);
  const formattedTweets =
    (tweetsData as any).success && (tweetsData as any).data?.length > 0
      ? (tweetsData as any).data
          .slice(0, 20)
          .map((tweet: string, i: number) => `Tweet ${i + 1}: ${tweet}`)
          .join("\n\n")
      : "No tweets available for analysis";

  const userPrompt = `Generate a structured technical report for the cryptocurrency project:

**Inputs:**
- Contract Address: ${addr}
- Ticker: ${tkr}
- Project Name: ${projectName || "Not provided"}

### DexScreener Data:
${JSON.stringify((tokenData as any).dexData, null, 2)}

### CoinGecko Data:
${JSON.stringify((tokenData as any).coingeckoData, null, 2)}

### Top Tweets Analysis:
${formattedTweets}

### Requirements:
- Follow the exact report structure outlined in the system prompt
- Include all available stats, links, and relevant insights
- Analyze the tweets for sentiment, trends, and key mentions in the Community Chatter section
- For Individual Tweets section, extract and format the 5 most relevant tweets from the provided data
- If some data is missing, state clearly **"Data not available"** instead of guessing
- Focus on creating a professional, readable report structure
- Make sure each section provides substantial analysis and insights`;

  const ai = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  console.log(`✅ Report generated for ${tkr}`);
  return {
    content: ai.choices?.[0]?.message?.content || "",
    dexData: (tokenData as any)?.dexData ?? undefined,
    projectName,
  };
}

async function upsertSystemReport(
  addr: string,
  tkr: string,
  payload: { content: string; dexData?: any; projectName?: string }
) {
  const contractAddress = normAddr(addr);
  const ticker = normTicker(tkr);

  try {
    const existing = await prisma.systemReport.findFirst({
      where: {
        contractAddress: { equals: contractAddress, mode: "insensitive" },
        ticker: { equals: ticker, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.systemReport.update({
        where: { id: existing.id },
        data: {
          contractAddress,
          ticker,
          projectName: payload.projectName ?? undefined,
          content: payload.content,
          dexData: payload.dexData ?? undefined,
        },
      });
      console.log(`🔄 Updated SystemReport for ${ticker}`);
      return { mode: "updated", id: existing.id };
    }

    const created = await prisma.systemReport.create({
      data: {
        contractAddress,
        ticker,
        projectName: payload.projectName ?? undefined,
        content: payload.content,
        dexData: payload.dexData ?? undefined,
      },
      select: { id: true },
    });
    console.log(`🆕 Created SystemReport for ${ticker}`);
    return { mode: "created", id: created.id };
  } catch (err: any) {
    console.error(`❌ Failed upsert for ${ticker}:`, err.message);
    throw err;
  }
}

export async function handle(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      console.error("❌ Forbidden: Missing or invalid cron auth", {
        xVercelCron: req.headers.get("x-vercel-cron"),
        hasCronSecretEnv: !!process.env.CRON_SECRET,
        authHeaderPresent: !!req.headers.get("authorization"),
        xCronSecretLen: (req.headers.get("x-cron-secret") ?? "").length,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!DS_API_KEY || !BIRDEYE_API_KEY) {
      console.error("❌ Missing API keys");
      return NextResponse.json({ error: "Missing API keys" }, { status: 500 });
    }

    console.log("🚀 Starting daily report generation...");
    const targets = await collectVerified200();
    const run = limiter(5);

    const results: any[] = [];
    await Promise.all(
      targets.map((t) =>
        run(async () => {
          try {
            const gen = await generateOne(t.address, t.ticker, t.name);
            const res = await upsertSystemReport(t.address, t.ticker, gen);
            results.push({ ticker: t.ticker, ok: true, mode: res.mode });
          } catch (e: any) {
            console.error(`❌ Error for ${t.ticker}:`, e.message);
            results.push({ ticker: t.ticker, ok: false, error: e.message });
          }
        })
      )
    );

    console.log("🏁 Finished all reports.");
    return NextResponse.json({
      attempted: targets.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err: any) {
    console.error("❌ Fatal error:", err.message);
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  // Vercel cron sends GET by default
  return handle(req);
}
