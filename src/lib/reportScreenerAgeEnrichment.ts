/* eslint-disable @typescript-eslint/no-explicit-any */
import { enrichWithCreationMixedChains } from "@/lib/birdeyeTokenCreationInfo";

/** Birdeye creation-info + Dexscreener fallback for registry screener rows (Golden / Pump). */
export async function enrichReportScreenerTokenAges(
  items: any[],
): Promise<Record<string, number | undefined>> {
  const apiKey = process.env.UNIBLOCK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing UNIBLOCK_API_KEY");
  }
  if (!items.length) return {};

  const enriched = await enrichWithCreationMixedChains(items, apiKey, 6);
  const ages: Record<string, number | undefined> = {};

  for (const row of enriched) {
    const addr = (row?.tokenAddress as string | undefined)?.trim();
    if (!addr) continue;
    const t = row?.createdAt;
    const sec =
      typeof t === "number" && Number.isFinite(t) && t > 0
        ? t > 1e12
          ? Math.floor(t / 1000)
          : t
        : undefined;
    ages[addr] = sec;
    if (addr.startsWith("0x")) {
      ages[addr.toLowerCase()] = sec;
    }
  }

  return ages;
}
