/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { getTokenData } from "@/lib/api/tokenData";
import { getTweetsSearch } from "@/lib/api/tweet";
import { detectChain } from "@/utils/detectChain";
import { getBNBHolderAnalytics } from "@/lib/api/bnbAnalytics";
import { getBirdeyeSecurityAnalyticsWithMetadata } from "@/lib/api/birdeyeSecurtiy";
import {
  checkAndIncrementUsage,
  type UsageFeature,
} from "@/lib/subscription/limits";

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

## 2. Holder Analytics (BNB Tokens Only)
**Only include this section for BNB Smart Chain tokens. Skip for Solana tokens.**
**IMPORTANT: Provide only accurate, factual holder analysis. Do NOT fabricate distribution data or make speculative claims about holder behavior. Base analysis strictly on the provided holderAnalytics data.**

If holderAnalytics data is provided, analyze with factual accuracy:
- **Total Holders:** Report exact holder count from the data - cite the precise number
- **Distribution Analysis:** Report actual concentration percentages as provided in the data
- **Top Holder Concentration:** Report exact percentages for top holders (if available in data)
- **Whale Analysis:** List only whale addresses and percentages found in the actual data
- **Distribution Insights:** Analyze decentralization based solely on provided metrics
- **Holder Behavior Patterns:** Report only observable patterns from the actual data
- **Token Concentration Metrics:** Use exact percentages and counts from the data source

**Critical Guidelines for Accurate Holder Reporting:**
- Report exact holder counts - do not estimate or round significantly
- Use precise percentages for token concentration as provided in data
- If whale addresses are provided, list them with exact holding percentages
- Do not speculate about holder intentions or future behavior
- Distinguish between verified data points and missing information
- When data points are missing, state clearly "Data not available" rather than guessing
- Focus on mathematical distribution facts rather than subjective interpretations
- If distribution appears centralized/decentralized, cite specific percentages that support this conclusion

## 3. Safety Analytics (BNB Tokens Only)
**Only include this section for BNB Smart Chain tokens. Skip for Solana tokens.**
**IMPORTANT: Provide only accurate, factual security assessment. Do NOT fabricate or exaggerate security threats. Base analysis strictly on the provided securityAnalytics data.**

If securityAnalytics data is provided, analyze with factual accuracy:
- **Risk Score:** Overall security risk assessment (0-100) - cite the exact score from data
- **Risk Level:** Low, Medium, High, or Critical classification - use only the level from data
- **Security Warnings:** List only the actual warnings found in the data - do not add fictional warnings
- **Safety Indicators:** List only the positive security features detected in the data
- **Token Security Features:** Contract analysis, taxes, restrictions - report exact values from tokenSecurity data
- **Honeypot Detection:** Report exact honeypot status (0 = not honeypot, 1 = honeypot detected)
- **Trading Restrictions:** Report only actual trading limitations found (cannotBuy, cannotSellAll)
- **LP Analysis:** Report liquidity pool lock percentages and holder distribution as provided
- **Tax Analysis:** Report exact buy/sell/transfer tax percentages - do not estimate or inflate

**Critical Guidelines for Accurate Reporting:**
- If isHoneypot = "0", state clearly "Not identified as honeypot"
- If no security warnings exist in the data, state "No security warnings identified"
- Do not label legitimate projects as scams without clear evidence in the data
- Distinguish between high taxes and actual scams - high taxes are not necessarily scams
- Focus on factual contract behavior rather than speculative risk assessment
- When in doubt, err on the side of neutral, factual reporting

## 4. Community Chatter
Analyze sentiment from Twitter, community channels, and user chatter based on the provided tweets data. Structure this section as:
- Overall sentiment analysis (bullish/bearish/neutral)
- Key community discussions and trending topics
- Engagement metrics and social activity
- Notable influencer mentions or whale discussions
- Caution flags or positive momentum indicators

Example style: "The community on X are bullishly rallying around $AURA. 24-hour timeline shows activity that has picked up where engagement has 5X'd with people calling for all sorts of high valuations. While the majority of emotions are bullishly high, some request to exercise caution due to bundling, etc."

## 5. Top Tweets
Show the **5 most relevant tweets** based on engagement from the provided tweets data. For each tweet, format as:
**@Username:** Tweet content
- Extract individual tweets from the tweetsData array provided
- Include usernames, tweet content, and media when available
- Prioritize tweets containing the ticker, contract address, or project name
- If no tweets in input, write one brief line that tweet cards load from live data when the user refreshes the report (do not use the phrase "No tweet data available for analysis")

## 6. Coin-O-Metry
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

## 7. Technical Analysis
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

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

const normAddr = (s: string) => s.trim().toLowerCase();
const normTicker = (s: string) => s.trim().toUpperCase();

async function awardReportPoints(userId: string) {
  // normalize "today" at midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Only fetch what we need
  const userForTasks = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastReportDate: true, reportsToday: true },
  });

  if (!userForTasks) return;

  const { lastReportDate, reportsToday } = userForTasks;
  const isNewDay = !lastReportDate || lastReportDate < today;

  // If reportsToday was ever null, coerce it
  const safeReportsToday = typeof reportsToday === "number" ? reportsToday : 0;

  // Cap at 3 reports per day -> max 300 pts/day for reports
  const reachedDailyCap = !isNewDay && safeReportsToday >= 3;

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(reachedDailyCap ? {} : { points: { increment: 100 } }),
      lastReportDate: new Date(),
      reportsToday: isNewDay ? 1 : Math.min(safeReportsToday + 1, 3),
    },
  });
}

/** RexScreener / Rex Pilot cache: same shape as a freshly generated report (incl. `tweets` for Claw embed). */
async function buildJsonFromCachedReportRow(opts: {
  userId: string;
  addr: string;
  effectiveTicker: string;
  projectName?: string;
  content: string;
  dexData: any;
  tweetsData: any;
  holdersData: any;
  securityData: any;
  storedChain?: string | null;
  source: string;
}) {
  const {
    userId,
    addr,
    effectiveTicker,
    projectName,
    content,
    dexData,
    tweetsData,
    holdersData,
    securityData,
    storedChain,
    source,
  } = opts;

  const reportChain = detectChain({
    dexData: dexData as any,
    address: addr,
    explicitChain: storedChain ?? undefined,
  });

  const holderAnalytics =
    reportChain === "bsc" ? holdersData ?? null : null;
  const securityAnalytics =
    reportChain === "bsc" ? securityData ?? null : null;

  const tweetsArr = Array.isArray(tweetsData) ? tweetsData : [];
  const tweetsPayload = {
    success: true as const,
    data: tweetsArr,
  };

  const created = await prisma.report.create({
    data: {
      userId,
      contractAddress: addr,
      ticker: effectiveTicker,
      chain: reportChain,
      projectName: projectName ?? undefined,
      content,
      dexData: dexData ?? undefined,
      tweetsData: tweetsArr.length ? tweetsData ?? undefined : undefined,
      securityData:
        reportChain === "bsc" ? securityData ?? undefined : undefined,
      holdersData:
        reportChain === "bsc" ? holdersData ?? undefined : undefined,
      conversation: { create: {} },
    },
    include: {
      conversation: {
        select: { id: true, createdAt: true, updatedAt: true },
      },
    },
  });

  await awardReportPoints(userId);

  return {
    success: true,
    source,
    report: content,
    tokenData: {
      dexData: dexData ?? null,
      coingeckoData: null,
    },
    tweets: tweetsPayload,
    tweetsAnalyzed: tweetsArr.length,
    holderAnalytics,
    securityAnalytics,
    metadata: {
      contractAddress: addr,
      ticker: effectiveTicker,
      projectName: created.projectName ?? null,
      generatedAt: new Date().toISOString(),
      chain: reportChain,
      dataSourcesUsed: {
        dexScreener: !!dexData,
        coinGecko: false,
        tweets: tweetsArr.length > 0,
      },
    },
    saved: {
      reportId: created.id,
      conversationId: created.conversation?.id ?? null,
      createdAt: created.createdAt,
    },
  };
}

async function tryReuseExistingReport(opts: {
  userId: string;
  addr: string;
  tkr: string;
  projectName?: string;
}) {
  const { userId, addr, tkr, projectName } = opts;

  let sysReport = await prisma.systemReport.findFirst({
    where: {
      contractAddress: { equals: addr, mode: "insensitive" },
      ticker: { equals: tkr, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!sysReport) {
    sysReport = await prisma.systemReport.findFirst({
      where: {
        contractAddress: { equals: addr, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
    });
  }
  if (sysReport) {
    return buildJsonFromCachedReportRow({
      userId,
      addr,
      effectiveTicker: normTicker(sysReport.ticker),
      projectName: sysReport.projectName ?? projectName,
      content: sysReport.content,
      dexData: sysReport.dexData,
      tweetsData: sysReport.tweetsData,
      holdersData: sysReport.holdersData,
      securityData: sysReport.securityData,
      storedChain: sysReport.chain,
      source: "systemreports",
    });
  }

  let userReport = await prisma.report.findFirst({
    where: {
      contractAddress: { equals: addr, mode: "insensitive" },
      ticker: { equals: tkr, mode: "insensitive" },
      userId,
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!userReport) {
    userReport = await prisma.report.findFirst({
      where: {
        contractAddress: { equals: addr, mode: "insensitive" },
        userId,
      },
      orderBy: { updatedAt: "desc" },
    });
  }
  if (userReport) {
    return buildJsonFromCachedReportRow({
      userId,
      addr,
      effectiveTicker: normTicker(userReport.ticker),
      projectName: userReport.projectName ?? projectName,
      content: userReport.content,
      dexData: userReport.dexData,
      tweetsData: userReport.tweetsData,
      holdersData: userReport.holdersData,
      securityData: userReport.securityData,
      storedChain: userReport.chain,
      source: "cached-user-report",
    });
  }

  return null;
}

/** Cached JSON responses must use SSE when the client sent `stream: true`, or the reader never sees `done`. */
function streamCryptoReportAsSse(cached: {
  success?: boolean;
  source?: string;
  report?: string;
  saved?: unknown;
  metadata?: unknown;
  tweetsAnalyzed?: number;
}) {
  const encoder = new TextEncoder();
  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };
      try {
        const content = String(cached.report ?? "");
        const chunkSize = 160;
        for (let i = 0; i < content.length; i += chunkSize) {
          send({ type: "token", text: content.slice(i, i + chunkSize) });
        }
        send({
          type: "done",
          success: cached.success ?? true,
          source: cached.source,
          report: cached.report,
          saved: cached.saved,
          metadata: cached.metadata,
          tweetsAnalyzed: cached.tweetsAnalyzed,
          tokenData: (cached as { tokenData?: unknown }).tokenData,
          tweets: (cached as { tweets?: unknown }).tweets,
          holderAnalytics: (cached as { holderAnalytics?: unknown })
            .holderAnalytics,
          securityAnalytics: (cached as { securityAnalytics?: unknown })
            .securityAnalytics,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const {
      contractAddress,
      ticker,
      projectName,
      chain: explicitChainFromBody, // optional: token chain from RexScreener (e.g. "base", "bsc", "solana")
      storeToSystem, // admin-only path
      overwrite, // admin confirm
      forceRefresh = false,
      stream,
    } = await request.json();

    const wantsStream = Boolean(stream) && !storeToSystem;

    if (!contractAddress || !ticker) {
      return NextResponse.json(
        { error: "contractAddress and ticker are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 401 });

    const isAdmin = isAdminEmail(user.email);

    const addr = normAddr(contractAddress);
    const tkr = normTicker(ticker);

    // Reuse Rex Pilot / RexScreener DB reports first: no usage charge, same content/tweets/embeds as Screener.
    if (!storeToSystem && !forceRefresh) {
      const cached = await tryReuseExistingReport({
        userId,
        addr,
        tkr,
        projectName,
      });
      if (cached) {
        if (wantsStream) {
          return streamCryptoReportAsSse(cached);
        }
        return NextResponse.json(cached);
      }
    }

    const usageResult = await checkAndIncrementUsage(
      userId,
      "REXSCREENER_REPORT" as UsageFeature,
    );
    if (!usageResult.ok) {
      const code = usageResult.reason;
      return NextResponse.json(
        {
          error: "Report limit reached",
          code,
          plan: usageResult.plan,
        },
        { status: 402 },
      );
    }

    // ---------- Admin protections (no duplicates on store) ----------
    if (storeToSystem && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If a system report exists and overwrite not confirmed -> 409 so UI can confirm
    if (storeToSystem) {
      const exists = await prisma.systemReport.findFirst({
        where: {
          contractAddress: { equals: addr, mode: "insensitive" },
          ticker: { equals: tkr, mode: "insensitive" },
        },
        select: { id: true, updatedAt: true },
      });
      if (exists && !overwrite) {
        return NextResponse.json(
          { exists: true, message: "System report already exists." },
          { status: 409 }
        );
      }
    }

    // ---------- Full generation ----------
    const tokenData = await getTokenData(addr);
    if ((tokenData as any).error) {
      return NextResponse.json(
        { error: (tokenData as any).error },
        { status: 500 }
      );
    }

    // Auto-detect chain: prefer explicit chain from frontend (e.g. when generating from Base token), else from token data
    const detectedChain = detectChain({
      dexData: (tokenData as any).dexData,
      address: addr,
      explicitChain: explicitChainFromBody,
    });

    let tweetsData: Awaited<ReturnType<typeof getTweetsSearch>>;
    try {
      tweetsData = await getTweetsSearch(addr, tkr, projectName, 40);
    } catch (tweetErr: any) {
      console.error("generate-report: tweet fetch failed:", tweetErr?.message || tweetErr);
      tweetsData = {
        success: false,
        data: [],
        error: tweetErr?.message || "Tweet search unavailable",
      };
    }
    const rawTweetsArray =
      (tweetsData as any).success && (tweetsData as any).data?.length > 0
        ? (tweetsData as any).data
        : [];

    const formattedTweets =
      rawTweetsArray.length > 0
        ? rawTweetsArray
            .slice(0, 20)
            .map(
              (tweet: any, i: number) =>
                `Tweet ${i + 1} by @${tweet.tweeter.username}:\n${
                  tweet.text
                }\n${
                  tweet.media.mediaUrl ? `Media: ${tweet.media.mediaUrl}` : ""
                }`
            )
            .join("\n\n")
        : "No tweets available for analysis";

    // Fetch BNB-specific analytics for BSC tokens
    let holderAnalytics: any = null;
    let securityAnalytics: any = null;

    if (detectedChain === "bsc") {
      console.log("Fetching BNB analytics for BSC token:", addr);

      // Fetch holder analytics
      try {
        const holderResult = await getBNBHolderAnalytics(addr);
        if (holderResult.success) {
          holderAnalytics = holderResult.data;
          console.log("Successfully fetched holder analytics");
        } else {
          console.warn("Failed to fetch holder analytics:", holderResult.error);
        }
      } catch (error) {
        console.error("Error fetching holder analytics:", error);
      }

      // Fetch security analytics with metadata
      try {
        const securityResult = await getBirdeyeSecurityAnalyticsWithMetadata(addr);
        if (securityResult.success) {
          securityAnalytics = securityResult.data;
          console.log("Successfully fetched security analytics with metadata");
        } else {
          console.warn(
            "Failed to fetch security analytics:",
            securityResult.error
          );
        }
      } catch (error) {
        console.error("Error fetching security analytics:", error);
      }
    }

    const aiPrompt = `Generate a structured technical report for the cryptocurrency project:

**Inputs:**
- Contract Address: ${addr}
- Ticker: ${tkr}
- Project Name: ${projectName || "Not provided"}
- Blockchain: ${detectedChain === "bsc" ? "BNB Smart Chain (BSC)" : detectedChain === "ethereum" ? "Ethereum" : detectedChain === "base" ? "Base" : detectedChain === "monad" ? "Monad" : "Solana"}

### DexScreener Data:
${JSON.stringify((tokenData as any).dexData, null, 2)}

### CoinGecko Data:
${JSON.stringify((tokenData as any).coingeckoData, null, 2)}

### Top Tweets Analysis:
${formattedTweets}

${
  holderAnalytics
    ? `### Holder Analytics (BNB Token):
${JSON.stringify(holderAnalytics, null, 2)}`
    : ""
}

${
  securityAnalytics
    ? `### Security Analytics (BNB Token):
${JSON.stringify(securityAnalytics, null, 2)}`
    : ""
}

### Requirements:
- Follow the exact report structure outlined in the system prompt
- Include all available stats, links, and relevant insights
- Analyze the tweets for sentiment, trends, and key mentions in the Community Chatter section
- For Top Tweets section, extract and format the 5 most relevant tweets from the provided data
- ${
      holderAnalytics
        ? "Include the Holder Analytics section with comprehensive analysis of the provided holder data"
        : ""
    }
- ${
      securityAnalytics
        ? "Include the Safety Analytics section with detailed security assessment based on the provided security data"
        : ""
    }
- If some data is missing, state clearly **"Data not available"** instead of guessing
- Focus on creating a professional, readable report structure
- Make sure each section provides substantial analysis and insights`;

    const buildReportPayload = async (generatedReport: string) => {
      // ---------- Admin "Generate and Store": UPDATE existing row by id (case-insensitive match), else CREATE ----------
      if (storeToSystem && isAdmin) {
        const existingCI = await prisma.systemReport.findFirst({
          where: {
            contractAddress: { equals: addr, mode: "insensitive" },
            ticker: { equals: tkr, mode: "insensitive" },
          },
          select: { id: true },
        });

        if (existingCI) {
          await prisma.systemReport.update({
            where: { id: existingCI.id },
            data: {
              contractAddress: addr,
              ticker: tkr,
              chain: detectedChain,
              projectName: projectName || undefined,
              content: generatedReport,
              dexData: (tokenData as any).dexData ?? undefined,
              tweetsData: rawTweetsArray || undefined,
              securityData: securityAnalytics || undefined,
              holdersData: holderAnalytics || undefined,
            },
          });
        } else {
          await prisma.systemReport.create({
            data: {
              contractAddress: addr,
              ticker: tkr,
              chain: detectedChain,
              projectName: projectName || undefined,
              content: generatedReport,
              dexData: (tokenData as any).dexData ?? undefined,
              tweetsData: rawTweetsArray || undefined,
              securityData: securityAnalytics || undefined,
              holdersData: holderAnalytics || undefined,
            },
          });
        }
      }

      const created = await prisma.report.create({
        data: {
          userId,
          contractAddress: addr,
          ticker: tkr,
          chain: detectedChain,
          projectName: projectName || undefined,
          content: generatedReport,
          dexData: (tokenData as any).dexData ?? undefined,
          tweetsData: rawTweetsArray || undefined,
          securityData: securityAnalytics || undefined,
          holdersData: holderAnalytics || undefined,
          conversation: { create: {} },
        },
        include: {
          conversation: {
            select: { id: true, createdAt: true, updatedAt: true },
          },
        },
      });

      await awardReportPoints(userId);

      return {
        success: true,
        source: storeToSystem ? "generated+stored" : "generated",
        report: generatedReport,
        tokenData,
        tweets: tweetsData,
        tweetsAnalyzed: (tweetsData as any).data?.length || 0,
        holderAnalytics: holderAnalytics || null,
        securityAnalytics: securityAnalytics || null,
        metadata: {
          contractAddress: addr,
          ticker: tkr,
          projectName: projectName || null,
          generatedAt: new Date().toISOString(),
          chain: detectedChain,
          dataSourcesUsed: {
            dexScreener: !!(tokenData as any).dexData,
            coinGecko: !!(tokenData as any).coingeckoData,
            tweets:
              (tweetsData as any).success &&
              ((tweetsData as any).data?.length || 0) > 0,
          },
        },
        saved: {
          reportId: created.id,
          conversationId: created.conversation?.id ?? null,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      };
    };

    if (wantsStream) {
      const encoder = new TextEncoder();
      const sse = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
            );
          };
          try {
            let fullReport = "";
            const aiStream = await client.chat.completions.create({
              model: "deepseek-chat",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: aiPrompt },
              ],
              temperature: 0.7,
              max_tokens: 4000,
              stream: true,
            });
            for await (const part of aiStream) {
              const delta = (
                part as { choices?: { delta?: { content?: string } }[] }
              ).choices?.[0]?.delta?.content;
              if (delta) {
                fullReport += delta;
                send({ type: "token", text: delta });
              }
            }
            const payload = await buildReportPayload(fullReport);
            // Slim `done`: full payload includes `tokenData` / nested blobs that can make one SSE
            // line huge and break JSON parsing or intermediaries; client only needs these fields.
            send({
              type: "done",
              success: payload.success,
              source: payload.source,
              report: payload.report,
              saved: payload.saved,
              metadata: payload.metadata,
              tweetsAnalyzed: payload.tweetsAnalyzed,
              tokenData: payload.tokenData,
              tweets: payload.tweets,
              holderAnalytics: payload.holderAnalytics,
              securityAnalytics: payload.securityAnalytics,
            });
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Unknown error";
            send({ type: "error", message });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(sse, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const aiResponse = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: aiPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const generatedReport = aiResponse.choices?.[0]?.message?.content || "";
    const payload = await buildReportPayload(generatedReport);
    return NextResponse.json(payload);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to generate report", details: msg },
      { status }
    );
  }
}
