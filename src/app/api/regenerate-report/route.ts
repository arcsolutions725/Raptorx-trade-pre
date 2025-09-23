/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { getTokenData } from "@/lib/api/tokenData";
import { getTweetsSearch } from "@/lib/api/tweet";

// Modified system prompt focused on updating data sections only
const systemPrompt = `You are a professional crypto research analyst and technical writer. Your task is to update specific data-dependent sections of an existing cryptocurrency report with fresh data.

### Requirements:
- Preserve the overall structure and format of the original report
- Focus on updating ONLY the data-dependent sections (Community Chatter, Individual Tweets, Coin-O-Metry, Technical Analysis)
- Maintain the same markdown formatting and section structure
- Use complete sentences and well-written paragraphs
- Do NOT fabricate any data. If some data is missing, clearly state "Data not available"

### Sections to Update:

## Community Chatter
Update with fresh sentiment analysis from the provided tweets data:
- Overall sentiment analysis (bullish/bearish/neutral)
- Key community discussions and trending topics
- Engagement metrics and social activity
- Notable influencer mentions or whale discussions

## Individual Tweets
Update with the 5 most relevant tweets from the newly provided data:
- Format as: **Username:** Tweet content
- Prioritize tweets containing the ticker, contract address, or project name
- If no tweets provided, state "No tweet data available for analysis"

## Coin-O-Metry
Update all statistics with fresh data:
- Token Price, Market Cap, Volume, etc.
- Use the same structure as the original report

## Technical Analysis
Update all subsections with fresh data:
- Price & Market Overview
- Trading Indicators
- On-chain Metrics
- Exchange Listings & Availability
- Recent News & Updates
- Risk Assessment

### Instructions:
- Keep the "What It Is" section mostly unchanged (unless there are significant project changes)
- Preserve the overall tone and style of the original report
- Clearly indicate when data has been refreshed with current timestamp
- Focus on providing factual updates based on the new data`;

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const { reportId } = await request.json();

    if (!reportId) {
      return NextResponse.json(
        { error: "reportId is required" },
        { status: 400 }
      );
    }

    // Get user and verify permissions
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 401 });

    const isAdmin = isAdminEmail(user.email);

    // Fetch the existing report
    const existingReport = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!existingReport) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Verify ownership or admin access
    if (existingReport.userId !== userId && !isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized to regenerate this report" },
        { status: 403 }
      );
    }

    // Extract necessary data from existing report
    const {
      contractAddress,
      ticker,
      projectName,
      content: existingContent,
    } = existingReport;

    // Fetch fresh token data
    const tokenData = await getTokenData(contractAddress);
    if ((tokenData as any).error) {
      return NextResponse.json(
        { error: (tokenData as any).error },
        { status: 500 }
      );
    }

    // Fetch fresh tweets
    const tweetsData = await getTweetsSearch(
      contractAddress,
      ticker,
      projectName || undefined,
      40
    );
    const formattedTweets =
      (tweetsData as any).success && (tweetsData as any).data?.length > 0
        ? (tweetsData as any).data
            .slice(0, 20)
            .map((tweet: string, i: number) => `Tweet ${i + 1}: ${tweet}`)
            .join("\n\n")
        : "No tweets available for analysis";

    // Create optimized AI prompt for regeneration
    const aiPrompt = `Update the data-dependent sections of this cryptocurrency report with fresh data:

**Existing Report:**
${existingContent}

**Inputs for Update:**
- Contract Address: ${contractAddress}
- Ticker: ${ticker}
- Project Name: ${projectName || "Not provided"}

### Fresh DexScreener Data:
${JSON.stringify((tokenData as any).dexData, null, 2)}

### Fresh CoinGecko Data:
${JSON.stringify((tokenData as any).coingeckoData, null, 2)}

### Fresh Tweets Analysis:
${formattedTweets}

### Requirements:
- Preserve the overall structure and formatting of the original report
- Update ONLY the data-dependent sections (Community Chatter, Individual Tweets, Coin-O-Metry, Technical Analysis)
- Keep the "What It Is" section mostly unchanged
- For Individual Tweets section, extract and format the 5 most relevant tweets from the newly provided data
- If some data is missing, state clearly "Data not available" instead of guessing
- Add a note at the beginning indicating this is a refreshed report with current timestamp`;

    // Call AI service with optimized parameters for faster generation
    const aiResponse = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: aiPrompt },
      ],
      temperature: 0.3, // Lower temperature for more focused updates
      max_tokens: 2500, // Slightly reduced tokens since we're only updating parts
    });

    const regeneratedReport = aiResponse.choices?.[0]?.message?.content || "";
    const regenerationTimestamp = new Date().toISOString();

    // Update the user report
    await prisma.report.update({
      where: { id: reportId },
      data: {
        content: regeneratedReport,
        dexData: (tokenData as any).dexData ?? undefined,
        updatedAt: new Date(), // This will update the timestamp
      },
    });

    // If admin and system report exists, update it too
    if (isAdmin) {
      const systemReport = await prisma.systemReport.findFirst({
        where: {
          contractAddress: { equals: contractAddress, mode: "insensitive" },
          ticker: { equals: ticker, mode: "insensitive" },
        },
      });

      if (systemReport) {
        await prisma.systemReport.update({
          where: { id: systemReport.id },
          data: {
            content: regeneratedReport,
            dexData: (tokenData as any).dexData ?? undefined,
            // updatedAt auto via @updatedAt
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      source: "regenerated",
      report: regeneratedReport,
      tokenData,
      tweetsAnalyzed: (tweetsData as any).data?.length || 0,
      metadata: {
        contractAddress,
        ticker,
        projectName: projectName || null,
        regeneratedAt: regenerationTimestamp,
        dataSourcesUsed: {
          dexScreener: !!(tokenData as any).dexData,
          coinGecko: !!(tokenData as any).coingeckoData,
          tweets:
            (tweetsData as any).success &&
            ((tweetsData as any).data?.length || 0) > 0,
        },
      },
      saved: {
        reportId,
        updatedAt: regenerationTimestamp,
      },
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("x-user-id") ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to regenerate report", details: msg },
      { status }
    );
  }
}
