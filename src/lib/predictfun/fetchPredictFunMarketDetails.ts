/* eslint-disable @typescript-eslint/no-explicit-any */
import { enrichPredictFunCategoryChildren } from "@/lib/predictfun/enrichPredictFunCategoryChildren";
import { extractPredictFunCategoryChildMarkets } from "@/lib/predictfun/extractCategoryChildMarkets";
import { mapPredictFunMarketDetailToMarketDetails } from "@/lib/predictfun/mapPredictFunMarketDetails";
import type { MarketDetails } from "@/hooks/useMarketDetails";
import type { PredictFunApiMarket } from "@/lib/predictfun/mapPredictFunMarketRow";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";

type PredictFunApiBody = {
  data?: PredictFunApiMarket & Record<string, unknown>;
  success?: boolean;
};

/** Shared predict.fun detail fetch (category slug or numeric market id). */
export async function fetchPredictFunMarketDetailsById(
  id: string
): Promise<MarketDetails | { error: string; details?: string }> {
  const trimmed = String(id || "").trim();
  if (!trimmed) return { error: "id required" };

  const params = new URLSearchParams({ includeStats: "true" });

  try {
    const categoryAttempt = await predictFunGetJson(
      `/categories/${encodeURIComponent(trimmed)}`,
      params
    );
    const target = categoryAttempt.ok
      ? categoryAttempt
      : await predictFunGetJson(`/markets/${encodeURIComponent(trimmed)}`, params);

    if (!target.ok || !target.body) {
      return { error: `Predict.fun fetch failed for ${trimmed}` };
    }

    let apiBody = target.body as PredictFunApiBody;

    if (categoryAttempt.ok) {
      const rawCategory = apiBody?.data ?? apiBody;
      const childMarkets = extractPredictFunCategoryChildMarkets(
        rawCategory && typeof rawCategory === "object"
          ? (rawCategory as Record<string, unknown>)
          : null
      );
      if (childMarkets.length > 0) {
        const enriched = await enrichPredictFunCategoryChildren(childMarkets);
        apiBody = {
          ...apiBody,
          data: {
            ...(rawCategory as Record<string, unknown>),
            markets: enriched,
          } as unknown as PredictFunApiMarket & Record<string, unknown>,
        };
      }
    }

    return mapPredictFunMarketDetailToMarketDetails(apiBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: "Predict.fun fetch failed", details: msg };
  }
}
