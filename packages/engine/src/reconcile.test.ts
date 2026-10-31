import { describe, expect, it } from 'vitest';
import { reconcile } from './index.js';

const lines = [
  [
    { type: 'electricity', qty: 100, rate: 64, amount: 6400 },
    { type: 'electricityFixed', amount: 3000 },
    { type: 'waterA', qty: 5, rate: 454.3, amount: 2272 },
    { type: 'community', amount: 15000 },
  ],
  [
    { type: 'electricity', qty: 50, rate: 64, amount: 3200 },
    { type: 'waterB', qty: 2, rate: 1165.84, amount: 2332 },
    { type: 'charge', description: 'x', amount: 999 },
  ],
] as const;

describe('reconcile', () => {
  it('sums what was billed for electricity and water, ignoring other charges', () => {
    const r = reconcile(lines, {});
    expect(r.electricity).toEqual({ collected: 12600, supplier: null, difference: null });
    expect(r.water).toEqual({ collected: 4604, supplier: null, difference: null });
  });

  it('shows the difference to the supplier bill', () => {
    const r = reconcile(lines, { electricity: 15000, water: 4000 });
    expect(r.electricity.difference).toBe(2400); // landlord paid more than collected
    expect(r.water.difference).toBe(-604); // collected more than the supplier charged
  });
});
