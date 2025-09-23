/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      reportData,
      contractAddress,
      ticker,
      history,
      projectName,
    } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
      });
    }

    const systemPrompt = `
      You are an expert Solana token analyst.
      Use the following data to answer the user's question in detail:
      
      Project Name: ${projectName || "Not provided"}
      Contract Address: ${contractAddress || "Not provided"}
      Ticker: ${ticker || "Not provided"}

      ### Technical Report:
      ${reportData || "No report provided."}
    `;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    const responseStream = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      temperature: 0.2,
      stream: true, // Enable streaming
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const delta = chunk.choices[0]?.delta?.content || "";
            controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          console.error("Streaming error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    console.error("❌ DeepSeek chat failed:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process AI chat",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}
