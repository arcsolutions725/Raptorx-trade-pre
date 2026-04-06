/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const insightsSystemPrompt = `You are a data analyst specializing in prediction markets. Analyze market outcome data and provide exactly 4 key insights.

Requirements:
- Generate EXACTLY 4 bullet points
- Each point should be 1-2 sentences
- Focus on patterns, anomalies, or notable data points
- Be specific and reference actual numbers when relevant
- Use plain text format with bullet points (-)
- No markdown formatting, just simple text
- CRITICAL: When referencing dates or times in your insights, you MUST use the exact dates and times provided in the market information. Do NOT make up, estimate, or infer dates. Only reference dates/times that are explicitly provided in the data.`;

/** Summarize outcomes to reduce token usage - keep only fields needed for insights. */
function summarizeOutcomes(outcomes: any[]): any[] {
  const maxOutcomes = 12;
  return outcomes.slice(0, maxOutcomes).map((o) => ({
    outcome: o.subtitle ?? o.groupItemTitle ?? o.title ?? o.question ?? "",
    probability: o.probability ?? o.yes_price ?? o.yesPrice,
    volume: o.volume ?? o.volume_24h ?? o.volume24hr ?? 0,
    liquidity: o.liquidity ?? 0,
    yes_bid: o.yes_bid ?? 0,
    yes_ask: o.yes_ask ?? 0,
  }));
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

export async function POST(request: NextRequest) {
  try {
    const { marketTitle, outcomes, openTime, closeTime, expirationTime } = await request.json();

    if (!marketTitle || !outcomes) {
      return NextResponse.json(
        { error: "marketTitle and outcomes are required" },
        { status: 400 }
      );
    }

    // Format timestamps for better readability
    const formattedOpenTime = formatTimestamp(openTime);
    const formattedCloseTime = formatTimestamp(closeTime);
    const formattedExpirationTime = formatTimestamp(expirationTime);

    // Build date/time context string
    let dateTimeContext = "";
    if (formattedOpenTime || formattedCloseTime || formattedExpirationTime) {
      dateTimeContext = "\n\nMarket Timing Information:\n";
      if (formattedOpenTime) {
        dateTimeContext += `- Market opened: ${formattedOpenTime} (${openTime})\n`;
      }
      if (formattedCloseTime) {
        dateTimeContext += `- Market closes: ${formattedCloseTime} (${closeTime})\n`;
      }
      if (formattedExpirationTime) {
        dateTimeContext += `- Expected expiration: ${formattedExpirationTime} (${expirationTime})\n`;
      }
      dateTimeContext += "\nIMPORTANT: When referencing dates or times in your insights, you MUST use the exact dates and times shown above. Do NOT make up, estimate, or use incorrect dates. Only reference the dates/times explicitly provided here.\n";
    }

    const summarizedOutcomes = summarizeOutcomes(Array.isArray(outcomes) ? outcomes : []);

    const aiPrompt = `Analyze this prediction market outcomes data and provide 4 key insights:

Market: ${marketTitle}
${dateTimeContext}
Outcomes Data:
${JSON.stringify(summarizedOutcomes, null, 2)}

Provide exactly 4 bullet points analyzing patterns, probabilities, liquidity, volume, or other notable aspects of this data.${dateTimeContext ? " Remember to use the correct dates and times provided above if you reference any timing information." : ""}`;

    const aiResponse = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: insightsSystemPrompt },
        { role: "user", content: aiPrompt },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const insightsText = aiResponse.choices?.[0]?.message?.content || "";
    
    // Parse the response to extract bullet points
    const insights = insightsText
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().match(/^\d+\./))
      .map(line => line.replace(/^[-\d.]\s*/, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 4); // Ensure exactly 4 insights

    return NextResponse.json({
      success: true,
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate market insights", details: msg },
      { status: 500 }
    );
  }
}
