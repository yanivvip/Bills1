import type { AttentionMeter, AttentionReading } from './attention.js';

/** Whose consumption a history chart shows. */
export type HistoryScope =
  | { type: 'property' }
  | { type: 'unit'; unitId: string }
  /** the landlord's own house: the main meter minus every unit's meters */
  | { type: 'house' };

const shift = (period: string, delta: number) => {
  const [y = 0, m = 1] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

/** The `count` months ending at `period` (oldest first), as first-of-month dates. */
export const lastMonths = (period: string, count: number): string[] => Array.from({ length: count }, (_, i) => shift(period, i - (count - 1)));

/**
 * Consumption per month for the given months (kWh or m3), oldest first. A month is `undefined` when a reading it
 * needs (that month or the one before) is missing, or went backwards.
 * 'property' is the main meter, or the sum of the units' meters when the property has no main meter.
 */
export function monthlyUsage(input: {
  months: readonly string[];
  kind: 'electricity' | 'water';
  scope: HistoryScope;
  meters: readonly AttentionMeter[];
  readings: readonly AttentionReading[];
}): (number | undefined)[] {
  const { months, kind, scope, meters, readings } = input;
  const ofKind = meters.filter((m) => m.kind === kind);
  const main = ofKind.filter((m) => m.unitId === null);
  const units = ofKind.filter((m) => m.unitId !== null);
  const value = (id: string, p: string) => readings.find((r) => r.meterId === id && r.period === p)?.value;
  const usageOfSet = (set: readonly AttentionMeter[], p: string): number | undefined => {
    let total = 0;
    for (const m of set) {
      const cur = value(m.id, p);
      const prev = value(m.id, shift(p, -1));
      if (cur === undefined || prev === undefined || cur < prev) return undefined;
      total += cur - prev;
    }
    return total;
  };

  return months.map((p) => {
    if (scope.type === 'unit') {
      const own = units.filter((m) => m.unitId === scope.unitId);
      return own.length === 0 ? undefined : usageOfSet(own, p);
    }
    if (scope.type === 'property') return usageOfSet(main.length > 0 ? main : units, p);
    if (main.length === 0) return undefined;
    const all = usageOfSet(main, p);
    const used = usageOfSet(units, p);
    return all === undefined || used === undefined ? undefined : Math.max(0, all - used);
  });
}

export interface UsageSummary {
  /** average of the months that have a value */
  average: number | undefined;
  /** the last month against the average of the up to 3 months before it, in percent (positive = higher) */
  changePct: number | undefined;
}

/** The average of a series and how the last month compares with the 3 months before it (needs at least 2 of them). */
export function summarizeUsage(series: readonly (number | undefined)[]): UsageSummary {
  const known = series.filter((x): x is number => x !== undefined);
  const average = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : undefined;
  const last = series[series.length - 1];
  const before = series.slice(-4, -1).filter((x): x is number => x !== undefined);
  if (last === undefined || before.length < 2) return { average, changePct: undefined };
  const base = before.reduce((a, b) => a + b, 0) / before.length;
  return { average, changePct: base > 0 ? ((last - base) / base) * 100 : undefined };
}
