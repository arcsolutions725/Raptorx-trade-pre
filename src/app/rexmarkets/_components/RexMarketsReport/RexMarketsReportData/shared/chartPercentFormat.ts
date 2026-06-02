/** Compact 0–100 % for tooltips and labels (drops trailing zeros). */
export function formatChartPercentValue(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return parseFloat(value.toFixed(maxDecimals)).toString();
}

/** Y-axis ticks: whole percents without “.0”; one decimal when needed. */
export function formatChartAxisPercent(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) < 1e-9) return `${whole}%`;
  return `${rounded.toFixed(1)}%`;
}
