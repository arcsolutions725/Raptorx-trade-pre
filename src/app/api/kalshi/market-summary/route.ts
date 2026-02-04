/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const summarySystemPrompt = `You are a concise market analyst. Generate a SHORT, informative summary about a prediction market question.

Requirements:
- 3-4 sentences maximum
- Focus on recent news context and why this market matters
- Use factual, neutral tone
- If you don't have recent news, provide general context
- Do NOT use markdown formatting - plain text only`;

export async function POST(request: NextRequest) {
  try {
    const { marketTitle, marketData } = await request.json();

    if (!marketTitle) {
      return NextResponse.json(
        { error: "marketTitle is required" },
        { status: 400 }
      );
    }

    const aiPrompt = `Generate a brief news-focused summary for this prediction market:

Title: ${marketTitle}
Category: ${marketData?.category || "Unknown"}
${marketData?.subtitle ? `Context: ${marketData.subtitle}` : ""}

Provide a 3-4 sentence summary focusing on recent news and context.`;

    const aiResponse = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: summarySystemPrompt },
        { role: "user", content: aiPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const summary = aiResponse.choices?.[0]?.message?.content || "";

    return NextResponse.json({
      success: true,
      summary,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate market summary", details: msg },
      { status: 500 }
    );
  }
}
