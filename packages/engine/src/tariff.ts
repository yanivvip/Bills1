import type { Agorot } from './money.js';

/**
 * A tier covers usage up to `upTo` (cumulative, inclusive); `upTo: null` means unbounded.
 * `rate` is agorot per unit and may be fractional (e.g. 454.3 for 4.543 ILS/m3).
 */
export interface Tier {
  upTo: number | null;
  rate: number;
}

export interface TierLine {
  qty: number;
  rate: number;
  amount: Agorot;
}

export interface TieredCost {
  lines: TierLine[];
  total: Agorot;
}

/** Each tier line is rounded to whole agorot, and the total is the sum of the rounded lines. */
export function tieredCost(usage: number, tiers: readonly Tier[]): TieredCost {
  const lines: TierLine[] = [];
  if (usage <= 0) return { lines, total: 0 };

  let used = 0;
  for (const tier of tiers) {
    const ceiling = tier.upTo ?? Infinity;
    const qty = Math.min(usage, ceiling) - used;
    if (qty > 0) {
      lines.push({ qty, rate: tier.rate, amount: Math.round(qty * tier.rate) });
      used += qty;
    }
    if (used >= usage) break;
  }
  if (used < usage) throw new Error('tiers do not cover the full usage; last tier must have upTo: null');
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/** Flat price per unit, rounded to whole agorot. */
export const flatCost = (usage: number, rate: number): Agorot =>
  usage <= 0 ? 0 : Math.round(usage * rate);
