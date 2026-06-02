/**
 * Predict.fun GET /categories expects bare numeric tagIds in the query
 * (e.g. tagIds=4 for Sports). Quoted values (tagIds="4") filter incorrectly.
 */

function stripPredictFunTagIdQuotes(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/** Bare numeric id for app state (e.g. "113"). */
export function normalizePredictFunTagId(
  value: string | number | null | undefined
): string | null {
  if (value == null) return null;

  let s = stripPredictFunTagIdQuotes(String(value));

  if (!s || s.toLowerCase() === "all" || s.toLowerCase() === "trending") {
    return null;
  }

  if (s.startsWith("predictfun:")) {
    s = s.slice("predictfun:".length).trim();
    s = stripPredictFunTagIdQuotes(s);
  }

  return /^\d+$/.test(s) ? s : null;
}

/** Query value sent to Predict.fun upstream (e.g. `4`). */
export function formatPredictFunTagIdsQueryValue(tagId: string): string {
  const id = normalizePredictFunTagId(tagId);
  if (!id) return "";
  return id;
}

