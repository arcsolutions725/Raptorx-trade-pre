import { NextResponse } from "next/server";

export type LimitlessNavItem = {
  id: string;
  name: string;
  slug: string;
  children: unknown[];
};

/**
 * GET /api/limitless/navigation
 * Proxies https://api.limitless.exchange/navigation
 * Returns nav items without path (id, name, slug, children).
 */
export async function GET() {
  try {
    const res = await fetch("https://api.limitless.exchange/navigation", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Limitless navigation error:", err);
      return NextResponse.json(
        { error: `Limitless API ${res.status}: ${err}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as LimitlessNavItem[];

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Invalid navigation response", items: [] },
        { status: 200 }
      );
    }

    const items = data.map(({ id, name, slug, children }) => ({
      id,
      name,
      slug,
      children,
    }));

    return NextResponse.json(items, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Limitless navigation error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch navigation";
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}
