import type { Agorot } from './money.js';

export interface CollectionStatement {
  unitId: string;
  /** first day of the month, YYYY-MM-01 */
  period: string;
  total: Agorot;
  paid: boolean;
}

export interface OpenDebt {
  unitId: string;
  period: string;
  total: Agorot;
  /** whole months between the billed month and `asOf` */
  ageMonths: number;
}

export interface Collections {
  billed: Agorot;
  paid: Agorot;
  open: Agorot;
  debts: OpenDebt[];
}

const monthIndex = (period: string) => {
  const [y = 0, m = 1] = period.split('-').map(Number);
  return y * 12 + (m - 1);
};

/** Billed versus paid, and the unpaid bills (oldest first) with how long each has been open. */
export function collections(statements: readonly CollectionStatement[], asOf: string): Collections {
  const debts: OpenDebt[] = statements
    .filter((s) => !s.paid)
    .map((s) => ({ unitId: s.unitId, period: s.period, total: s.total, ageMonths: Math.max(0, monthIndex(asOf) - monthIndex(s.period)) }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.unitId.localeCompare(b.unitId));
  const billed = statements.reduce((sum, s) => sum + s.total, 0);
  const open = debts.reduce((sum, d) => sum + d.total, 0);
  return { billed, paid: billed - open, open, debts };
}
