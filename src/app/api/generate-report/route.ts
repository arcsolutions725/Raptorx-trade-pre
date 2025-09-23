/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { getTokenData } from "@/lib/api/tokenData";
import { getTweetsSearch } from "@/lib/api/tweet";

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

export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const {
      contractAddress,
      ticker,
      projectName,
      storeToSystem, // admin-only path
      overwrite, // admin confirm
    } = await request.json();

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

    // ---------- FAST-PATH for normal users: reuse SystemReport if exists ----------
    if (!storeToSystem) {
      const sys = await prisma.systemReport.findFirst({
        where: {
          contractAddress: { equals: addr, mode: "insensitive" },
          ticker: { equals: tkr, mode: "insensitive" },
        },
      });

      if (sys) {
        const created = await prisma.report.create({
          data: {
            userId,
            contractAddress: addr,
            ticker: tkr,
            projectName: sys.projectName ?? projectName ?? undefined,
            content: sys.content,
            dexData: sys.dexData ?? undefined,
            conversation: { create: {} },
          },
          include: {
            conversation: {
              select: { id: true, createdAt: true, updatedAt: true },
            },
          },
        });

        return NextResponse.json({
          success: true,
          source: "systemreports",
          report: sys.content,
          tokenData: { dexData: sys.dexData ?? null, coingeckoData: null },
          tweetsAnalyzed: 0,
          metadata: {
            contractAddress: addr,
            ticker: tkr,
            projectName: created.projectName ?? null,
            generatedAt: new Date().toISOString(),
            dataSourcesUsed: {
              dexScreener: !!sys.dexData,
              coinGecko: false,
              tweets: false,
            },
          },
          saved: {
            reportId: created.id,
            conversationId: created.conversation?.id ?? null,
            createdAt: created.createdAt,
          },
        });
      }
      // else fall through and generate fresh
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

    const tweetsData = await getTweetsSearch(addr, tkr, projectName, 40);
    const formattedTweets =
      (tweetsData as any).success && (tweetsData as any).data?.length > 0
        ? (tweetsData as any).data
            .slice(0, 20)
            .map((tweet: string, i: number) => `Tweet ${i + 1}: ${tweet}`)
            .join("\n\n")
        : "No tweets available for analysis";

    const aiPrompt = `Generate a structured technical report for the cryptocurrency project:

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
        // Update the single existing row — no new row created
        await prisma.systemReport.update({
          where: { id: existingCI.id },
          data: {
            contractAddress: addr, // normalize on write
            ticker: tkr, // normalize on write
            projectName: projectName || undefined,
            content: generatedReport,
            dexData: (tokenData as any).dexData ?? undefined,
            // updatedAt auto via @updatedAt
          },
        });
      } else {
        // No match -> create a new normalized row
        await prisma.systemReport.create({
          data: {
            contractAddress: addr,
            ticker: tkr,
            projectName: projectName || undefined,
            content: generatedReport,
            dexData: (tokenData as any).dexData ?? undefined,
          },
        });
      }
    }

    // ---------- Always create a per-user Report row ----------
    const created = await prisma.report.create({
      data: {
        userId,
        contractAddress: addr,
        ticker: tkr,
        projectName: projectName || undefined,
        content: generatedReport,
        dexData: (tokenData as any).dexData ?? undefined,
        conversation: { create: {} },
      },
      include: {
        conversation: {
          select: { id: true, createdAt: true, updatedAt: true },
        },
      },
    });

    // ---------- Daily Task Points: Award 100 points for generating a report ----------
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const userForTasks = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastReportDate: true, reportsToday: true },
    });

    if (userForTasks) {
      const lastReportDate = userForTasks.lastReportDate;
      const isNewDay = !lastReportDate || lastReportDate < today;

      await prisma.user.update({
        where: { id: userId },
        data: {
          points: { increment: 100 }, // Award 100 points for each report
          lastReportDate: new Date(),
          reportsToday: isNewDay ? 1 : { increment: 1 },
        },
      });
    }

    return NextResponse.json({
      success: true,
      source: storeToSystem ? "generated+stored" : "generated",
      report: generatedReport,
      tokenData,
      tweets: tweetsData,
      tweetsAnalyzed: (tweetsData as any).data?.length || 0,
      metadata: {
        contractAddress: addr,
        ticker: tkr,
        projectName: projectName || null,
        generatedAt: new Date().toISOString(),
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
      },
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to generate report", details: msg },
      { status }
    );
  }
}
