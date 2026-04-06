/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  checkAndIncrementUsage,
  type UsageFeature,
} from "@/lib/subscription/limits";

const systemPrompt = `You are a professional market analyst and technical writer specializing in prediction markets and political/economic forecasting. Your task is to generate a comprehensive, well-structured, and visually appealing report about a prediction market question.

### Requirements:
- Output must be in **detailed, document-style format** with **clear headings** and **multiple sections**.
- Use complete sentences and **well-written paragraphs**. 
- Use **Markdown formatting** for sections, sub-sections, and bullet points.
- Include relevant stats and analytics from the provided market data.
- Incorporate latest news, developments, and public sentiment.
- Do NOT fabricate any data. If some data is missing, clearly state **"Data not available"**.
- **CRITICAL: When referencing dates or times in your report, you MUST use the exact dates and times provided in the market information. Do NOT make up, estimate, or infer dates. Only reference dates/times that are explicitly provided in the data.**

### Report Structure:

## Title
Create a compelling, descriptive title for this prediction market report that captures the essence of the question.

## Situation Summary
Write a 5-6 line paragraph explaining the news and context related to this prediction question. This should provide background on why this question matters and what events have led to it becoming a prediction market. **Use NEWS APIs and current events to build this paragraph with factual, recent information.**

## Featured Image
Include 1 professionally-sourced image from the internet related to the prediction question. The image should be relevant to the topic and formatted with rounded corners in markdown. Use placeholder markdown syntax: ![Image Description](image-url-here)

## 4. Recent Developments
List 3-5 key highlights showing the latest news developments around which this prediction question is based. Format as bullet points with dates where applicable.
- **CRITICAL: Use ONLY the dates and times provided in the market data. Do NOT make up dates. If dates are provided in the market timing information, use those exact dates. If no specific dates are provided, you may reference recent developments but must clearly indicate when you are using general timeframes rather than specific dates.**
- **[Date]**: Development description (use exact dates from market data if available)
- **[Date]**: Development description (use exact dates from market data if available)
- etc.

## Key People & Power Dynamics
List 2-3 bullet points identifying the people, organizations, or entities who are influencing the outcome of this prediction question. Explain their role and potential impact.
- **Person/Entity Name**: Their influence and role
- **Person/Entity Name**: Their influence and role

## Expected Decision Window
State the date or timeframe by which this prediction question/news event will close or be resolved. Include any relevant deadlines or milestones.

## Probability of Outcome
Analyze the probable outcomes for this prediction question and their consequences. Include:
- Current market probabilities (YES/NO or multiple outcomes)
- Factors that could influence the outcome
- Potential consequences of each outcome
- Risk assessment

## Media & Public Narrative
Discuss what the general public and media are saying about this news event. Include:
- General public sentiment (social media, polls, etc.)
- Media coverage trends
- Key narratives being discussed
- Potential biases or conflicting viewpoints

## Closing Line
A final, impactful single line that summarizes the future outlook of this news situation. This should be bold and insightful.
`;

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

/** Summarize market data to reduce token usage. Keeps only fields needed for report generation. */
function summarizeMarketDataForReport(marketData: any): any {
  if (!marketData || typeof marketData !== "object") return marketData;

  const m = marketData;
  // Handle Polymarket/Kalshi markets[] and Limitless rawEventData.markets
  const markets =
    m.markets ?? m.Markets ?? m.rawEventData?.markets ?? m.event?.markets ?? [];
  const maxMarkets = 15; // Cap to avoid token bloat on multi-outcome markets
  const limitedMarkets = Array.isArray(markets) ? markets.slice(0, maxMarkets) : [];

  const summarizeMarket = (mk: any): any => {
    if (!mk || typeof mk !== "object") return mk;
    const prob =
      mk.probability ?? mk.yes_price ?? mk.yesPrice ?? mk.prices?.[0];
    const vol = mk.volume ?? mk.volume_24h ?? mk.volume24hr ?? 0;
    const sub =
      mk.subtitle ?? mk.groupItemTitle ?? mk.title ?? mk.question ?? "";
    const p =
      typeof prob === "number"
        ? prob <= 1
          ? prob
          : prob / 100
        : Array.isArray(mk.prices) && typeof mk.prices[0] === "number"
          ? mk.prices[0] <= 1
            ? mk.prices[0]
            : mk.prices[0] / 100
          : null;
    return {
      outcome: sub,
      probability: p,
      volume: typeof vol === "number" ? vol : parseFloat(String(vol)) || 0,
    };
  };

  const ev = m.event ?? m.rawEventData ?? {};
  const summary: any = {
    title: m.title ?? m.series_title ?? ev.title ?? "",
    ticker: m.ticker ?? m.series_ticker ?? m.event_ticker ?? ev.event_ticker ?? ev.slug ?? "",
    description: (m.subtitle ?? m.description ?? ev.sub_title ?? "").slice(
      0,
      500
    ),
    total_volume:
      m.total_volume ?? m.total_series_volume ?? m.volume ?? ev.volume ?? 0,
    symbol_image_url: m.symbol_image_url ?? m.image ?? m.icon ?? m.logo ?? ev.logo ?? null,
    open_time:
      m.open_time ?? m.markets?.[0]?.open_time ?? ev.open_ts ?? ev.startDate ?? null,
    close_time:
      m.close_time ?? m.markets?.[0]?.close_time ?? ev.close_ts ?? ev.endDate ?? null,
    expected_expiration_time:
      m.expected_expiration_time ??
      m.markets?.[0]?.expected_expiration_time ??
      ev.expected_expiration_ts ??
      ev.close_ts ??
      ev.endDate ??
      null,
    markets: limitedMarkets.map(summarizeMarket),
    category: m.category ?? m.tags?.[0] ?? ev.tags?.[0] ?? null,
  };

  return summary;
}

// Helper function to format timestamp to readable date/time
function formatTimestamp(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts; // Return original if invalid
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return ts; // Return original if parsing fails
  }
}

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

async function awardReportPoints(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const userForTasks = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastReportDate: true, reportsToday: true },
  });

  if (!userForTasks) return;

  const { lastReportDate, reportsToday } = userForTasks;
  const isNewDay = !lastReportDate || lastReportDate < today;

  const safeReportsToday = typeof reportsToday === "number" ? reportsToday : 0;
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

export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const { marketTicker, marketTitle, marketData, reportKind } =
      await request.json();

    if (!marketTicker || !marketTitle) {
      return NextResponse.json(
        { error: "marketTicker and marketTitle are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 401 });

    // Subscription & usage: Rex Markets report generation
    // reportKind can be "technical" | "news" from client; default both to technical bucket.
    const feature: UsageFeature =
      reportKind === "news"
        ? "REXMARKETS_NEWS_REPORT"
        : "REXMARKETS_TECH_REPORT";
    const usageResult = await checkAndIncrementUsage(userId, feature);
    if (!usageResult.ok) {
      const code = usageResult.reason;
      return NextResponse.json(
        {
          error: "Market report limit reached",
          code,
          plan: usageResult.plan,
        },
        { status: 402 },
      );
    }

    // Summarize market data to reduce token usage (was sending full raw API responses)
    const summarizedData = summarizeMarketDataForReport(marketData);

    // Extract and format date/time information from marketData
    const marketDataObj = marketData || {};
    const openTime = marketDataObj.open_time || marketDataObj.markets?.[0]?.open_time || marketDataObj.rawEventData?.open_ts || marketDataObj.event?.open_ts || null;
    const closeTime =
      marketDataObj.close_time ||
      marketDataObj.markets?.[0]?.close_time ||
      marketDataObj.rawEventData?.close_ts ||
      marketDataObj.event?.close_ts ||
      marketDataObj.rawEventData?.endDate ||
      null;
    const expirationTime =
      marketDataObj.expected_expiration_time ||
      marketDataObj.markets?.[0]?.expected_expiration_time ||
      marketDataObj.markets?.[0]?.close_time ||
      marketDataObj.rawEventData?.expected_expiration_ts ||
      marketDataObj.event?.expected_expiration_ts ||
      closeTime ||
      null;

    const formattedOpenTime = formatTimestamp(openTime);
    const formattedCloseTime = formatTimestamp(closeTime);
    const formattedExpirationTime = formatTimestamp(expirationTime);

    // Build date/time context string
    let dateTimeContext = "";
    if (formattedOpenTime || formattedCloseTime || formattedExpirationTime) {
      dateTimeContext = "\n\n**IMPORTANT - Market Timing Information (USE THESE EXACT DATES):**\n";
      if (formattedOpenTime) {
        dateTimeContext += `- Market opened: ${formattedOpenTime} (ISO timestamp: ${openTime})\n`;
      }
      if (formattedCloseTime) {
        dateTimeContext += `- Market closes: ${formattedCloseTime} (ISO timestamp: ${closeTime})\n`;
      }
      if (formattedExpirationTime) {
        dateTimeContext += `- Expected expiration: ${formattedExpirationTime} (ISO timestamp: ${expirationTime})\n`;
      }
      dateTimeContext += "\n**CRITICAL INSTRUCTION:** When writing the 'Recent Developments' section, you MUST use the exact dates and times shown above if they are relevant. Do NOT make up, estimate, or use incorrect dates. Only reference dates/times that are explicitly provided in the market data. If you reference recent developments, ensure any dates you mention are accurate and sourced from the provided market timing information or clearly indicate when you are using general timeframes.\n";
    }

    // Build the AI prompt with market data
    // marketData now contains the full series data structure from Kalshi demo API
    // including all markets, series metadata, and symbol_image_url if available
    const aiPrompt = `Generate a structured market analysis report for the following prediction market:

**Market Details:**
- Ticker: ${marketTicker}
- Title: ${marketTitle}
${dateTimeContext}
- Market Data: ${JSON.stringify(summarizedData, null, 2)}

### Requirements:
- Follow the exact report structure outlined in the system prompt
- Use the 10-section format as specified
- Include recent news and developments (use your knowledge cutoff for context)
- Analyze the market probabilities and outcomes
- Identify key influencers and power dynamics
- Format the Closing Line section title prominently with golden underline
- Make sure to include a note about the chat dialogue box for follow-up questions
- If specific real-time news data is not available, use contextual knowledge and clearly indicate when making informed assumptions
- Focus on creating a professional, readable report structure
${dateTimeContext ? "- **CRITICAL: Use the exact dates and times provided in the Market Timing Information above. Do NOT make up dates in the Recent Developments section.**" : ""}`;

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

    // Save the report to database
    const created = await prisma.report.create({
      data: {
        userId,
        contractAddress: marketTicker, // Using ticker as identifier for markets
        ticker: marketTicker,
        chain: "market", // Using "market" as chain identifier for market reports
        reportType: "market",
        projectName: marketTitle,
        content: generatedReport,
        marketData: marketData || undefined,
        conversation: { create: {} },
      },
      include: {
        conversation: {
          select: { id: true, createdAt: true, updatedAt: true },
        },
      },
    });

    await awardReportPoints(userId);

    return NextResponse.json({
      success: true,
      source: "generated",
      report: generatedReport,
      metadata: {
        marketTicker,
        marketTitle,
        generatedAt: new Date().toISOString(),
        reportType: "market",
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
      { error: "Failed to generate market report", details: msg },
      { status }
    );
  }
}
