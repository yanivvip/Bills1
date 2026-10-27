/** Money is always an integer number of agorot (1/100 ILS) to avoid float drift. */
export type Agorot = number;

export const shekelsToAgorot = (shekels: number): Agorot => Math.round(shekels * 100);
export const agorotToShekels = (a: Agorot): number => a / 100;

/**
 * Splits `total` across `weights` so the parts always sum to exactly `total`
 * (largest-remainder method; ties go to the earlier entry).
 */
export function splitByWeights(total: Agorot, weights: readonly number[]): Agorot[] {
  if (!Number.isInteger(total)) throw new Error('total must be an integer amount of agorot');
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0)) throw new Error('weights must be non-negative');
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) throw new Error('at least one weight must be positive');

  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let remainder = total - parts.reduce((s, p) => s + p, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    remainder -= 1;
  }
  return parts;
}

export const splitEvenly = (total: Agorot, n: number): Agorot[] =>
  splitByWeights(total, Array<number>(n).fill(1));
