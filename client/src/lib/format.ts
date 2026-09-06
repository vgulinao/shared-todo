const costFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Two decimals in the browser's locale, no currency (spec S8 AC7). */
export function formatCost(n: number): string {
  return costFormat.format(n);
}
