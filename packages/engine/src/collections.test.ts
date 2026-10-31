import { describe, expect, it } from 'vitest';
import { collections } from './index.js';

describe('collections', () => {
  const statements = [
    { unitId: 'b', period: '2026-09-01', total: 30000, paidAmount: 0 },
    { unitId: 'a', period: '2026-08-01', total: 20000, paidAmount: 0 },
    { unitId: 'a', period: '2026-09-01', total: 25000, paidAmount: 25000 },
    { unitId: 'c', period: '2026-10-01', total: 40000, paidAmount: 15000 },
    { unitId: 'b', period: '2026-10-01', total: 10000, paidAmount: 0 },
  ];

  it('totals billed, paid and open', () => {
    const c = collections(statements, '2026-10-01');
    expect(c).toMatchObject({ billed: 125000, paid: 40000, open: 85000 });
  });

  it('lists open debts oldest first with their age in months', () => {
    const c = collections(statements, '2026-10-01');
    expect(c.debts.map((d) => [d.unitId, d.period, d.ageMonths])).toEqual([
      ['a', '2026-08-01', 2],
      ['b', '2026-09-01', 1],
      ['b', '2026-10-01', 0],
      ['c', '2026-10-01', 0],
    ]);
  });

  it('counts an installment as partly paid: only the remainder is open', () => {
    const c = collections([{ unitId: 'c', period: '2026-10-01', total: 40000, paidAmount: 15000 }], '2026-10-01');
    expect(c.debts).toEqual([{ unitId: 'c', period: '2026-10-01', total: 25000, ageMonths: 0 }]);
  });

  it('crosses year boundaries', () => {
    expect(collections([{ unitId: 'a', period: '2025-11-01', total: 1, paidAmount: 0 }], '2026-02-01').debts[0]!.ageMonths).toBe(3);
  });

  it('is empty without statements', () => {
    expect(collections([], '2026-10-01')).toEqual({ billed: 0, paid: 0, open: 0, debts: [] });
  });
});
