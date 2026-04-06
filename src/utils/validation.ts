export const MIN_ORDER_SIZE = 0.01;
/** Limitless CLOB minimum order size in USDC (platform requirement). */
export const LIMITLESS_MIN_ORDER_USD = 3;
export const MIN_PRICE_CENTS = 1;
export const MAX_PRICE_CENTS = 99;
export const DUST_THRESHOLD = 0.01; // Minimum value to consider a position non-dust

export const isValidSize = (size: number) => size > MIN_ORDER_SIZE;

export const isValidPriceCents = (cents: number) =>
  !isNaN(cents) && cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS;

export const isValidDecimalInput = (value: string) =>
  value === "" || /^\d*\.?\d*$/.test(value);

export const isValidCentsInput = (value: string) =>
  value === "" || /^\d{0,2}$/.test(value);

