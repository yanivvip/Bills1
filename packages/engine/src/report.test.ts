import { describe, expect, it } from 'vitest';
import { buildYear, summarizeLines } from './index.js';

const lines = [
  { type: 'electricity', qty: 80, rate: 64, amount: 5120 },
  { type: 'electricityFixed', amount: 3000 },
  { type: 'waterA', qty: 7, rate: 454.3, amount: 3180 },
  { type: 'waterB', qty: 2, rate: 1165.84, amount: 2332 },
  { type: 'community', amount: 15000 },
  { type: 'charge', description: 'Repair', amount: 5000 },
] as const;

describe('summarizeLines', () => {
  it('splits a statement into the report categories', () => {
    const s = summarizeLines(lines);
    expect(s).toMatchObject({ kwh: 80, electricityCost: 5120, electricityFixed: 3000, electricityTotal: 8120, waterM3: 9, waterAM3: 7, waterBM3: 2, waterTotal: 5512, community: 15000, charges: 5000 });
    expect(s.total).toBe(8120 + 5512 + 15000 + 5000);
  });
});

describe('buildYear', () => {
  it('puts each month in its column, ignores other years and units, and totals the year', () => {
    const [u1, u2] = buildYear(2026, ['u1', 'u2'], [
      { unitId: 'u1', period: '2026-01-01', lines, paidOn: '2026-02-03' },
      { unitId: 'u1', period: '2026-03-01', lines, paidOn: null },
      { unitId: 'u1', period: '2025-12-01', lines, paidOn: null },
      { unitId: 'u2', period: '2026-03-01', lines, paidOn: null },
    ]);
    expect(u1!.months.map((m) => m !== undefined)).toEqual([true, false, true, ...Array<boolean>(9).fill(false)]);
    expect(u1!.paid[0]).toBe('2026-02-03');
    expect(u1!.paid[2]).toBeNull();
    expect(u1!.yearTotal.kwh).toBe(160);
    expect(u1!.yearTotal.total).toBe(2 * summarizeLines(lines).total);
    expect(u2!.months.filter(Boolean)).toHaveLength(1);
  });
});
