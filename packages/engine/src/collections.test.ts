import { describe, expect, it } from 'vitest';
import { collections } from './index.js';

describe('collections', () => {
  const statements = [
    { unitId: 'b', period: '2026-09-01', total: 30000, paid: false },
    { unitId: 'a', period: '2026-08-01', total: 20000, paid: false },
    { unitId: 'a', period: '2026-09-01', total: 25000, paid: true },
    { unitId: 'b', period: '2026-10-01', total: 10000, paid: false },
  ];

  it('totals billed, paid and open', () => {
    const c = collections(statements, '2026-10-01');
    expect(c).toMatchObject({ billed: 85000, paid: 25000, open: 60000 });
  });

  it('lists open debts oldest first with their age in months', () => {
    const c = collections(statements, '2026-10-01');
    expect(c.debts.map((d) => [d.unitId, d.period, d.ageMonths])).toEqual([
      ['a', '2026-08-01', 2],
      ['b', '2026-09-01', 1],
      ['b', '2026-10-01', 0],
    ]);
  });

  it('crosses year boundaries', () => {
    expect(collections([{ unitId: 'a', period: '2025-11-01', total: 1, paid: false }], '2026-02-01').debts[0]!.ageMonths).toBe(3);
  });

  it('is empty without statements', () => {
    expect(collections([], '2026-10-01')).toEqual({ billed: 0, paid: 0, open: 0, debts: [] });
  });
});
