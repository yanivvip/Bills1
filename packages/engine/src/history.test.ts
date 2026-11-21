import { describe, expect, it } from 'vitest';
import { lastMonths, monthlyUsage, summarizeUsage } from './history.js';

const meters = [
  { id: 'm-main', unitId: null, kind: 'electricity' as const, name: 'main' },
  { id: 'm-a', unitId: 'a', kind: 'electricity' as const, name: 'a' },
];
const r = (meterId: string, period: string, value: number) => ({ meterId, period, value });

describe('lastMonths', () => {
  it('lists the months ending at a month, across a year boundary', () => {
    expect(lastMonths('2026-02-01', 4)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });
});

describe('monthlyUsage', () => {
  const readings = [
    r('m-main', '2026-01-01', 1000), r('m-main', '2026-02-01', 1300), r('m-main', '2026-03-01', 1500),
    r('m-a', '2026-01-01', 100), r('m-a', '2026-02-01', 180), r('m-a', '2026-03-01', 220),
  ];
  const months = ['2026-02-01', '2026-03-01', '2026-04-01'];
  const base = { months, kind: 'electricity' as const, meters, readings };

  it('a unit is its own meter, a month without both readings is unknown', () => {
    expect(monthlyUsage({ ...base, scope: { type: 'unit', unitId: 'a' } })).toEqual([80, 40, undefined]);
  });
  it('the property is the main meter', () => {
    expect(monthlyUsage({ ...base, scope: { type: 'property' } })).toEqual([300, 200, undefined]);
  });
  it('without a main meter the property is the sum of the units', () => {
    expect(monthlyUsage({ ...base, meters: [meters[1]!], scope: { type: 'property' } })).toEqual([80, 40, undefined]);
  });
  it('the landlord house is the main meter minus the units', () => {
    expect(monthlyUsage({ ...base, scope: { type: 'house' } })).toEqual([220, 160, undefined]);
  });
  it('a reading that went backwards makes the month unknown', () => {
    const bad = [...readings.filter((x) => !(x.meterId === 'm-a' && x.period === '2026-03-01')), r('m-a', '2026-03-01', 150)];
    expect(monthlyUsage({ ...base, readings: bad, scope: { type: 'unit', unitId: 'a' } })[1]).toBeUndefined();
  });
  it('a unit that has no meter of the kind has no history', () => {
    expect(monthlyUsage({ ...base, scope: { type: 'unit', unitId: 'zzz' } })).toEqual([undefined, undefined, undefined]);
  });
});

describe('summarizeUsage', () => {
  it('averages the known months and compares the last with the 3 before it', () => {
    const s = summarizeUsage([5, 5, 6, 6, 8]);
    expect(s.average).toBeCloseTo(6);
    expect(s.changePct).toBeCloseTo(((8 - (5 + 6 + 6) / 3) / ((5 + 6 + 6) / 3)) * 100);
  });
  it('gives no change without two earlier months or without a last value', () => {
    expect(summarizeUsage([undefined, undefined, 5, 8]).changePct).toBeUndefined();
    expect(summarizeUsage([5, 6, 7, undefined]).changePct).toBeUndefined();
  });
});
