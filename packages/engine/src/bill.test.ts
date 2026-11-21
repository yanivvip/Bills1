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

  it('a charge for one unit goes entirely to that unit', () => {
    const input = base();
    input.charges = [{ id: 'c1', scope: 'unit', unitId: 'roni', description: 'Repair', amount: 5000 }];
    const r = computeBills(input);
    expect(find(r, 'roni').lines.filter((l) => l.type === 'charge').map((l) => l.amount)).toEqual([5000]);
    expect(find(r, 'yuval').lines.filter((l) => l.type === 'charge')).toEqual([]);
  });

  // The old app billed a charge "for everyone" in full to each consumer while showing amount / 3. Here the split is made once.
  it('a charge for the units is split between them, never charged in full to each', () => {
    const input = base();
    input.charges = [{ id: 'c2', scope: 'units', unitId: null, description: 'Stairwell cleaning', amount: 30000 }];
    const r = computeBills(input);
    const charged = (id: string) => find(r, id).lines.filter((l) => l.type === 'charge').map((l) => l.amount);
    expect([charged('owner'), charged('roni'), charged('yuval')]).toEqual([[10000], [10000], [10000]]);
  });

  it('a charge for all includes the landlord household: its share is not billed to anyone', () => {
    const input = base();
    input.units = input.units.map((u) => (u.id === 'owner' ? { ...u, billed: false } : u));
    input.charges = [{ id: 'c3', scope: 'all', unitId: null, description: 'Roof', amount: 30000 }];
    const r = computeBills(input);
    expect(r.bills.map((b) => b.unitId)).toEqual(['roni', 'yuval']);
    for (const b of r.bills) expect(b.lines.filter((l) => l.type === 'charge').map((l) => l.amount)).toEqual([10000]);
  });

  it('the parts of a split charge sum exactly, a credit is split too', () => {
    const input = base();
    input.charges = [
      { id: 'c4', scope: 'units', unitId: null, description: 'Odd', amount: 1000 },
      { id: 'c5', scope: 'units', unitId: null, description: 'Credit', amount: -1000 },
    ];
    const r = computeBills(input);
    const sumOf = (d: string) => r.bills.flatMap((b) => b.lines).filter((l) => l.description === d).reduce((s, l) => s + l.amount, 0);
    expect(sumOf('Odd')).toBe(1000);
    expect(sumOf('Credit')).toBe(-1000);
  });

  it('a fixed charge can be shared with the landlord household, or carried by the landlord alone', () => {
    const input = base();
    input.units = input.units.map((u) => (u.id === 'owner' ? { ...u, billed: false } : u));
    input.tariff = { ...tariff, electricityFixed: 9000, electricityFixedScope: 'all', waterFixed: 6000, waterFixedScope: 'landlord' };
    const r = computeBills(input);
    expect(find(r, 'roni').lines.find((l) => l.type === 'electricityFixed')!.amount).toBe(3000);
    expect(find(r, 'roni').lines.some((l) => l.type === 'waterFixed')).toBe(false);
  });

  it('a water fixed charge is split between the units by default', () => {
    const input = base();
    input.tariff = { ...tariff, waterFixed: 6000 };
    const r = computeBills(input);
    expect(r.bills.map((b) => b.lines.find((l) => l.type === 'waterFixed')!.amount)).toEqual([2000, 2000, 2000]);
  });

  it('bills property tax and sewage only when they are due', () => {
    const input = base();
    input.tariff = { ...tariff, sewageRate: 650 };
    input.units = input.units.map((u) => (u.id === 'roni' ? { ...u, propertyTax: 27200, sewageQty: 6.2 } : u));
    const roni = find(computeBills(input), 'roni').lines;
    expect(roni.find((l) => l.type === 'propertyTax')!.amount).toBe(27200);
    expect(roni.find((l) => l.type === 'sewage')).toMatchObject({ qty: 6.2, rate: 650, amount: 4030 });
    expect(find(computeBills(input), 'yuval').lines.some((l) => l.type === 'sewage' || l.type === 'propertyTax')).toBe(false);
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

// Main meter 1000 -> 1600 (600 kWh) and 50 -> 80 (30 m3); roni 100 kWh / 10 m3, yuval 80 kWh / 9 m3.
describe('meter layouts', () => {
  const qty = (r: ReturnType<typeof computeBills>, id: string, type: 'electricity' | 'waterA' | 'waterB') => find(r, id).lines.find((l) => l.type === type)?.qty;

  it('main meter with sub-meters, the difference shared by the units instead of billed to the landlord home', () => {
    const input = base();
    input.units = input.units.filter((u) => u.id !== 'owner').map((u) => ({ ...u }));
    input.layout = { electricity: { mode: 'main_sub', difference: 'units' } };
    const r = computeBills(input);
    // 600 - 180 = 420 kWh of difference, 210 each on top of the unit's own meter
    expect(qty(r, 'roni', 'electricity')).toBe(310);
    expect(qty(r, 'yuval', 'electricity')).toBe(290);
  });

  it('the difference shared by the units is not billed to a landlord home that nobody rents', () => {
    const input = base();
    input.units = input.units.map((u) => (u.id === 'owner' ? { ...u, billed: false } : u));
    input.layout = { electricity: { mode: 'main_sub', difference: 'units' } };
    const r = computeBills(input);
    expect(r.bills.map((b) => b.unitId)).toEqual(['roni', 'yuval']);
    expect(qty(r, 'roni', 'electricity')).toBe(310);
  });

  it('main meter with sub-meters and no household for the landlord: the difference is simply not billed', () => {
    const input = base();
    input.units = input.units.filter((u) => u.id !== 'owner');
    const r = computeBills(input);
    expect(qty(r, 'roni', 'electricity')).toBe(100);
    expect(qty(r, 'yuval', 'electricity')).toBe(80);
  });

  it('a shared meter is divided by percentage, the rest stays with the landlord', () => {
    const input = base();
    input.units = [
      unit({ id: 'a', percent: { electricity: 30 } }),
      unit({ id: 'b', percent: { electricity: 20 } }),
    ];
    input.layout = { electricity: { mode: 'shared', split: 'percent' } };
    const r = computeBills(input);
    expect(qty(r, 'a', 'electricity')).toBe(180);
    expect(qty(r, 'b', 'electricity')).toBe(120);
  });

  it('a shared meter is divided by head-count, the landlord household takes its people too', () => {
    const input = base();
    input.units = [
      unit({ id: 'a', occupants: 2 }),
      unit({ id: 'b', occupants: 1 }),
      unit({ id: 'home', billed: false, residual: true, occupants: 3 }),
    ];
    input.layout = { electricity: { mode: 'shared', split: 'heads' } };
    const r = computeBills(input);
    expect(qty(r, 'a', 'electricity')).toBe(200); // 2 of 6 people
    expect(qty(r, 'b', 'electricity')).toBe(100);
  });

  it('a shared water meter still uses each unit quota for the cheaper rate', () => {
    const input = base();
    input.units = [unit({ id: 'a', occupants: 1, waterQuota: 5 }), unit({ id: 'b', occupants: 1, waterQuota: 0 })];
    input.layout = { water: { mode: 'shared', split: 'heads' } };
    const r = computeBills(input);
    expect(qty(r, 'a', 'waterA')).toBe(5);
    expect(qty(r, 'a', 'waterB')).toBe(10); // 15 m3 each
    expect(qty(r, 'b', 'waterA')).toBeUndefined();
    expect(qty(r, 'b', 'waterB')).toBe(15);
  });

  it('a unit without a percentage cannot be billed from a shared meter', () => {
    const input = base();
    input.units = [unit({ id: 'a', percent: { electricity: 30 } }), unit({ id: 'b' })];
    input.layout = { electricity: { mode: 'shared', split: 'percent' } };
    const r = computeBills(input);
    expect(r.problems).toContainEqual({ unitId: 'b', kind: 'electricity', reason: 'noShare' });
    expect(r.bills.map((b) => b.unitId)).toEqual(['a']); // only the unit with the problem is left out; approval stays blocked
  });

  it('separate meters ignore the main meter, even for a unit flagged as the household', () => {
    const input = base();
    input.units = input.units.map((u) => (u.id === 'owner' ? { ...u, electricity: [{ prev: 0, cur: 50 }] } : u));
    input.layout = { electricity: { mode: 'separate' } };
    expect(qty(computeBills(input), 'owner', 'electricity')).toBe(50);
  });

  it('when the renter pays the supplier directly nothing of that kind is billed and missing readings do not matter', () => {
    const input = base();
    input.units = input.units.map((u) => ({ ...u, electricity: [undefined] }));
    input.layout = { electricity: { mode: 'direct' } };
    const r = computeBills(input);
    expect(r.problems.filter((p) => p.kind === 'electricity')).toEqual([]);
    expect(r.bills.every((b) => !b.lines.some((l) => l.type === 'electricity'))).toBe(true);
  });

  it('a missing main reading blocks a shared meter and is reported once for the main meter', () => {
    const input = base();
    input.main = { ...input.main, electricity: [undefined] };
    input.units = [unit({ id: 'a', occupants: 1 })];
    input.layout = { electricity: { mode: 'shared', split: 'heads' } };
    const r = computeBills(input);
    expect(r.problems).toEqual([{ unitId: null, kind: 'electricity', reason: 'missing' }]);
    expect(r.bills).toEqual([]);
  });
});
