/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { OpenRouter } from "@openrouter/sdk";

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/\S+|www\.\S+/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((u) => u.replace(/[),.;!?]+$/g, ""))
        .map((u) => (u.startsWith("www.") ? `https://${u}` : u)),
    ),
  );
}

function hasSourcesSection(text: string): boolean {
  return (
    /(^|\n)\s*Sources\s*:\s*($|\n)/i.test(text) ||
    /(^|\n)\s*#{1,6}\s*Sources\b.*($|\n)/i.test(text)
  );
}

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
      You are an expert crypto token analyst.
      Use the following data plus live web search context to answer the user's question in detail.
      
      Project Name: ${projectName || "Not provided"}
      Contract Address: ${contractAddress || "Not provided"}
      Ticker: ${ticker || "Not provided"}

      ### Technical Report:
      ${reportData || "No report provided."}

      Requirements:
      - This assistant is crypto-only. Never refer to stocks, equities, or the stock market.
      - When you use a section/title for the asset overview, use "Market information" (never "Stock market information").
      - Prioritize current, real-time information where available.
      - Cross-check report context with current web data.
      - Add clickable markdown links to sources for time-sensitive claims.
      - Always end with a short "Sources:" section with 2-6 links when available.
    `;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    const responseStream = await openRouter.chat.send({
      // Search-enabled model for real-time follow-up answers (RexScreener chat).
      model: "openai/gpt-4o-mini-search-preview",
      messages,
      temperature: 0.2,
      stream: true,
      streamOptions: { includeUsage: true },
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let finalText = "";
        try {
          for await (const chunk of responseStream) {
            const delta = chunk.choices?.[0]?.delta?.content || "";
            finalText += delta;
            controller.enqueue(encoder.encode(delta));
          }
          if (!hasSourcesSection(finalText)) {
            const urls = extractUrls(finalText).slice(0, 8);
            if (urls.length > 0) {
              const sources = `\n\nSources:\n${urls.map((u) => `- [${u}](${u})`).join("\n")}\n`;
              controller.enqueue(encoder.encode(sources));
            }
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
    console.error("❌ Claw follow-up chat failed:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process AI chat",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}
