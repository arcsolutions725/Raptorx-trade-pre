import { NextRequest, NextResponse } from "next/server";

// Developer endpoint: no API key. Production (b.quote-api): requires API key from DFlow.
// Docs: https://pond.dflow.net/build/recipes/api-keys
const DFLOW_QUOTE_API_BASE =
  process.env.DFLOW_QUOTE_API_BASE || "https://dev-quote-api.dflow.net";

const isProductionQuoteApi = (base: string) =>
  base.includes("b.quote-api.dflow.net");

/**
 * GET /api/kalshi/dflow-order
 * Proxies to DFlow GET /order. Sends x-api-key only for production base URL; dev endpoint is used without a key.
 * Docs: https://pond.dflow.net/build/trading-api/order/order
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.DFLOW_API_KEY;
    const base = DFLOW_QUOTE_API_BASE;
    const useProduction = isProductionQuoteApi(base);

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    if (!queryString) {
      return NextResponse.json(
        { error: "Missing query params: inputMint, outputMint, amount" },
        { status: 400 }
      );
    }

    const url = `${base}/order?${queryString}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // Only send API key for production. Dev endpoint works without key; sending a key to dev can cause 403.
    if (useProduction && apiKey) {
      headers["x-api-key"] = apiKey;
    }

    let response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    let data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    // If production returns 403 (e.g. invalid key), retry once with dev endpoint (no key).
    if (response.status === 403 && useProduction) {
      const devBase = "https://dev-quote-api.dflow.net";
      const devUrl = `${devBase}/order?${queryString}`;
      const devResponse = await fetch(devUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const devData = (await devResponse.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (devResponse.ok) {
        return NextResponse.json(devData);
      }
      response = devResponse;
      data = devData;
    }

    if (!response.ok) {
      if (response.status === 403) {
        const fromDflow =
          (typeof data?.error === "string" && data.error) ||
          (typeof data?.msg === "string" && data.msg);
        const suggestion = useProduction
          ? " Set DFLOW_QUOTE_API_BASE=https://dev-quote-api.dflow.net in .env to use the developer endpoint (no key required), then restart the app."
          : "";
        return NextResponse.json(
          {
            error: fromDflow || `Order request denied (403).${suggestion}`,
          },
          { status: 403 },
        );
      }
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DFlow order proxy error:", error);
    const message =
      error instanceof Error ? error.message : "DFlow order request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
