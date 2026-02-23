import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tagSlug = searchParams.get("tag");

    if (!tagSlug) {
      return NextResponse.json(
        { error: "Tag parameter is required", tags: [] },
        { status: 400 }
      );
    }

    // Fetch tags from Polymarket filteredBySlug endpoint
    const url = `https://polymarket.com/api/tags/filteredBySlug?tag=${encodeURIComponent(tagSlug)}&status=active`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket API error response:", errorText);
      throw new Error(
        `Polymarket API returned ${response.status}: ${errorText}`
      );
    }

    const tags = await response.json();

    // Transform Polymarket tags to array of tag objects with label and slug
    // The API returns an array of tag objects with properties like label, slug, etc.
    let tagsArray: Array<{ label: string; slug: string }> = [];

    if (Array.isArray(tags)) {
      tagsArray = tags
        .map((tag: any) => {
          const label = tag.label || tag.slug || null;
          const slug = tag.slug || tag.label || null;
          if (!label || !slug) return null;
          return { label, slug };
        })
        .filter(
          (
            tag: { label: string; slug: string } | null
          ): tag is { label: string; slug: string } => tag !== null
        );
    }

    return NextResponse.json(
      { tags: tagsArray },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Polymarket tags API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch tags";

    return NextResponse.json(
      { error: errorMessage, tags: [] },
      { status: 500 }
    );
  }
}

