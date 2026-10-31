import { describe, expect, it } from 'vitest';
import { computeBills, type BillInput, type BillUnit } from './index.js';

const tariff = { electricityRate: 64, electricityFixed: 9000, waterRateA: 454.3, waterRateB: 1165.84 };

const unit = (over: Partial<BillUnit> & { id: string }): BillUnit => ({
  billed: true,
  residual: false,
  communityFee: 0,
  waterQuota: 0,
  electricity: [],
  water: [],
  ...over,
});

// Same shape as the reference household: an owner unit billed by subtraction plus two tenants with sub-meters.
const base = (): BillInput => ({
  tariff,
  main: { electricity: [{ prev: 1000, cur: 1600 }], water: [{ prev: 50, cur: 80 }] },
  units: [
    unit({ id: 'owner', residual: true, communityFee: 20000, waterQuota: 7 }),
    unit({ id: 'roni', communityFee: 15000, waterQuota: 0, electricity: [{ prev: 0, cur: 100 }], water: [{ prev: 0, cur: 10 }] }),
    unit({ id: 'yuval', communityFee: 15000, waterQuota: 7, electricity: [{ prev: 0, cur: 80 }], water: [{ prev: 0, cur: 9 }] }),
  ],
  charges: [],
});

const find = (r: ReturnType<typeof computeBills>, id: string) => r.bills.find((b) => b.unitId === id)!;

describe('computeBills', () => {
  it('bills a tenant: electricity, share of the fixed charge, tiered water, community fee', () => {
    const r = computeBills(base());
    expect(r.problems).toEqual([]);
    const yuval = find(r, 'yuval');
    expect(yuval.lines.map((l) => [l.type, l.amount])).toEqual([
      ['electricity', 5120], // 80 kWh * 0.64
      ['electricityFixed', 3000], // 9000 / 3 units
      ['waterA', 3180], // 7 m3 * 4.543
      ['waterB', 2332], // 2 m3 * 11.6584
      ['community', 15000],
    ]);
    expect(yuval.total).toBe(5120 + 3000 + 3180 + 2332 + 15000);
  });

  it('with quota 0 all water is billed at rate B', () => {
    const roni = find(computeBills(base()), 'roni');
    expect(roni.lines.filter((l) => l.type.startsWith('water')).map((l) => [l.type, l.amount])).toEqual([['waterB', 11658]]);
  });

  it('bills the residual unit as main minus the other units', () => {
    const owner = find(computeBills(base()), 'owner');
    const kwh = owner.lines.find((l) => l.type === 'electricity')!;
    expect(kwh.qty).toBe(600 - 100 - 80); // 420
    expect(kwh.amount).toBe(26880);
    const water = owner.lines.filter((l) => l.type.startsWith('water'));
    expect(water.map((l) => l.qty)).toEqual([7, 4]); // 30 - 10 - 9 = 11 m3: 7 at A, 4 at B
  });

  it('splits the fixed charge so the parts sum exactly', () => {
    const input = base();
    input.tariff = { ...tariff, electricityFixed: 10000 };
    const fixed = computeBills(input).bills.map((b) => b.lines.find((l) => l.type === 'electricityFixed')!.amount);
    expect(fixed.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('a vacant unit gets no bill and no fixed share, but its meter still counts against the main meter', () => {
    const input = base();
    input.units = input.units.map((u) => (u.id === 'yuval' ? { ...u, billed: false } : u));
    const r = computeBills(input);
    expect(r.bills.map((b) => b.unitId)).toEqual(['owner', 'roni']);
    expect(find(r, 'owner').lines.find((l) => l.type === 'electricity')!.qty).toBe(420);
    expect(find(r, 'roni').lines.find((l) => l.type === 'electricityFixed')!.amount).toBe(4500);
  });

  it('adds one-off charges to one unit or to every unit', () => {
    const input = base();
    input.charges = [
      { id: 'c1', unitId: 'roni', description: 'Repair', amount: 5000 },
      { id: 'c2', unitId: null, description: 'Stairwell cleaning', amount: 1000 },
    ];
    const r = computeBills(input);
    expect(find(r, 'roni').lines.filter((l) => l.type === 'charge').map((l) => l.amount)).toEqual([5000, 1000]);
    expect(find(r, 'yuval').lines.filter((l) => l.type === 'charge').map((l) => l.amount)).toEqual([1000]);
  });

  it('reports a missing reading and gives that unit no bill', () => {
    const input = base();
    input.units = input.units.map((u) => (u.id === 'roni' ? { ...u, electricity: [undefined] } : u));
    const r = computeBills(input);
    expect(r.problems).toContainEqual({ unitId: 'roni', kind: 'electricity', reason: 'missing' });
    expect(r.bills.map((b) => b.unitId)).not.toContain('roni');
    // the residual unit depends on roni's meter too
    expect(r.problems).toContainEqual({ unitId: 'owner', kind: 'electricity', reason: 'missing' });
  });

  it('reports a reading that went backwards', () => {
    const input = base();
    input.units = input.units.map((u) => (u.id === 'yuval' ? { ...u, water: [{ prev: 20, cur: 9 }] } : u));
    const r = computeBills(input);
    expect(r.problems).toContainEqual({ unitId: 'yuval', kind: 'water', reason: 'backwards' });
  });

  it('a unit without a meter of a kind is simply not charged for it', () => {
    const input = base();
    input.units = [unit({ id: 'solo', communityFee: 1000 })];
    input.main = { electricity: [], water: [] };
    const r = computeBills(input);
    expect(r.bills[0]!.lines.map((l) => l.type)).toEqual(['electricityFixed', 'community']);
  });
});

describe('readings kept with the bill', () => {
  it('stores the unit meters, summed, and none for the residual unit', () => {
    const r = computeBills(base());
    expect(find(r, 'yuval').readings).toEqual({ electricity: { prev: 0, cur: 80 }, water: { prev: 0, cur: 9 } });
    expect(find(r, 'owner').readings).toEqual({});
  });
});
