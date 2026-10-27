import { describe, expect, it } from 'vitest';
import { consumption, flatCost, netUsage, splitByWeights, splitEvenly, tieredCost } from './index.js';

// Golden numbers are taken from the hateena-v2 reference calculation
// (electricity 0.64 ILS/kWh, water A 4.543 / B 11.6584 ILS/m3).
const WATER_A = 454.3;
const WATER_B = 1165.84;

describe('usage', () => {
  it('computes consumption and rejects backwards readings', () => {
    expect(consumption({ prev: 1000, cur: 1600 })).toBe(600);
    expect(() => consumption({ prev: 10, cur: 5 })).toThrow(RangeError);
  });

  it('subtracts sub-meters from the main meter (reference: main - roni - yuval)', () => {
    const main = { prev: 1000, cur: 1600 };
    const subs = [
      { prev: 0, cur: 100 },
      { prev: 0, cur: 80 },
    ];
    expect(netUsage(main, subs)).toBe(420);
  });

  it('never goes negative', () => {
    expect(netUsage({ prev: 0, cur: 10 }, [{ prev: 0, cur: 30 }])).toBe(0);
  });
});

describe('tariffs', () => {
  it('charges electricity at a flat rate', () => {
    expect(flatCost(420, 64)).toBe(26880);
    expect(flatCost(-5, 64)).toBe(0);
  });

  it('stays in tier A under the quota', () => {
    const r = tieredCost(5, [{ upTo: 7, rate: WATER_A }, { upTo: null, rate: WATER_B }]);
    expect(r.lines).toHaveLength(1);
    expect(r.total).toBe(Math.round(5 * WATER_A)); // 2272
  });

  it('splits across tiers above the quota (yuval: 9 m3, quota 7)', () => {
    const r = tieredCost(9, [{ upTo: 7, rate: WATER_A }, { upTo: null, rate: WATER_B }]);
    expect(r.lines.map((l) => l.qty)).toEqual([7, 2]);
    expect(r.total).toBe(3180 + 2332);
  });

  it('with quota 0 everything is billed at the upper rate (roni)', () => {
    const r = tieredCost(10, [{ upTo: 0, rate: WATER_A }, { upTo: null, rate: WATER_B }]);
    expect(r.lines).toHaveLength(1);
    expect(r.total).toBe(11658);
  });

  it('is free at zero usage and rejects tiers that do not cover usage', () => {
    expect(tieredCost(0, [{ upTo: null, rate: 100 }]).total).toBe(0);
    expect(() => tieredCost(10, [{ upTo: 5, rate: 100 }])).toThrow();
  });
});

describe('splitting fixed charges', () => {
  it('always sums to the total', () => {
    const parts = splitEvenly(10000, 3);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('supports weighted splits', () => {
    expect(splitByWeights(1000, [1, 1, 2])).toEqual([250, 250, 500]);
  });

  it('rejects invalid input', () => {
    expect(() => splitByWeights(100.5, [1])).toThrow();
    expect(() => splitByWeights(100, [0, 0])).toThrow();
  });
});
