import type { Agorot } from './money.js';

export interface AttentionUnit {
  id: string;
  name: string;
  /** only units with an active contract are expected to report */
  rented: boolean;
}
export interface AttentionMeter {
  id: string;
  /** null = a main (building) meter */
  unitId: string | null;
  kind: 'electricity' | 'water';
  name: string;
}
export interface AttentionReading {
  meterId: string;
  /** first day of the month, YYYY-MM-01 */
  period: string;
  value: number;
}
export interface AttentionStatement {
  unitId: string;
  period: string;
  total: Agorot;
  paid: boolean;
}

export type AttentionItem =
  | { type: 'noReport'; unitId: string; meterId: string; kind: 'electricity' | 'water' }
  | { type: 'unpaid'; unitId: string; period: string; total: Agorot }
  | { type: 'highUsage'; meterId: string; unitId: string | null; kind: 'electricity' | 'water'; usage: number; average: number };

const shift = (period: string, delta: number) => {
  const [y = 0, m = 1] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * What the landlord should look at this month: renters who have not reported a reading, approved months
 * not yet paid, and meters whose usage is well above their recent average.
 * Usage is compared with the average of up to the 3 months before it, and needs at least 2 of them.
 */
export function attentionItems(input: {
  period: string;
  units: readonly AttentionUnit[];
  meters: readonly AttentionMeter[];
  readings: readonly AttentionReading[];
  statements: readonly AttentionStatement[];
  /** how far above the average counts as unusual (default 40%) */
  thresholdPct?: number;
}): AttentionItem[] {
  const { period, units, meters, readings, statements, thresholdPct = 40 } = input;
  const items: AttentionItem[] = [];
  const value = (meterId: string, p: string) => readings.find((r) => r.meterId === meterId && r.period === p)?.value;

  for (const m of meters) {
    const unit = units.find((u) => u.id === m.unitId);
    if (unit?.rented && value(m.id, period) === undefined) items.push({ type: 'noReport', unitId: unit.id, meterId: m.id, kind: m.kind });
  }

  for (const s of statements) {
    if (!s.paid) items.push({ type: 'unpaid', unitId: s.unitId, period: s.period, total: s.total });
  }

  for (const m of meters) {
    const usageOf = (p: string) => {
      const cur = value(m.id, p);
      const prev = value(m.id, shift(p, -1));
      return cur !== undefined && prev !== undefined && cur >= prev ? cur - prev : undefined;
    };
    const usage = usageOf(period);
    if (usage === undefined) continue;
    const history = [1, 2, 3].map((i) => usageOf(shift(period, -i))).filter((x): x is number => x !== undefined);
    if (history.length < 2) continue;
    const average = history.reduce((a, b) => a + b, 0) / history.length;
    if (average > 0 && usage > average * (1 + thresholdPct / 100)) {
      items.push({ type: 'highUsage', meterId: m.id, unitId: m.unitId, kind: m.kind, usage, average });
    }
  }
  return items;
}
