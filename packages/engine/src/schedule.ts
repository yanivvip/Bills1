/** Months between two first-of-month dates (YYYY-MM-01); positive when `to` is later. */
export function monthsBetween(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
}

/**
 * Whether a recurring bill (property tax) falls in `period`. Monthly bills are due every month; a bimonthly bill is
 * due in the anchor month and every second month from it (before the anchor too). A bimonthly bill without an anchor is never due.
 */
export function isDueMonth(every: 1 | 2, anchor: string | null, period: string): boolean {
  if (every === 1) return true;
  if (!anchor) return false;
  return Math.abs(monthsBetween(anchor, period)) % 2 === 0;
}
