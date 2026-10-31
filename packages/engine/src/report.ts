import type { Agorot } from './money.js';
import type { BillLine } from './bill.js';
import type { Reading } from './usage.js';

/** One month's totals for one unit, taken from its approved statement. All money in agorot. */
export interface MonthSummary {
  kwh: number;
  electricityCost: Agorot;
  electricityFixed: Agorot;
  electricityTotal: Agorot;
  waterM3: number;
  waterAM3: number;
  waterACost: Agorot;
  waterBM3: number;
  waterBCost: Agorot;
  waterTotal: Agorot;
  community: Agorot;
  charges: Agorot;
  total: Agorot;
}

export function summarizeLines(lines: readonly BillLine[]): MonthSummary {
  const s: MonthSummary = {
    kwh: 0, electricityCost: 0, electricityFixed: 0, electricityTotal: 0,
    waterM3: 0, waterAM3: 0, waterACost: 0, waterBM3: 0, waterBCost: 0, waterTotal: 0,
    community: 0, charges: 0, total: 0,
  };
  for (const l of lines) {
    s.total += l.amount;
    switch (l.type) {
      case 'electricity': s.kwh += l.qty ?? 0; s.electricityCost += l.amount; break;
      case 'electricityFixed': s.electricityFixed += l.amount; break;
      case 'waterA': s.waterAM3 += l.qty ?? 0; s.waterACost += l.amount; break;
      case 'waterB': s.waterBM3 += l.qty ?? 0; s.waterBCost += l.amount; break;
      case 'community': s.community += l.amount; break;
      case 'charge': s.charges += l.amount; break;
    }
  }
  s.electricityTotal = s.electricityCost + s.electricityFixed;
  s.waterM3 = s.waterAM3 + s.waterBM3;
  s.waterTotal = s.waterACost + s.waterBCost;
  return s;
}

export interface ReportStatement {
  unitId: string;
  /** first day of the month, YYYY-MM-01 */
  period: string;
  lines: readonly BillLine[];
  paidOn: string | null;
  /** meter readings stored with the statement (older statements have none) */
  readings?: { electricity?: Reading; water?: Reading } | null;
}

export interface UnitYear {
  unitId: string;
  /** index 0 = January; undefined where the month has no approved statement */
  months: (MonthSummary | undefined)[];
  paid: (string | null | undefined)[];
  readings: ({ electricity?: Reading; water?: Reading } | undefined)[];
  yearTotal: MonthSummary;
}

const add = (a: MonthSummary, b: MonthSummary): MonthSummary => {
  const r = { ...a };
  for (const k of Object.keys(b) as (keyof MonthSummary)[]) r[k] = a[k] + b[k];
  return r;
};

/** Twelve month columns and a yearly total for every unit, from the approved statements of one year. */
export function buildYear(year: number, unitIds: readonly string[], statements: readonly ReportStatement[]): UnitYear[] {
  return unitIds.map((unitId) => {
    const months: (MonthSummary | undefined)[] = Array<MonthSummary | undefined>(12).fill(undefined);
    const paid: (string | null | undefined)[] = Array<string | null | undefined>(12).fill(undefined);
    const readings: UnitYear['readings'] = Array<UnitYear['readings'][number]>(12).fill(undefined);
    for (const st of statements) {
      if (st.unitId !== unitId || !st.period.startsWith(`${year}-`)) continue;
      const m = Number(st.period.slice(5, 7)) - 1;
      months[m] = summarizeLines(st.lines);
      paid[m] = st.paidOn;
      readings[m] = st.readings ?? undefined;
    }
    const yearTotal = months.reduce<MonthSummary>((acc, m) => (m ? add(acc, m) : acc), summarizeLines([]));
    return { unitId, months, paid, readings, yearTotal };
  });
}
