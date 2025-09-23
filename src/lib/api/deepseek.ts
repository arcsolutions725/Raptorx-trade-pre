/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import OpenAI from "openai";
import { DexScreenerTokenProfile } from "./dexscreener";
import { SolscanData } from "./solscan";

export interface DeepSeekRequest {
  contractAddress: string;
  ticker: string;
  projectName?: string;
  dexData: DexScreenerTokenProfile | null | { error: string };
  solscanData: SolscanData | null;
  twitterData?: any[];
}

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function generateReportWithDeepSeek(
  data: DeepSeekRequest
): Promise<string> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DeepSeek API key not configured");
  }

  const prompt = createReportPrompt(data);

  const systemPrompt =
    process.env.DEFAULT_SYSTEM_PROMPT ||
    "You are a professional cryptocurrency analyst specializing in Solana ecosystem tokens. Generate structured and detailed technical reports.";

  try {
    // Create a streaming completion request
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      stream: true,
    });

    let finalResponse = "";

    // Read the stream and build the response content
    for await (const chunk of response) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      finalResponse += delta;
    }

    return finalResponse;
  } catch (error: any) {
    console.error("DeepSeek API Error:", error.response?.data || error.message);
    throw new Error("Failed to generate AI report");
  }
}

function createReportPrompt(data: DeepSeekRequest): string {
  const {
    contractAddress,
    ticker,
    projectName,
    dexData,
    solscanData,
    twitterData,
  } = data;

  return `
Generate a **professional, data-driven technical report** for the following Solana token.

---

## Project Information
- **Project Name**: ${projectName || "Not provided"}
- **Ticker**: ${ticker}
- **Contract Address**: ${contractAddress}

---

## DexScreener Data
${
  dexData && !("error" in dexData)
    ? JSON.stringify(dexData, null, 2)
    : "DexScreener data not available."
}

---

## Solscan Data
${
  solscanData
    ? JSON.stringify(solscanData, null, 2)
    : "Solscan data not available."
}

## Recent Tweets / News Mentions
${
  twitterData && twitterData.length > 0
    ? twitterData
        .slice(0, 10) // Limit tweets
        .map(
          (t: any, index: number) =>
            `Tweet #${index + 1}: ${t.text.replace(/\n/g, " ")}`
        )
        .join("\n\n")
    : "No relevant tweets found."
}

---

# Your Task
Using the provided datasets, generate a **detailed technical report** with the following sections:

---

## 1. Technical Analysis
- Analyze price movements, volatility, RSI, bullish/bearish patterns.
- Include whale wallets activity, top holders, liquidity risks.
- Evaluate volume trends and potential CEX listings.
- **Integrate latest updates from tweets**: highlight whale buys/sells, partnerships, exchange listings, controversies, and roadmap announcements.

---

## 2. Community Sentiment
- Analyze the sentiment of tweets: bullish, bearish, or neutral.
- Measure engagement (likes, retweets, comments).
- Highlight narratives driven by influencers and community.

---

## 3. Top 5 Relevant Tweets
Select 5 most important tweets based on engagement:
- Include tweet text + engagement metrics.
- Summarize their significance.

---

## 4. Coin-O-Metry
Summarize core metrics from DexScreener & Solscan:
- Current price, market cap, ATH, volume, holders, age, links, etc.

---

## Final Output
- Use **structured markdown formatting**.
- Integrate **tweet-based news** wherever relevant.
- Never hallucinate — rely only on provided data.
`;
}
