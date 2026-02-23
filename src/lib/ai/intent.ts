import type { OpenRouter } from "@openrouter/sdk";

export type QuestionDomain = "market" | "crypto" | "other";

export function maybeCryptoHeuristic(text: string): boolean {
  const t = text.toLowerCase();

  // Strong crypto keywords (avoid generic "market" / "volume" which appear everywhere)
  const chainHits = [
    "solana",
    "sol ",
    "spl",
    "bnb",
    "bsc",
    "binance smart chain",
    "base",
    "ethereum",
    "eth ",
  ].some((k) => t.includes(k));

  const venueHits = [
    "raydium",
    "orca",
    "jupiter",
    "pump.fun",
    "pumpfun",
    "dex",
    "amm",
    "liquidity pool",
    "lp ",
    "clmm",
  ].some((k) => t.includes(k));

  const assetHits = [
    "coin",
    "coins",
    "token",
    "tokens",
    "memecoin",
    "meme coin",
    "ticker",
    "$", // often used for tickers like $SOL
  ].some((k) => t.includes(k));

  const momentumHits = [
    "top movers",
    "movers",
    "gainers",
    "losers",
    "trending",
    "breakout",
    "breaking out",
    "momentum",
    "volume spike",
    "highest volume",
    "most volume",
  ].some((k) => t.includes(k));

  const taHits = [
    "technical report",
    "technical analysis",
    "ta ",
    "rsi",
    "macd",
    "bullish divergence",
    "bearish divergence",
    "cup and handle",
    "support",
    "resistance",
    "key levels",
    "timeframe",
    "15m",
    "5m",
    "10m",
    "1h",
    "4h",
    "1d",
  ].some((k) => t.includes(k));

  const riskHits = [
    "rug",
    "rug pull",
    "rugpull",
    "honeypot",
    "scam",
    "risk assessment",
    "liquidity locked",
    "locked liquidity",
    "holder concentration",
    "organic volume",
    "botted",
    "botted volume",
  ].some((k) => t.includes(k));

  const sentimentHits = [
    "sentiment",
    "twitter",
    "x (twitter)",
    "x sentiment",
    "big accounts",
    "whale",
    "whales",
    "order flow",
    "buy flows",
    "sell flows",
    "narrative",
  ].some((k) => t.includes(k));

  // Time-window phrasing common in scalper/momentum questions
  const timeWindowHits = [
    "last 1 minute",
    "last 5 minutes",
    "last 10 minutes",
    "last 15 minutes",
    "last hour",
    "past 5 minutes",
    "past 10 minutes",
    "past hour",
    "in the last 5 minutes",
    "in the last 10 minutes",
    "in the last hour",
  ].some((k) => t.includes(k));

  // If they explicitly mention prediction markets, don't treat as pure crypto.
  const predictionMarketHits = [
    "polymarket",
    "kalshi",
    "prediction market",
    "prediction markets",
    "implied probability",
    "contract",
    "yes price",
    "no price",
  ].some((k) => t.includes(k));

  if (predictionMarketHits) return false;

  // Strong enough to classify as crypto
  return (
    (chainHits && (momentumHits || taHits || riskHits || sentimentHits)) ||
    (venueHits && (momentumHits || taHits || riskHits || sentimentHits)) ||
    (assetHits && (taHits || riskHits || sentimentHits)) ||
    (momentumHits && (chainHits || assetHits) && timeWindowHits) ||
    (t.includes("trending on raptorx") && (chainHits || assetHits))
  );
}

function safeJsonParse(input: string | undefined): any {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export async function classifyQuestionDomain(params: {
  openRouter: OpenRouter;
  model: string;
  text: string;
}): Promise<QuestionDomain> {
  const text = params.text || "";
  if (maybeCryptoHeuristic(text)) return "crypto";

  try {
    const resp: any = await params.openRouter.chat.send({
      model: params.model,
      stream: false,
      messages: [
        {
          role: "system",
          content: `Classify the user's message into ONE domain:
- "crypto": crypto assets/chains/tokens/on-chain/price movers, technical analysis (RSI/MACD), risk checks (rug/honeypot/liquidity), sentiment, order flow
- "market": prediction markets + event outcomes/probabilities (Kalshi/Polymarket), politics/econ forecasting questions likely to exist as prediction markets
- "other": everything else

Return ONLY valid JSON with shape: {"domain":"crypto"|"market"|"other"}. No extra keys, no prose.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0,
      max_tokens: 30,
    } as any);

    const content = resp?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      const parsed = safeJsonParse(content);
      const d = parsed?.domain;
      if (d === "crypto" || d === "market" || d === "other") return d;
    }
  } catch {
    // ignore
  }

  return "other";
}


