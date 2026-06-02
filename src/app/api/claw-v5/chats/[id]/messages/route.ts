import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OpenRouter } from "@openrouter/sdk";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  alwaysSearchAddendumPrompt,
  cryptoPrompt,
  regularPrompt,
  synthesisAddendumPrompt,
  internetMarketsPrompt,
  kalshiPrompt,
  polymarketPrompt,
  limitlessPrompt,
  myriadPrompt,
  predictfunPrompt,
  predictionMarketsPrompt,
  cryptoChainAddendum,
} from "@/lib/ai/prompts";
import { classifyQuestionDomain, type QuestionDomain } from "@/lib/ai/intent";
import {
  buildRexmarketsEmbedsFromMarketData,
  extractRexmarketsLink,
  extractDirectMarketLink,
  findRexmarketsEmbedsForQuery,
  fetchRexmarketsMarketDetails,
  inferRexmarketsProviderFromText,
  runMarketToolAgent,
  type RexmarketsProvider,
} from "@/lib/ai/tools/market";
import { normalizeKalshiEventTicker } from "@/lib/kalshi/normalizeEventTicker";
import {
  runCryptoToolAgent,
  detectCryptoToolIntent,
  isAddressDrivenTechnicalIntent,
  resolveTokenFromQuery,
  fetchTechnicalReportStream,
  stripTickerPrefix,
} from "@/lib/ai/tools/crypto";
import {
  isTopPredictionMarketsIntent,
  extractTopMarketsCategory,
  extractTopMarketsLimit,
  fetchTopPredictionMarkets,
  inferProviderFromTopMarketsQuery,
  buildTopMarketsSuggestMessage,
  type TopMarketsEmbedPayload,
} from "@/lib/ai/tools/market";
import { checkAndIncrementUsage } from "@/lib/subscription/limits";

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

function extractUrls(text: string): string[] {
  // Match http(s) URLs and www.* URLs. Keep simple to avoid false positives.
  const matches = text.match(/https?:\/\/\S+|www\.\S+/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((u) => u.replace(/[),.;!?]+$/g, "")) // strip common trailing punctuation
        .map((u) => (u.startsWith("www.") ? `https://${u}` : u))
    )
  );
}

function hasSourcesSection(text: string): boolean {
  // Catch "Sources:" and markdown headings like "## Sources"
  return (
    /(^|\n)\s*Sources\s*:\s*($|\n)/i.test(text) ||
    /(^|\n)\s*#{1,6}\s*Sources\b.*($|\n)/i.test(text)
  );
}

function normalizeSourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // Drop common tracking params (including the utm_source=openai seen in search results)
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "gclid",
      "fbclid",
    ]);
    for (const k of Array.from(url.searchParams.keys())) {
      if (drop.has(k)) url.searchParams.delete(k);
    }
    // Keep hash (some docs rely on it)
    const normalized = url.toString();
    return normalized;
  } catch {
    return raw;
  }
}

function normalizeAndDedupeUrls(urls: string[], limit = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    const cleaned = normalizeSourceUrl(u);
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

async function streamOpenRouterDeltasToClient(
  stream: AsyncIterable<any>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  phase: "research" | "draft",
): Promise<string> {
  let out = "";
  for await (const chunk of stream) {
    const content = chunk?.choices?.[0]?.delta?.content;
    if (content) {
      out += content;
      controller.enqueue(
        encoder.encode(
          JSON.stringify({ type: "thinkingDelta", phase, text: content }) + "\n",
        ),
      );
    }
  }
  return out;
}

/** Extract the most recent technical report from conversation history so follow-up questions can be answered in context. */
function extractReportContextFromHistory(
  messages: Array<{ role: string; content: string }>
): { reportText: string; tokenSymbol: string; tokenName: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant" || typeof msg.content !== "string") continue;
    const match = msg.content.match(/```cryptotech\s*([\s\S]*?)```/i);
    if (!match?.[1]) continue;
    try {
      const payload = JSON.parse(match[1].trim());
      if (payload?.kind !== "technical_report") continue;
      const reportText = String(
        payload?.report?.report ?? payload?.report ?? ""
      ).trim();
      if (!reportText) continue;
      const token = payload?.token;
      const tokenSymbol = token?.symbol ?? payload?.report?.ticker ?? "";
      const tokenName =
        token?.name ?? payload?.report?.projectName ?? tokenSymbol;
      return { reportText, tokenSymbol, tokenName };
    } catch {
      continue;
    }
  }
  return null;
}

type ClawCryptoChainUi = "solana" | "ethereum" | "base" | "bnb" | "monad";

function trendingChainHintFromUi(
  chain: ClawCryptoChainUi | undefined,
): "solana" | "bsc" | "base" | "ethereum" | "monad" | "all" | undefined {
  if (!chain) return undefined;
  if (chain === "bnb") return "bsc";
  if (chain === "ethereum") return "ethereum";
  return chain;
}

function reportExplicitChainFromUi(
  chain: ClawCryptoChainUi | undefined,
): string | undefined {
  if (!chain) return undefined;
  if (chain === "ethereum") return "ethereum";
  return chain === "bnb" ? "bsc" : chain;
}

function rexmarketsProviderFromClawUi(
  marketMode: "Markets" | "Crypto" | "Kalshi" | "Polymarket" | undefined,
  predictionDisplayLevel: "category" | "provider" | undefined,
): RexmarketsProvider | undefined {
  if (predictionDisplayLevel !== "provider") return undefined;
  if (marketMode === "Kalshi") return "kalshi";
  if (marketMode === "Polymarket") return "polymarket";
  return undefined;
}

// POST /api/claw-v5/chats/[id]/messages - Add a message and get AI response
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Derive a stable public origin for internal API calls.
    // On some hosting setups, `request.url` can reflect an internal origin, which would
    // break server-side fetches like `${baseUrl}/api/polymarket/...`.
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    const baseUrl =
      forwardedHost
        ? `${forwardedProto || "https"}://${forwardedHost}`
        : new URL(request.url).origin;
    const { id } = await params;
    const body = await request.json();
    const {
      content,
      role = "user",
      history,
      marketMode,
      cryptoChain,
      predictionSubmode,
      predictionDisplayLevel,
    }: {
      content: string;
      role?: "user" | "assistant";
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      marketMode?: "Markets" | "Crypto" | "Kalshi" | "Polymarket";
      cryptoChain?: ClawCryptoChainUi;
      predictionSubmode?: "polymarket" | "kalshi" | "limitless" | "myriad" | "predictfun";
      predictionDisplayLevel?: "category" | "provider";
    } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Verify chat exists
    const chat = await prisma.clawV5Chat.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Subscription & usage: every user message to Claw counts toward limits.
    if (role !== "assistant") {
      const usageResult = await checkAndIncrementUsage(
        chat.userId,
        "CLAW_MESSAGE",
      );
      if (!usageResult.ok) {
        const code = usageResult.reason;
        return NextResponse.json(
          {
            error: "Claw usage limit reached",
            code,
            plan: usageResult.plan,
          },
          { status: 402 },
        );
      }
    }

    // Save user message
    const userMessage = await prisma.clawV5Message.create({
      data: {
        chatId: id,
        role: role === "assistant" ? "assistant" : "user",
        content,
      },
    });

    // Update chat title if it's the first message
    const isFirstMessage = chat.messages.length === 0;
    const updateData: { updatedAt: Date; title?: string } = {
      updatedAt: new Date(),
    };

    if (isFirstMessage && chat.title === "New Chat") {
      // Use first 50 characters of the message as title
      updateData.title = content.substring(0, 50) || "New Chat";
    }

    await prisma.clawV5Chat.update({
      where: { id },
      data: updateData,
    });

    // Prepare messages for AI

    const normalizedHistory =
      Array.isArray(history) && history.length > 0
        ? history
            .filter(
              (m) => m && typeof m.content === "string" && m.content.trim()
            )
            .map((m) => ({
              role:
                m.role === "assistant"
                  ? ("assistant" as const)
                  : ("user" as const),
              content: m.content,
            }))
        : chat.messages.map((msg) => ({
            role:
              msg.role === "assistant"
                ? ("assistant" as const)
                : ("user" as const),
            content: msg.content,
          }));

    // Always-on 3-pass workflow:
    // 0) (Conditional) Market lookup via tool-calling agent (Kalshi/Polymarket)
    // 1) Web research with openai/gpt-4o-mini-search-preview (always)
    // 2) Draft answer with DEFAULT_CHAT_MODEL
    // 3) Synthesize both (streamed to client) with DEFAULT_CHAT_MODEL

    const urlsInUserMessage = extractUrls(content);

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    let fullAiResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // First, send the user message info
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "userMessage", data: userMessage }) + "\n"
            )
          );

          const sendStatus = (
            phase: "markets" | "research" | "draft" | "synth" | "report",
            labelOverride?: string,
          ) => {
            const defaultLabel =
              phase === "markets"
                ? "Searching in RaptorX…"
                : phase === "report"
                  ? "Generating technical report…"
                  : phase === "research"
                    ? "Web searching official sources…"
                    : phase === "draft"
                      ? "Drafting response…"
                      : "Finalizing answer…";
            const label = labelOverride ?? defaultLabel;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "status", phase, label }) + "\n"
              )
            );
          };

          // Extract report from history so follow-up questions are answered in context (Rex Pilot–style).
          const reportContextFromHistory =
            extractReportContextFromHistory(normalizedHistory);

          // Pass 0: market lookup (ONLY for market intent or explicit RexMarkets link).
          let raptorxMarketData: any = null;
          let rexEmbeds: any[] = [];
          let cryptoToolData: any = null;
          let cryptoEmbedsText = "";
          let topMarketsPayload: TopMarketsEmbedPayload | null = null;
          let rexLink = extractRexmarketsLink(content);
          if (!rexLink && baseUrl) {
            const sameOriginRe = new RegExp(
              `${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/rexmarkets/(polymarket|kalshi|limitless|myriad|predict-fun)/([^\\s/?#.,;:!)+]+)`,
              "i",
            );
            const sameMatch = content.match(sameOriginRe);
            if (sameMatch) {
              const seg = sameMatch[1].toLowerCase();
              const p = (
                seg === "predict-fun" ? "predictfun" : seg
              ) as RexmarketsProvider;
              const rawId = sameMatch[2];
              rexLink = {
                provider: p,
                id: p === "kalshi" ? normalizeKalshiEventTicker(rawId) : rawId,
                url: sameMatch[0],
              };
            }
          }
          const directMarketLink = extractDirectMarketLink(content, baseUrl);
          const marketLink = rexLink ?? directMarketLink;

          const forcedUiCryptoChain: ClawCryptoChainUi | undefined =
            marketMode === "Crypto" ? cryptoChain : undefined;
          const trendingHintForSelectedChain =
            trendingChainHintFromUi(forcedUiCryptoChain);

          // Avoid a long silent gap while `classifyQuestionDomain` runs (LLM call for non-obvious queries).
          // The client otherwise shows only "Connecting…" + countdown until the first status event.
          const needsDomainClassify =
            !marketLink && marketMode !== "Crypto";
          if (needsDomainClassify) {
            sendStatus("report", "Understanding your question…");
          }

          const domain: QuestionDomain = marketLink
            ? "market"
            : marketMode === "Crypto"
              ? "crypto"
              : await classifyQuestionDomain({
                  openRouter,
                  model: DEFAULT_CHAT_MODEL,
                  text: content,
                });
          const basePrompt = (() => {
            if (marketMode === "Crypto") {
              const chainAdd = cryptoChain ? cryptoChainAddendum(cryptoChain) : "";
              return cryptoPrompt + chainAdd;
            }
            if (marketMode === "Kalshi") {
              if (predictionDisplayLevel === "category") return predictionMarketsPrompt;
              return kalshiPrompt;
            }
            if (marketMode === "Polymarket") {
              if (predictionDisplayLevel === "category") return predictionMarketsPrompt;
              return polymarketPrompt;
            }
            if (marketMode === "Markets") {
              if (predictionSubmode === "limitless") return limitlessPrompt;
              if (predictionSubmode === "myriad") return myriadPrompt;
              if (predictionSubmode === "predictfun") return predictfunPrompt;
              return internetMarketsPrompt;
            }
            return domain === "crypto" ? cryptoPrompt : regularPrompt;
          })();

          try {
            // Top prediction markets intent: show cards for "top/hottest markets" regardless of domain.
            // Run first so "Give me the top 5 hottest on Kalshi and Polymarket" always shows cards.
            if (
              !marketLink &&
              marketMode !== "Crypto" &&
              isTopPredictionMarketsIntent(content)
            ) {
              sendStatus("markets");
              const category = extractTopMarketsCategory(content);
              const limit = extractTopMarketsLimit(content);
              // In Markets (or Crypto) mode, infer provider from query (e.g. "best sports on Kalshi" -> only Kalshi).
              const provider =
                marketMode === "Kalshi"
                  ? ("kalshi" as const)
                  : marketMode === "Polymarket"
                    ? ("polymarket" as const)
                    : marketMode === "Markets" && predictionSubmode === "limitless"
                      ? ("limitless" as const)
                      : marketMode === "Markets" && predictionSubmode === "myriad"
                        ? ("myriad" as const)
                      : marketMode === "Markets" && predictionSubmode === "predictfun"
                        ? ("predictfun" as const)
                      : marketMode === "Markets" || marketMode === "Crypto"
                        ? inferProviderFromTopMarketsQuery(content)
                        : undefined;
              const result = await fetchTopPredictionMarkets(baseUrl, {
                ...(category ? { category } : {}),
                limit,
                ...(provider ? { provider } : {}),
              });
              topMarketsPayload = {
                kind: "top_markets",
                polymarket: result.polymarket,
                limitless: result.limitless,
                kalshi: result.kalshi,
                myriad: result.myriad ?? [],
                predictfun: result.predictfun ?? [],
                ...(result.message ? { message: result.message } : {}),
                ...(result.categoryList ? { categoryList: result.categoryList } : {}),
              };
              // Skip normal market search; we'll stream the top-markets cards only.
            } else if (domain === "market") {
              sendStatus("markets");

              if (marketLink) {
                // User provided a RexMarkets link or direct Polymarket/Kalshi link: fetch that specific market only.
                const details = await fetchRexmarketsMarketDetails({
                  baseUrl,
                  provider: marketLink.provider,
                  id: marketLink.id,
                });
                raptorxMarketData = {
                  isMarketQuestion: true,
                  [marketLink.provider]: {
                    selectedEvent: { id: marketLink.id, url: marketLink.url },
                    details,
                  },
                };
                rexEmbeds = [
                  {
                    kind: "rexmarkets",
                    provider: marketLink.provider,
                    raptorxUrl: marketLink.url,
                    marketDetails: details,
                  },
                ];
              } else {
                const uiRexProvider = rexmarketsProviderFromClawUi(
                  marketMode,
                  predictionDisplayLevel,
                );
                const marketsSinglePlatformProvider: RexmarketsProvider | undefined =
                  marketMode === "Markets" && predictionSubmode === "limitless"
                    ? "limitless"
                    : marketMode === "Markets" && predictionSubmode === "myriad"
                      ? "myriad"
                      : marketMode === "Markets" && predictionSubmode === "predictfun"
                        ? "predictfun"
                        : undefined;
                const onlyProvider =
                  inferRexmarketsProviderFromText(content) ??
                  uiRexProvider ??
                  marketsSinglePlatformProvider;
                const agentOut = await runMarketToolAgent(
                  openRouter,
                  DEFAULT_CHAT_MODEL,
                  content,
                  baseUrl,
                  onlyProvider ? { onlyProvider } : undefined
                );
                // Only keep market data if it contains usable results
                rexEmbeds = buildRexmarketsEmbedsFromMarketData(agentOut);
                if (rexEmbeds.length === 0) {
                  // Deterministic fallback: search RexMarkets directly and fetch top details.
                  rexEmbeds = await findRexmarketsEmbedsForQuery({
                    baseUrl,
                    query: content,
                    providers: onlyProvider ? [onlyProvider] : ["polymarket", "kalshi"],
                    limitPerProvider: 5,
                  });
                }

                if (rexEmbeds.length > 0) {
                  // Build a minimal market-data blob for synthesis (so the model uses the prices).
                  raptorxMarketData = {
                    isMarketQuestion: true,
                    ...(rexEmbeds.find((e) => e.provider === "polymarket")
                      ? {
                          polymarket: {
                            details: rexEmbeds.find(
                              (e) => e.provider === "polymarket"
                            )?.marketDetails,
                          },
                        }
                      : {}),
                    ...(rexEmbeds.find((e) => e.provider === "kalshi")
                      ? {
                          kalshi: {
                            details: rexEmbeds.find(
                              (e) => e.provider === "kalshi"
                            )?.marketDetails,
                          },
                        }
                      : {}),
                    ...(rexEmbeds.find((e) => e.provider === "limitless")
                      ? {
                          limitless: {
                            details: rexEmbeds.find(
                              (e) => e.provider === "limitless"
                            )?.marketDetails,
                          },
                        }
                      : {}),
                    ...(rexEmbeds.find((e) => e.provider === "myriad")
                      ? {
                          myriad: {
                            details: rexEmbeds.find(
                              (e) => e.provider === "myriad"
                            )?.marketDetails,
                          },
                        }
                      : {}),
                    ...(rexEmbeds.find((e) => e.provider === "predictfun")
                      ? {
                          predictfun: {
                            details: rexEmbeds.find(
                              (e) => e.provider === "predictfun"
                            )?.marketDetails,
                          },
                        }
                      : {}),
                  };
                } else {
                  raptorxMarketData = null;
                }
              }
            } else {
              // crypto/other: skip RexMarkets embed for now
              raptorxMarketData = null;
              rexEmbeds = [];
            }
          } catch (err) {
            console.error("Claw v5 market intent/tool step failed:", err);
            raptorxMarketData = null;
            rexEmbeds = [];
          }

          // Pass 0b: crypto tools.
          // We primarily key off the domain classifier, but if the user explicitly
          // provides a token/ticker/contract address (e.g. pure mint address queries),
          // we still want to surface the generated report even if the classifier
          // was conservative and did not label the question as "crypto".
          try {
            const cryptoIntent = detectCryptoToolIntent(content);
            // Default UI sends marketMode "Markets"; we still must run token/report tools when the
            // message is clearly a token query. In Prediction tabs, only run for pasted addresses so
            // tickers like "TRUMP" do not steal market Q&A.
            const inPredictionMarketUi =
              marketMode === "Kalshi" || marketMode === "Polymarket";
            const tokenUiAllowsCryptoTools =
              marketMode === "Crypto" ||
              marketMode === "Markets" ||
              marketMode === undefined;
            const shouldRunCryptoTools =
              (cryptoIntent !== null || domain === "crypto") &&
              tokenUiAllowsCryptoTools &&
              (!inPredictionMarketUi ||
                isAddressDrivenTechnicalIntent(cryptoIntent)) &&
              // Deep Analysis on Rex Markets embeds includes "analysis" + $? prices (e.g. $53.815),
              // which otherwise triggers a RexScreener technical report on nonsense tickers like "53".
              !marketLink;

            if (shouldRunCryptoTools) {
              // Immediate phase so the client never sits on "Connecting…" with only the countdown
              // while tools run (crypto domain skips the Pass 0 `markets` status).
              sendStatus("report", "Gathering crypto context…");

              const buildTechnicalReportEmbed = (out: {
                token: any;
                report: any;
              }) => {
                const reportMd = String(out?.report?.report || "").trim();
                const embedPayload = {
                  kind: "technical_report",
                  token: out.token,
                  report: { ...out.report, report: reportMd },
                  dexData:
                    (out.report as any)?.tokenData?.dexData ||
                    (out.report as any)?.dexData ||
                    (out as any)?.dexData ||
                    null,
                  holderAnalytics:
                    (out.report as any)?.holderAnalytics ||
                    (out.report as any)?.holdersData ||
                    null,
                  securityAnalytics:
                    (out.report as any)?.securityAnalytics ||
                    (out.report as any)?.securityData ||
                    null,
                  tweetsData: (out.report as any)?.tweets || null,
                  metadata: (out.report as any)?.metadata || null,
                };
                cryptoEmbedsText = `\n\n\`\`\`cryptotech\n${JSON.stringify(
                  embedPayload
                )}\n\`\`\`\n`;
              };

              if (cryptoIntent?.kind === "technical_report") {
                const resolveChainHint:
                  | "solana"
                  | "bsc"
                  | "base"
                  | "ethereum"
                  | "monad"
                  | "all" =
                  trendingHintForSelectedChain ??
                  (cryptoIntent.chainHint === "bsc"
                    ? "bsc"
                    : cryptoIntent.chainHint === "solana"
                      ? "solana"
                      : cryptoIntent.chainHint === "ethereum"
                        ? "ethereum"
                      : "all");
                const token = await resolveTokenFromQuery({
                  baseUrl,
                  rawTokenQuery: cryptoIntent.rawTokenQuery,
                  chainHint: resolveChainHint,
                });
                if (!token) {
                  cryptoToolData = {
                    kind: "needs_token",
                    reason:
                      "I couldn’t resolve the token. Please provide a token mint/contract address or a clearer ticker (e.g. $SOL, $WIF, or the mint address).",
                  };
                } else {
                  sendStatus("report");
                  const ticker = (
                    token.symbol ||
                    stripTickerPrefix(cryptoIntent.rawTokenQuery) ||
                    ""
                  ).toString();
                  const report = await fetchTechnicalReportStream({
                    userId: chat.userId,
                    contractAddress: token.tokenAddress,
                    ticker,
                    projectName: token.name,
                    forceRefresh: false,
                    explicitChain:
                      reportExplicitChainFromUi(
                        forcedUiCryptoChain ??
                          (cryptoChain as ClawCryptoChainUi | undefined),
                      ),
                    onToken: (d) => {
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({ type: "reportDelta", text: d }) +
                            "\n"
                        )
                      );
                    },
                  });
                  const displayToken = {
                    ...token,
                    tokenAddress: report.contractAddress || token.tokenAddress,
                    chainId: report.chain || token.chainId,
                    symbol: report.ticker || token.symbol,
                    name: report.projectName ?? token.name,
                  };
                  cryptoToolData = {
                    kind: "technical_report",
                    intent: cryptoIntent,
                    token: displayToken,
                    report,
                  };
                  buildTechnicalReportEmbed({
                    token: displayToken,
                    report,
                  });
                }
              } else {
                if (detectCryptoToolIntent(content)?.kind === "technical_report") {
                  sendStatus("report");
                }
                const out = await runCryptoToolAgent({
                  openRouter,
                  model: DEFAULT_CHAT_MODEL,
                  baseUrl,
                  userId: chat.userId,
                  userText: content,
                  forceRefresh: false,
                  forcedUiCryptoChain,
                  onTechnicalReportToken: (d) => {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ type: "reportDelta", text: d }) + "\n",
                      ),
                    );
                  },
                });
                cryptoToolData = out;

                if (out?.kind === "indicator") {
                  const embedPayload = {
                    kind: "indicator",
                    token: out.token,
                    analysis: out.analysis,
                    question: content,
                  };
                  cryptoEmbedsText = `\n\n\`\`\`cryptotech\n${JSON.stringify(
                    embedPayload
                  )}\n\`\`\`\n`;
                } else if (out?.kind === "technical_report") {
                  buildTechnicalReportEmbed({
                    token: out.token,
                    report: out.report,
                  });
                }
              }
            }
          } catch (err) {
            console.error("Claw v5 crypto tool step failed:", err);
            cryptoToolData = null;
            cryptoEmbedsText = "";
          }

          // Top-markets-only path: skip research, draft, and synthesis — show only cards.
          const isTopMarketsOnly = !!topMarketsPayload;

          // Pass 1: web research (skip when top-markets-only)
          let webResearchNotes = "";
          if (!isTopMarketsOnly) {
            sendStatus("research");
            try {
              const researchStream = await openRouter.chat.send({
                model: "openai/gpt-4o-search-preview", //openai/gpt-4o-mini-search-preview
                messages: [
                  {
                    role: "system" as const,
                    content: `${basePrompt}\n\n${alwaysSearchAddendumPrompt}`,
                  },
                  ...normalizedHistory,
                  { role: "user" as const, content },
                ] as any,
                stream: true,
                streamOptions: { includeUsage: true },
              });
              webResearchNotes = (
                await streamOpenRouterDeltasToClient(
                  researchStream,
                  controller,
                  encoder,
                  "research",
                )
              ).trim();
            } catch (err) {
              console.error("Claw v5 web research pass failed:", err);
              webResearchNotes = "";
            }
          }

          // Pass 2: default model draft (skip when top-markets-only)
          let modelDraft = "";
          if (!isTopMarketsOnly) {
            sendStatus("draft");
            try {
              const draftStream = await openRouter.chat.send({
                model: DEFAULT_CHAT_MODEL,
                messages: [
                  { role: "system" as const, content: basePrompt },
                  ...normalizedHistory,
                  { role: "user" as const, content },
                ] as any,
                stream: true,
                streamOptions: { includeUsage: true },
              });
              modelDraft = (
                await streamOpenRouterDeltasToClient(
                  draftStream,
                  controller,
                  encoder,
                  "draft",
                )
              ).trim();
            } catch (err) {
              console.error("Claw v5 default model pass failed:", err);
              modelDraft = "";
            }
          }

          // Pass 3: synthesis (streamed to client); skip when top-markets-only
          sendStatus("synth");
          if (!isTopMarketsOnly) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "synthStart" }) + "\n"),
            );
          }

          const cryptoReportNoDupAddendum =
            cryptoToolData?.kind === "technical_report"
              ? `\n\nIMPORTANT (Crypto Report Mode):
- A full technical report has already been rendered for the user in a dedicated report card UI. DO NOT reprint or restate the report in full.
- Instead, write a concise, high-signal answer to the user's message using the report as background context.
- If the user asked for a "full report" or "analysis", reply with 5-10 bullet "Key takeaways" + 3-5 "Risks / Watchouts", and invite a follow-up question.
- If the user asked about Twitter/X sentiment, public opinion, community chatter, or "what are people saying", focus ONLY on Community Chatter + Top Tweets insights from the report (summarize, do not quote long blocks).
- If the user asked a narrow question (e.g. safety, holders, liquidity), answer using ONLY the relevant section(s) and keep it short.`
              : "";

          // When the user is asking a follow-up about a previously scanned contract, inject that report so the answer stays on-topic.
          const isFollowUpAboutReport =
            reportContextFromHistory &&
            cryptoToolData?.kind !== "technical_report";
          const followUpReportAddendum = isFollowUpAboutReport
            ? `\n\nIMPORTANT (Follow-up about scanned contract):
- The user is asking a follow-up question about the contract/token that was just scanned in this conversation. You MUST answer in the context of the report below; do NOT give a generic or unrelated answer (e.g. do not say "I don't have access to real-time data" without first using the report).
- Use the "Report context from this conversation" section below to answer. If the user asks for something not in the report (e.g. real-time 5-minute volume), say so clearly, then cite what the report does contain (e.g. 24h volume, liquidity) and suggest where they could get real-time data (e.g. DEX aggregators, CEX).`
            : "";
          const followUpReportContextBlock =
            isFollowUpAboutReport && reportContextFromHistory
              ? `\n\n---\n\nReport context from this conversation (use this to answer the user's follow-up; token: ${reportContextFromHistory.tokenSymbol}${reportContextFromHistory.tokenName ? ` / ${reportContextFromHistory.tokenName}` : ""}):\n\n${reportContextFromHistory.reportText}`
              : "";
          // If we have top prediction markets payload, stream it first as card embed.
          if (topMarketsPayload) {
            const topMarketsText = `\n\n\`\`\`topmarkets\n${JSON.stringify(topMarketsPayload)}\n\`\`\`\n`;
            fullAiResponse += topMarketsText;
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "chunk", content: topMarketsText }) + "\n")
            );
          }

          // If we have RexMarkets embeds, stream them so they render above the answer.
          if (rexEmbeds.length > 0) {
            const embedText = rexEmbeds
              .map((e) => `\n\n\`\`\`rexmarkets\n${JSON.stringify(e)}\n\`\`\`\n`)
              .join("");
            fullAiResponse += embedText;
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "chunk", content: embedText }) + "\n")
            );
          }

          // If we have crypto tool output (cryptotech embed or technical report markdown), stream it first.
          if (cryptoEmbedsText) {
            fullAiResponse += cryptoEmbedsText;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "chunk", content: cryptoEmbedsText }) + "\n"
              )
            );
          }

          // Top-markets-only: contextual suggest message using detected category and provider.
          if (isTopMarketsOnly) {
            const topMarketsCategory = extractTopMarketsCategory(content);
            const topMarketsProvider =
              marketMode === "Kalshi"
                ? ("kalshi" as const)
                : marketMode === "Polymarket"
                  ? ("polymarket" as const)
                  : marketMode === "Markets" && predictionSubmode === "limitless"
                    ? ("limitless" as const)
                    : marketMode === "Markets" && predictionSubmode === "myriad"
                      ? ("myriad" as const)
                    : marketMode === "Markets" && predictionSubmode === "predictfun"
                      ? ("predictfun" as const)
                    : inferProviderFromTopMarketsQuery(content);
            const topMarketsCaption = buildTopMarketsSuggestMessage({
              category: topMarketsCategory,
              provider: topMarketsProvider,
            });
            fullAiResponse += topMarketsCaption;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "chunk", content: topMarketsCaption }) + "\n"
              )
            );
          } else {
            const synthesisUserContent = [
              `User question:\n${content}`,
              raptorxMarketData
                ? `\n\nRaptorX market data (Kalshi/Polymarket/Limitless/Myriad/Predict.fun):\n${JSON.stringify(
                    raptorxMarketData
                  )}`
                : "",
              cryptoToolData && cryptoToolData.kind !== "none"
                ? `\n\nRaptorX crypto tool output:\n${JSON.stringify(cryptoToolData)}`
                : "",
              followUpReportContextBlock,
              webResearchNotes ? `\n\nWeb research notes:\n${webResearchNotes}` : "",
              modelDraft ? `\n\nModel draft:\n${modelDraft}` : "",
              cryptoReportNoDupAddendum,
              `\n\nNow write the final answer for the user.`,
            ].join("");

            const synthesisMessages = [
              {
                role: "system" as const,
                content: `${basePrompt}\n\n${synthesisAddendumPrompt}${followUpReportAddendum}`,
              },
              {
                role: "user" as const,
                content: synthesisUserContent,
              },
            ];

            const synthesisStream = await openRouter.chat.send({
              model: DEFAULT_CHAT_MODEL,
              messages: synthesisMessages as any,
              stream: true,
              streamOptions: { includeUsage: true },
            });

            for await (const chunk of synthesisStream) {
              const chunkContent = chunk.choices[0]?.delta?.content;
              if (chunkContent) {
                fullAiResponse += chunkContent;
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type: "chunk", content: chunkContent }) + "\n"
                  )
                );
              }
            }
          }

          // After streaming is complete, save the full AI response to database
          // Ensure a Sources section exists when we have any URLs (from user or web research).
          // Prefer links extracted from web research; fall back to user-provided URLs.
          if (!hasSourcesSection(fullAiResponse)) {
            const urlsFromResearch = extractUrls(webResearchNotes);
            const merged = normalizeAndDedupeUrls(
              [...urlsFromResearch, ...urlsInUserMessage],
              12
            );

            if (merged.length > 0) {
              const sourcesList = merged
                .map((u) => `- [${u}](${u})`)
                .join("\n");
              const sourcesAppend = `\n\n---\n\nSources:\n${sourcesList}\n`;
              fullAiResponse += sourcesAppend;
              // Stream the same text so the client’s running buffer matches the final `aiMessage`
              // (avoids a visible “restart” when auto-appended Sources were never chunked).
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "chunk", content: sourcesAppend }) + "\n"
                )
              );
            }
          }

          const aiMessage = await prisma.clawV5Message.create({
            data: {
              chatId: id,
              role: "assistant",
              content: fullAiResponse,
            },
          });

          // Update chat updatedAt
          await prisma.clawV5Chat.update({
            where: { id },
            data: { updatedAt: new Date() },
          });

          // Send the final AI message
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "aiMessage", data: aiMessage }) + "\n"
            )
          );
        } catch (err) {
          console.error("Streaming error:", err);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "error", error: "Streaming failed" }) +
                "\n"
            )
          );
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
  } catch (error) {
    console.error("Error processing message:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
