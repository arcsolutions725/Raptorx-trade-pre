/**
 * Drop Solana impersonators (fake stocks / brands / AI names) from the
 * default RexScreener trending table. Search is left alone so users can
 * still look a ticker up on purpose.
 */

const BRAND_TICKERS = new Set([
  "AAPL",
  "ABNB",
  "ADBE",
  "AMD",
  "AMZN",
  "AVGO",
  "BA",
  "BABA",
  "BRK",
  "BRKB",
  "COIN",
  "CRM",
  "CSCO",
  "DIS",
  "GME",
  "GOOG",
  "GOOGL",
  "HOOD",
  "IBM",
  "INTC",
  "JNJ",
  "JPM",
  "JUSDC",
  "JUSDT",
  "LCID",
  "MA",
  "META",
  "MSFT",
  "MSTR",
  "NFLX",
  "NIO",
  "NKE",
  "NVDA",
  "ORCL",
  "PLTR",
  "PYPL",
  "QCOM",
  "QQQ",
  "RIVN",
  "SHOP",
  "SNDK",
  "SNIDK",
  "SNOW",
  "SPY",
  "SQ",
  "TSLA",
  "TXN",
  "UBER",
  "UNH",
  "V",
  "VOO",
  "WMT",
  "XOM",
  "CLAUDE",
  "CHATGPT",
  "OPENAI",
  "GEMINI",
]);

const BRAND_NAME_RE =
  /\b(nvidia|robinhood|sandisk(?:\s+corporation)?|tesla(?:\s+inc)?|apple\s+inc|microsoft|amazon(?:\.com)?|alphabet\s+inc|meta\s+platforms|openai|chatgpt|claude\s+ai|jupiter\s+lend\s+usdc|jupiter\s+lend\s+usdt)\b/i;

function normalizeTicker(raw?: string | null): string {
  return String(raw || "")
    .replace(/^\$/, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

function tickerLooksLikeBrand(symbol?: string | null): boolean {
  const ticker = normalizeTicker(symbol);
  if (!ticker) return false;
  if (BRAND_TICKERS.has(ticker)) return true;
  // xStocks / wrapped tickers: xNVDA, NVDAX, NVDAXSTOCK
  if (ticker.startsWith("X") && BRAND_TICKERS.has(ticker.slice(1))) return true;
  if (ticker.endsWith("X") && BRAND_TICKERS.has(ticker.slice(0, -1))) return true;
  return false;
}

export function isSolanaBrandImpersonator(token: {
  symbol?: string | null;
  name?: string | null;
}): boolean {
  if (tickerLooksLikeBrand(token.symbol)) return true;
  return BRAND_NAME_RE.test(String(token.name || ""));
}

/** Absurd FDV with almost no liquidity — typical of copycat listings. */
export function passesSolanaLiquiditySanity(token: {
  marketCap?: number | null;
  liquidityUsd?: number | null;
}): boolean {
  const mc = Number(token.marketCap);
  const liq = Number(token.liquidityUsd);
  if (!Number.isFinite(mc) || !(mc > 0)) return true;
  const liquidity = Number.isFinite(liq) ? liq : 0;
  if (mc >= 1e12 && liquidity < 5000) return false;
  if (mc >= 1e9 && liquidity < 200 && mc / Math.max(liquidity, 1e-12) > 5e7) {
    return false;
  }
  if (mc > 5e7 && liquidity > 0 && liquidity < 40) return false;
  return true;
}

export function shouldKeepSolanaTrendingToken(token: {
  chainId?: string | null;
  symbol?: string | null;
  name?: string | null;
  marketCap?: number | null;
  liquidityUsd?: number | null;
}): boolean {
  const chain = String(token.chainId || "solana").toLowerCase();
  if (chain && chain !== "solana") return true;
  if (isSolanaBrandImpersonator(token)) return false;
  return passesSolanaLiquiditySanity(token);
}
