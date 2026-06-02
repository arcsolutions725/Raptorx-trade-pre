/** Normalize EVM addresses for comparisons and API query params. */
export function normalizePredictFunAddress(
  address: string | null | undefined
): string | null {
  if (!address) return null;
  const t = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(t)) return null;
  return t.toLowerCase();
}

export function addressesEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizePredictFunAddress(a);
  const nb = normalizePredictFunAddress(b);
  return !!na && !!nb && na === nb;
}
