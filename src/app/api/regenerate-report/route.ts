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

// Modified system prompt focused on updating data sections only
const systemPrompt = `You are a professional crypto research analyst and technical writer. Your task is to update specific data-dependent sections of an existing cryptocurrency report with fresh data.

### Requirements:
- Preserve the overall structure and format of the original report
- Focus on updating ONLY the data-dependent sections (Community Chatter, Top Tweets, Coin-O-Metry, Technical Analysis)
- Maintain the same markdown formatting and section structure
- Use complete sentences and well-written paragraphs
- Do NOT fabricate any data. If some data is missing, clearly state "Data not available"

### Sections to Update:

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

## Safety Analytics (BNB Tokens Only)
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

## Community Chatter
Update with fresh sentiment analysis from the provided tweets data:
- Overall sentiment analysis (bullish/bearish/neutral)
- Key community discussions and trending topics
- Engagement metrics and social activity
- Notable influencer mentions or whale discussions

## Top Tweets
Update with the 5 most relevant tweets from the newly provided data:
- Format as: **Username:** Tweet content
- Prioritize tweets containing the ticker, contract address, or project name
- If no tweets in input, write one brief line that tweet cards load from live data when the user refreshes the report (do not use the phrase "No tweet data available for analysis")

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
    const body = await request.json();
    const reportId = body?.reportId as string | undefined;
    const wantsStream = Boolean(body?.stream);

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

    // Auto-detect chain from token data
    const detectedChain = detectChain({
      dexData: (tokenData as any).dexData,
      address: contractAddress,
    });

    // Fetch fresh tweets
    const tweetsData = await getTweetsSearch(
      contractAddress,
      ticker,
      projectName || undefined,
      40
    );
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
      console.log("Fetching BNB analytics for BSC token:", contractAddress);

      // Fetch holder analytics
      try {
        const holderResult = await getBNBHolderAnalytics(contractAddress);
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
        const securityResult = await getBirdeyeSecurityAnalyticsWithMetadata(
          contractAddress
        );
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
- Preserve the overall structure and formatting of the original report
- Update ONLY the data-dependent sections (Community Chatter, Top Tweets, Coin-O-Metry, Technical Analysis)
- Keep the "What It Is" section mostly unchanged
- For Top Tweets section, extract and format the 5 most relevant tweets from the newly provided data
- If some data is missing, state clearly "Data not available" instead of guessing
- Add a note at the beginning indicating this is a refreshed report with current timestamp`;

    const finishRegeneration = async (regeneratedReport: string) => {
      const regenerationTimestamp = new Date().toISOString();

      await prisma.report.update({
        where: { id: reportId },
        data: {
          chain: detectedChain,
          content: regeneratedReport,
          dexData: (tokenData as any).dexData ?? undefined,
          tweetsData: rawTweetsArray || undefined,
          securityData: securityAnalytics || undefined,
          holdersData: holderAnalytics || undefined,
          updatedAt: new Date(),
        },
      });

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
              chain: detectedChain,
              content: regeneratedReport,
              dexData: (tokenData as any).dexData ?? undefined,
              tweetsData: rawTweetsArray || undefined,
              securityData: securityAnalytics || undefined,
              holdersData: holderAnalytics || undefined,
            },
          });
        }
      }

      return {
        success: true,
        source: "regenerated",
        report: regeneratedReport,
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
              temperature: 0.3,
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
            const payload = await finishRegeneration(fullReport);
            send({ type: "done", ...payload });
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
      temperature: 0.3,
      max_tokens: 4000,
    });

    const regeneratedReport = aiResponse.choices?.[0]?.message?.content || "";
    const basePayload = await finishRegeneration(regeneratedReport);
    return NextResponse.json({
      ...basePayload,
      tokenData,
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
