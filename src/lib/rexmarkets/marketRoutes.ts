/* eslint-disable @typescript-eslint/no-explicit-any */

function pickStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

/**
 * Resolved URL path for a Rex Markets detail page, or null if it cannot be determined.
 */
export function getRexmarketsDetailHref(
  m: any,
  dataSource: "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun" | "all"
): string | null {
  const source = (m?._source as typeof dataSource | undefined) || dataSource;
  const enc = encodeURIComponent;

  if (source === "all") return null;

  if (source === "predictfun") {
    const id =
      pickStr(m?.id) ||
      pickStr(m?.ticker) ||
      pickStr(m?.predictFunMarketId != null ? String(m.predictFunMarketId) : "");
    if (!id) return null;
    return `/rexmarkets/predict-fun/${enc(id)}`;
  }

  if (source === "myriad") {
    const s =
      pickStr(m?.slug) ||
      pickStr(m?.ticker) ||
      pickStr(m?.rawEventData?.slug);
    if (!s) return null;
    return `/rexmarkets/myriad/${enc(s)}`;
  }

  const slug =
    pickStr(m?.slug) ||
    pickStr(m?.rawEventData?.slug) ||
    "";

  const ticker =
    pickStr(m?.event_ticker) ||
    pickStr(m?.ticker) ||
    pickStr(m?.rawEventData?.ticker) ||
    pickStr(m?.rawEventData?.event_ticker) ||
    "";

  const idStr = m?.id != null ? pickStr(String(m.id)) : "";
  const pathSegment = slug || ticker || idStr;
  if (!pathSegment) return null;

  if (source === "limitless") {
    return `/rexmarkets/limitless/${enc(pathSegment)}`;
  }

  if (source === "kalshi") {
    const ev = pickStr(m?.event_ticker) || ticker;
    if (!ev) return null;
    return `/rexmarkets/kalshi/${enc(ev)}`;
  }

  if (source === "polymarket") {
    return `/rexmarkets/polymarket/${enc(pathSegment)}`;
  }

  return null;
}

/**
 * Map dynamic [event] segment to Polymarket market-details query: slug vs event_id.
 * Gamma event ids are often long numeric strings or UUIDs; slugs contain letters/dashes.
 */
export function polymarketRouteParamToSlugAndEventId(raw: string | undefined): {
  slug: string | null;
  eventId: string | null;
} {
  let p = raw?.trim() || "";
  if (!p) return { slug: null, eventId: null };
  try {
    p = decodeURIComponent(p);
  } catch {
    /* use raw */
  }
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      p
    );
  const isLongNumeric = /^\d+$/.test(p) && p.length >= 12;
  if (isUuid || isLongNumeric) return { slug: null, eventId: p };
  return { slug: p, eventId: null };
}

/** Same stable key used for report-gen store + useReportGenStatus on listing cards. */
export function getMarketReportGenKey(m: any): string {
  return (
    pickStr(m?.ticker) ||
    pickStr(m?.event_ticker) ||
    pickStr(m?.slug) ||
    (m?.id != null ? pickStr(String(m.id)) : "")
  );
}
