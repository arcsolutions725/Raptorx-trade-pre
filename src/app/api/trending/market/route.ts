import { NextRequest, NextResponse } from "next/server";
import { applyDexMarketOverlay } from "@/lib/dexscreenerMarketData";

export const dynamic = "force-dynamic";

type OverlayItem = Record<string, unknown> & { tokenAddress?: string; chainId?: string };

/**
 * Patch mcap / price / pair onto screener rows that already rendered from the
 * fast Birdeye list. Live on-chain pool reads stay off this path — they are
 * what held the first paint for ~10s.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      chain?: string;
      items?: unknown[];
    };
    const items = Array.isArray(body.items)
      ? (body.items.filter((x) => x && typeof x === "object") as OverlayItem[])
      : [];
    const chain = String(body.chain || "").toLowerCase();

    if (!items.length) {
      const res = NextResponse.json({ ok: true, items: [] });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const overlaid =
      chain === "all"
        ? await overlayMixedChains(items)
        : await applyDexMarketOverlay(items, chain, {
            livePool: false,
            dexOnly: true,
          });

    const res = NextResponse.json({ ok: true, items: overlaid });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("trending/market POST:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function overlayMixedChains(items: OverlayItem[]): Promise<OverlayItem[]> {
  const groups = new Map<string, OverlayItem[]>();
  for (const it of items) {
    const c = String(it?.chainId || "").toLowerCase() || "solana";
    const list = groups.get(c);
    if (list) list.push(it);
    else groups.set(c, [it]);
  }

  const byAddr = new Map<string, OverlayItem>();
  await Promise.all(
    Array.from(groups.entries()).map(async ([c, group]) => {
      const done = await applyDexMarketOverlay(group, c, {
        livePool: false,
        dexOnly: true,
      });
      for (const row of done) {
        const k = String(row?.tokenAddress ?? "").toLowerCase();
        if (k) byAddr.set(`${c}|${k}`, row);
      }
    }),
  );

  return items.map((it) => {
    const c = String(it?.chainId || "").toLowerCase() || "solana";
    const k = String(it?.tokenAddress ?? "").toLowerCase();
    return (k && byAddr.get(`${c}|${k}`)) || it;
  });
}
