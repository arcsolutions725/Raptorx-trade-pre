/* eslint-disable @typescript-eslint/no-explicit-any */
import type { OpenRouter } from "@openrouter/sdk";
import { POST as trendingPOST } from "@/app/api/trending/route";
import { POST as technicalAnalysisPOST } from "@/app/api/technical-analysis/route";
import { POST as generateReportPOST } from "@/app/api/generate-report/route";

export type CryptoIndicatorType = "macd" | "rsi" | "cuphandle" | "all";

export type CryptoToolIntent =
  | {
      kind: "technical_report";
      rawTokenQuery: string;
      chainHint?: "solana" | "bsc" | "all";
    }
  | {
      kind: "indicator";
      indicatorType: CryptoIndicatorType;
      rawTokenQuery: string;
      timeframe?: string;
      chainHint?: "solana" | "bsc" | "all";
    };

export type ResolvedToken = {
  chainId: string; // "solana" | "bsc"
  tokenAddress: string;
  symbol?: string;
  name?: string;
  logo?: string;
  marketCap?: number;
  liquidityUsd?: number;
};

export type TechnicalAnalysisResult = {
  indicatorType: CryptoIndicatorType;
  tokenAddress: string;
  timeframe: string;
  chartData: any;
  analysis: string;
};

export type TechnicalReportResult = {
  contractAddress: string;
  ticker: string;
  projectName?: string;
  chain?: string;
  report: string; // markdown
  tokenData?: any;
  tweets?: any;
  holderAnalytics?: any;
  securityAnalytics?: any;
  metadata?: any;
};

function stripTickerPrefix(s: string) {
  return s.replace(/^\$/, "").trim();
}

function guessTimeframe(text: string): string | undefined {
  // Accept common formats used by the TA endpoint (useTechnicalAnalysis): 1m/5m/15m/1h/4h/D/W
  const m = text.match(/\b(1m|5m|15m|1h|4h|d|w)\b/i);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  if (v === "d") return "D";
  if (v === "w") return "W";
  return v;
}

function looksLikeEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

function looksLikeSolanaAddress(s: string) {
  // Loose check: base58-ish and common Solana mint lengths (32..44)
  const t = s.trim();
  if (t.length < 32 || t.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(t);
}

function extractAddressFromText(text: string): string | null {
  // EVM
  const evmMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (evmMatch) return evmMatch[0];

  // Solana (base58, allow suffix text)
  const solMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  if (solMatch) return solMatch[0];

  return null;
}

export function detectCryptoToolIntent(
  userText: string,
): CryptoToolIntent | null {
  const text = userText.trim();
  const lower = text.toLowerCase();
  const compact = text.replace(/\s+/g, " ").trim();

  const extractedAddress = extractAddressFromText(text);
  if (extractedAddress) {
    return {
      kind: "technical_report",
      rawTokenQuery: extractedAddress,
      chainHint: "all",
    };
  }

  // -----------------------------
  // 1️⃣ Address-only → FULL REPORT
  // -----------------------------
  if (looksLikeEvmAddress(text) || looksLikeSolanaAddress(text)) {
    return {
      kind: "technical_report",
      rawTokenQuery: text,
      chainHint: "all",
    };
  }

  // -----------------------------
  // 2️⃣ Extract token (prefer $TICKER)
  // -----------------------------
  const tickerMatch = text.match(/\$([A-Za-z0-9]{2,15})/);
  const rawTokenQuery = tickerMatch?.[1] ?? text;

  // -----------------------------
  // 3️⃣ Explicit indicator detection
  // -----------------------------
  const timeframe = guessTimeframe(text);

  if (/\bmacd\b/i.test(lower)) {
    return {
      kind: "indicator",
      indicatorType: "macd",
      rawTokenQuery,
      timeframe,
      chainHint: "all",
    };
  }

  if (/\brsi\b/i.test(lower) || /\boverbought\b|\boversold\b/i.test(lower)) {
    return {
      kind: "indicator",
      indicatorType: "rsi",
      rawTokenQuery,
      timeframe,
      chainHint: "all",
    };
  }

  if (/\bcup(\s|&|and)?handle\b/i.test(lower)) {
    return {
      kind: "indicator",
      indicatorType: "cuphandle",
      rawTokenQuery,
      timeframe,
      chainHint: "all",
    };
  }

  // -----------------------------
  // 4️⃣ Generic analysis → FULL REPORT
  // -----------------------------
  const genericAnalysis =
    /\b(analyze|analysis|analysis of|technical analysis|full report|deep dive|breakdown)\b/i.test(
      lower,
    );

  if (genericAnalysis) {
    return {
      kind: "technical_report",
      rawTokenQuery,
      chainHint: "all",
    };
  }

  // -----------------------------
  // 5️⃣ Explicit report wording
  // -----------------------------
  if (
    /\b(full report|technical report|generate report|report for|report of)\b/i.test(
      lower,
    )
  ) {
    return {
      kind: "technical_report",
      rawTokenQuery,
      chainHint: "all",
    };
  }

  // -----------------------------
  // 6️⃣ Lone ticker → FULL REPORT
  // -----------------------------
  const loneToken = /^\$?[A-Za-z0-9]{2,15}$/.test(compact);

  if (loneToken) {
    return {
      kind: "technical_report",
      rawTokenQuery: stripTickerPrefix(compact),
      chainHint: "all",
    };
  }

  return null;
}

export async function resolveTokenFromQuery(opts: {
  baseUrl: string;
  rawTokenQuery: string;
  chainHint?: "solana" | "bsc" | "all";
}): Promise<ResolvedToken | null> {
  const chain = opts.chainHint || "all";
  const qRaw = stripTickerPrefix(opts.rawTokenQuery);

  // If address-like, resolve by address
  const maybeAddr = qRaw.trim();
  const isAddr =
    looksLikeEvmAddress(maybeAddr) || looksLikeSolanaAddress(maybeAddr);
  const search_type = isAddr ? "address" : "ticker";
  const search_query = maybeAddr;

  // IMPORTANT:
  // Don't call `${baseUrl}/api/...` from server-side tools in Vercel-protected deployments,
  // because Deployment Protection can 401 those self-calls (no auth cookies).
  // Instead, invoke the Next route handlers in-process.
  const req = new Request("http://internal/api/trending", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chain,
      limit: 10,
      offset: 0,
      include_creation: false,
      verified_only: false,
      search_query,
      search_type,
    }),
  });
  const res = await trendingPOST(req as any);

  if (!res.ok) return null;
  const json: any = await res.json().catch(() => ({}));
  const items: any[] = Array.isArray(json?.items) ? json.items : [];
  if (items.length === 0) return null;

  const best = items[0];
  const tokenAddress = String(best?.tokenAddress || "").trim();
  const chainId = String(best?.chainId || best?.chain || "").trim();
  if (!tokenAddress || !chainId) return null;

  return {
    chainId,
    tokenAddress,
    symbol: best?.symbol ?? undefined,
    name: best?.name ?? undefined,
    logo: best?.logo ?? undefined,
    marketCap: typeof best?.marketCap === "number" ? best.marketCap : undefined,
    liquidityUsd:
      typeof best?.liquidityUsd === "number" ? best.liquidityUsd : undefined,
  };
}

async function parseTechnicalAnalysisSse(
  res: Response,
): Promise<TechnicalAnalysisResult> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let analysisText = "";
  let chartData: any = null;
  let meta: any = null;

  if (!reader) {
    throw new Error("Missing response stream");
  }

  let firstChunk = true;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });

    if (firstChunk) {
      // first chunk may contain: "data: {json}\n\n" followed by analysis text
      const jsonMatch = chunk.match(/^data: (.+)$/m);
      if (jsonMatch?.[1]) {
        try {
          meta = JSON.parse(jsonMatch[1]);
          chartData = meta?.chartData ?? null;
        } catch {
          // ignore
        }
      }
      const idx = chunk.indexOf("\n\n");
      if (idx >= 0) {
        analysisText += chunk.substring(idx + 2);
      } else {
        analysisText += chunk;
      }
      firstChunk = false;
    } else {
      analysisText += chunk;
    }
  }

  return {
    indicatorType: meta?.indicatorType ?? meta?.indicator ?? "all",
    tokenAddress: meta?.tokenAddress ?? meta?.tokenAddress ?? "",
    timeframe: meta?.timeframe ?? "15m",
    chartData: chartData || {},
    analysis: analysisText,
  };
}

export async function fetchTechnicalAnalysis(opts: {
  baseUrl: string;
  userId: string;
  indicatorType: CryptoIndicatorType;
  tokenAddress: string;
  timeframe?: string;
}): Promise<TechnicalAnalysisResult> {
  const req = new Request("http://internal/api/technical-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      indicatorType: opts.indicatorType,
      tokenAddress: opts.tokenAddress,
      timeframe: opts.timeframe || "15m",
      userId: opts.userId,
    }),
  });
  const res = await technicalAnalysisPOST(req as any);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Technical analysis failed (${res.status})`);
  }
  return parseTechnicalAnalysisSse(res);
}

export async function fetchTechnicalReport(opts: {
  baseUrl: string;
  userId: string;
  contractAddress: string;
  ticker: string;
  projectName?: string;
  forceRefresh?: boolean;
}): Promise<TechnicalReportResult> {
  const req = new Request("http://internal/api/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": opts.userId },
    body: JSON.stringify({
      contractAddress: opts.contractAddress,
      ticker: opts.ticker,
      projectName: opts.projectName,
      forceRefresh: opts.forceRefresh ?? false,
    }),
  });
  const res = await generateReportPOST(req as any);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Generate report failed (${res.status})`);
  }
  return {
    contractAddress: opts.contractAddress,
    ticker: opts.ticker,
    projectName: opts.projectName,
    chain: json?.metadata?.chain,
    report: json?.report || "",
    tokenData: json?.tokenData,
    tweets: json?.tweets,
    holderAnalytics: json?.holderAnalytics,
    securityAnalytics: json?.securityAnalytics,
    metadata: json?.metadata,
  };
}

export async function getCryptoToolOutputsForQuery(opts: {
  baseUrl: string;
  userId: string;
  userText: string;
  forceRefresh?: boolean;
}): Promise<
  | { kind: "none" }
  | { kind: "needs_token"; reason: string }
  | {
      kind: "indicator";
      intent: CryptoToolIntent & { kind: "indicator" };
      token: ResolvedToken;
      analysis: TechnicalAnalysisResult;
    }
  | {
      kind: "technical_report";
      intent: CryptoToolIntent & { kind: "technical_report" };
      token: ResolvedToken;
      report: TechnicalReportResult;
    }
> {
  const intent = detectCryptoToolIntent(opts.userText);
  if (!intent) return { kind: "none" };

  const token = await resolveTokenFromQuery({
    baseUrl: opts.baseUrl,
    rawTokenQuery: intent.rawTokenQuery,
    chainHint: intent.chainHint,
  });

  if (!token) {
    return {
      kind: "needs_token",
      reason:
        "I couldn’t resolve the token. Please provide a token mint/contract address or a clearer ticker (e.g. $SOL, $WIF, or the mint address).",
    };
  }

  if (intent.kind === "technical_report") {
    const ticker = (
      token.symbol ||
      stripTickerPrefix(intent.rawTokenQuery) ||
      ""
    ).toString();
    const report = await fetchTechnicalReport({
      baseUrl: opts.baseUrl,
      userId: opts.userId,
      contractAddress: token.tokenAddress,
      ticker,
      projectName: token.name,
      forceRefresh: opts.forceRefresh ?? false,
    });
    return { kind: "technical_report", intent, token, report };
  }

  const analysis = await fetchTechnicalAnalysis({
    baseUrl: opts.baseUrl,
    userId: opts.userId,
    indicatorType: intent.indicatorType,
    tokenAddress: token.tokenAddress,
    timeframe: intent.timeframe || "15m",
  });
  return { kind: "indicator", intent, token, analysis };
}

// Placeholder exports for future OpenRouter tool-calling wiring (optional)
export function getCryptoOpenRouterTools() {
  return [
    {
      type: "function",
      function: {
        name: "resolve_token",
        description:
          "Resolve a crypto token ticker/name/address to a canonical tokenAddress and chainId using RaptorX trending search.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Ticker like SOL, a name, or a mint/contract address.",
            },
            chain: { type: "string", enum: ["solana", "bsc", "all"] },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_indicator_analysis",
        description:
          "Generate technical indicator analysis (MACD/RSI/CupHandle/All) for a token address using RaptorX's /api/technical-analysis endpoint.",
        parameters: {
          type: "object",
          properties: {
            indicatorType: {
              type: "string",
              enum: ["macd", "rsi", "cuphandle", "all"],
            },
            tokenAddress: { type: "string" },
            timeframe: {
              type: "string",
              description: "1m/5m/15m/1h/4h/D/W",
              default: "15m",
            },
          },
          required: ["indicatorType", "tokenAddress"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_technical_report",
        description:
          "Generate a full crypto technical report using RaptorX's /api/generate-report endpoint (document-style markdown).",
        parameters: {
          type: "object",
          properties: {
            contractAddress: { type: "string" },
            ticker: { type: "string" },
            projectName: { type: "string" },
          },
          required: ["contractAddress", "ticker"],
        },
      },
    },
  ];
}

export async function runCryptoToolAgent(_opts: {
  openRouter: OpenRouter;
  model: string;
  baseUrl: string;
  userId: string;
  userText: string;
  forceRefresh?: boolean;
}) {
  // For now we use deterministic keyword routing via detectCryptoToolIntent().
  // This keeps behavior stable and aligns with the UX of your existing buttons.
  return getCryptoToolOutputsForQuery({
    baseUrl: _opts.baseUrl,
    userId: _opts.userId,
    userText: _opts.userText,
    forceRefresh: _opts.forceRefresh ?? false,
  });
}
