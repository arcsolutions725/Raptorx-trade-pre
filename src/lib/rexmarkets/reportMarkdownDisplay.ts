/**
 * Strips sections we render in UI elsewhere (market title header + symbol image;
 * featured image is redundant vs product header).
 */
export function stripFeaturedImageAndTitleSections(md: string): string {
  if (!md?.trim()) return md;
  let s = md;
  s = s.replace(/\n?##\s*Featured Image\s*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  s = s.replace(/\n?##\s*\d*\.?\s*Featured Image\s*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  s = s.replace(/\n?##\s*Title\s*[\s\S]*?(?=\n##\s|$)/i, "\n");
  s = s.replace(/^\s*#\s+[^\n]+\n*/m, "");
  return s.replace(/\n{3,}/g, "\n\n").trimStart();
}
