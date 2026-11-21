import { splitByWeights, type Agorot } from './money.js';
import { consumption, type Reading } from './usage.js';
import { flatCost } from './tariff.js';

/** All meters of one kind. An entry is `undefined` while its reading (this or last month) is still missing. */
export type MeterReadings = readonly (Reading | undefined)[];

/**
 * Who shares a fixed charge: every billed unit and the landlord's own household ('all'),
 * the billed units only ('units'), or the landlord alone ('landlord': nobody is billed).
 */
export type FixedScope = 'all' | 'units' | 'landlord';

export interface BillTariff {
  /** agorot per kWh (may be fractional) */
  electricityRate: number;
  /** fixed monthly electricity charge for the whole property */
  electricityFixed: Agorot;
  /** default 'units' */
  electricityFixedScope?: FixedScope;
  /** agorot per m3 up to the unit's quota, and above it */
  waterRateA: number;
  waterRateB: number;
  /** fixed monthly water charge for the whole property */
  waterFixed?: Agorot;
  waterFixedScope?: FixedScope;
  /** agorot per m3 of sewage (the quantity is entered per unit in a property-tax month) */
  sewageRate?: number;
}

export interface BillUnit {
  id: string;
  /** false for a vacant unit: its meters still count when subtracting from the main meter, but it gets no bill */
  billed: boolean;
  /** true: consumption = main meter minus the other units' meters (the landlord's own household) */
  residual: boolean;
  communityFee: Agorot;
  /** people living in the unit, the weights of a shared meter divided by head-count */
  occupants?: number;
  /** share of a shared meter in percent, per kind */
  percent?: { electricity?: number; water?: number };
  /** property tax due this month (0 outside a property-tax month) */
  propertyTax?: Agorot;
  /** m3 of sewage entered for this month (only in a property-tax month) */
  sewageQty?: number;
  /** m3 per month charged at rate A; the rest at rate B */
  waterQuota: number;
  electricity: MeterReadings;
  water: MeterReadings;
}

/** 'unit': the whole amount to one unit; 'units': split evenly between the billed units; 'all': split evenly between the billed units and the landlord's household. */
export type ChargeScope = 'all' | 'units' | 'unit';

export interface BillCharge {
  id: string;
  scope: ChargeScope;
  /** the unit that pays everything when scope is 'unit' */
  unitId: string | null;
  description: string;
  /** the total, split according to the scope; negative = credit */
  amount: Agorot;
}

/**
 * How one kind of meter (electricity or water) is connected:
 * 'separate' each unit has its own meter; 'main_sub' a main meter plus sub-meters, the difference going to the landlord's
 * household or shared by the units; 'shared' one meter divided by percentage or head-count; 'direct' the renter pays the supplier.
 */
export type MeterMode = 'separate' | 'main_sub' | 'shared' | 'direct';
export interface KindLayout {
  mode: MeterMode;
  /** main_sub: who carries main minus sub-meters */
  difference: 'landlord' | 'units';
  /** shared: how the main meter is divided */
  split: 'percent' | 'heads';
}
export const DEFAULT_LAYOUT: KindLayout = { mode: 'main_sub', difference: 'landlord', split: 'heads' };

export interface BillInput {
  tariff: BillTariff;
  /** per kind; a missing entry means main meter with sub-meters and the difference to the landlord */
  layout?: { electricity?: Partial<KindLayout>; water?: Partial<KindLayout> };
  units: readonly BillUnit[];
  main: { electricity: MeterReadings; water: MeterReadings };
  charges: readonly BillCharge[];
}

export type LineType = 'electricity' | 'electricityFixed' | 'waterA' | 'waterB' | 'waterFixed' | 'sewage' | 'propertyTax' | 'community' | 'charge';

export interface BillLine {
  type: LineType;
  /** quantity (kWh or m3) and rate (agorot per unit) where it applies */
  qty?: number;
  rate?: number;
  description?: string;
  amount: Agorot;
}

export interface UnitBill {
  unitId: string;
  /** the unit's own meters this month (previous and current reading, summed); absent for a residual unit or a kind with no meter */
  readings: { electricity?: Reading; water?: Reading };
  lines: BillLine[];
  total: Agorot;
}

export interface BillProblem {
  /** null = a main meter */
  unitId: string | null;
  kind: 'electricity' | 'water';
  /** noShare: the unit has no percentage or head-count to divide a shared meter by */
  reason: 'missing' | 'backwards' | 'noShare';
}

export interface BillResult {
  bills: UnitBill[];
  problems: BillProblem[];
}

type Kind = 'electricity' | 'water';

const defined = (r: MeterReadings): r is readonly Reading[] => r.every((x) => x !== undefined);
const sum = (r: readonly Reading[]) => r.reduce((s, x) => s + consumption(x), 0);

/**
 * One month's bill for every billed unit of a property. Pure: the same input always gives the same bill.
 * Units whose readings are missing or inconsistent are reported in `problems` and get no bill.
 */
export function computeBills(input: BillInput): BillResult {
  const { tariff, units, main, charges } = input;
  const problems: BillProblem[] = [];
  const billed = units.filter((u) => u.billed);
  // The landlord's own household shares 'all' charges but is never billed: a residual unit nobody rents.
  const landlordHome = units.some((u) => u.residual && !u.billed);

  /** What each billed unit (by position in `billed`) pays of `total`. The parts sum to the whole; the landlord's part is not billed. */
  const share = (total: Agorot, scope: FixedScope | ChargeScope): Agorot[] => {
    if (scope === 'landlord' || scope === 'unit' || total === 0) return billed.map(() => 0);
    const n = billed.length + (scope === 'all' && landlordHome ? 1 : 0);
    if (n === 0) return [];
    const parts = splitByWeights(Math.abs(total), Array<number>(n).fill(1)).map((p) => Math.sign(total) * p);
    return parts.slice(0, billed.length);
  };
  const electricityFixed = share(tariff.electricityFixed, tariff.electricityFixedScope ?? 'units');
  const waterFixed = share(tariff.waterFixed ?? 0, tariff.waterFixedScope ?? 'units');
  const chargeShares = charges.map((c) => (c.scope === 'unit' ? undefined : share(c.amount, c.scope)));

  const layoutOf = (kind: Kind): KindLayout => ({ ...DEFAULT_LAYOUT, ...input.layout?.[kind] });
  /** The landlord's difference rule: the residual unit is billed main meter minus the other units. */
  const byDifference = (u: BillUnit, kind: Kind) => u.residual && layoutOf(kind).mode === 'main_sub' && layoutOf(kind).difference === 'landlord';
  const round3 = (x: number) => Math.round(x * 1000) / 1000;

  /** Usage in kWh / m3 of every billed unit for one kind (null = cannot be computed; the reason is in `problems`). */
  const usageOf = (kind: Kind): Map<string, number | null> => {
    const layout = layoutOf(kind);
    const result = new Map<string, number | null>();
    const fail = (unitId: string | null, reason: BillProblem['reason']) => {
      problems.push({ unitId, kind, reason });
      return null;
    };
    const total = (r: MeterReadings, unitId: string | null): number | null => {
      if (!defined(r)) return fail(unitId, 'missing');
      try {
        return sum(r);
      } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        return fail(unitId, 'backwards');
      }
    };

    // the renter pays the supplier directly: nothing is billed for this kind
    if (layout.mode === 'direct') {
      for (const u of billed) result.set(u.id, 0);
      return result;
    }

    // one main meter for the whole property, divided by percentage or by head-count
    if (layout.mode === 'shared') {
      const parent = main[kind];
      const all = parent.length === 0 ? 0 : total(parent, null);
      const weight = (u: BillUnit) => (layout.split === 'percent' ? u.percent?.[kind] : u.occupants);
      const landlordWeight = layout.split === 'heads' ? units.filter((u) => u.residual && !u.billed).reduce((s, u) => s + (u.occupants ?? 0), 0) : 0;
      const weightSum = billed.reduce((s, u) => s + (weight(u) ?? 0), 0) + landlordWeight;
      for (const u of billed) {
        const w = weight(u);
        if (all === null) result.set(u.id, null);
        else if (all === 0) result.set(u.id, 0);
        else if (w === undefined || w <= 0 || weightSum <= 0) result.set(u.id, fail(u.id, 'noShare'));
        else result.set(u.id, round3(layout.split === 'percent' ? (all * w) / 100 : (all * w) / weightSum));
      }
      return result;
    }

    // main meter with sub-meters: the difference goes to the landlord's household, or is shared by the units
    let sharedDifference: number | null = 0;
    if (layout.mode === 'main_sub' && layout.difference === 'units' && main[kind].length > 0) {
      const parent = total(main[kind], null);
      const used = total(units.flatMap((o) => o[kind]), null);
      sharedDifference = parent === null || used === null ? null : billed.length > 0 ? round3(Math.max(0, parent - used) / billed.length) : 0;
    }

    for (const u of billed) {
      if (byDifference(u, kind)) {
        // main meters minus everybody else's meters
        const parent = main[kind];
        if (parent.length === 0) {
          result.set(u.id, 0);
          continue;
        }
        const others = units.filter((o) => o !== u).flatMap((o) => o[kind]);
        if (!defined(parent) || !defined(others)) {
          result.set(u.id, fail(u.id, 'missing'));
          continue;
        }
        try {
          result.set(u.id, Math.max(0, sum(parent) - sum(others)));
        } catch (e) {
          if (!(e instanceof RangeError)) throw e;
          result.set(u.id, fail(u.id, 'backwards'));
        }
        continue;
      }
      const own = total(u[kind], u.id);
      result.set(u.id, own === null || sharedDifference === null ? null : round3(own + sharedDifference));
    }
    return result;
  };
  const usages = { electricity: usageOf('electricity'), water: usageOf('water') };

  const bills: UnitBill[] = [];
  billed.forEach((u, i) => {
    const kwh = usages.electricity.get(u.id) ?? null;
    const m3 = usages.water.get(u.id) ?? null;
    if (kwh === null || m3 === null) return;

    const lines: BillLine[] = [];
    if (kwh > 0) lines.push({ type: 'electricity', qty: kwh, rate: tariff.electricityRate, amount: flatCost(kwh, tariff.electricityRate) });
    const fixed = electricityFixed[i] ?? 0;
    if (fixed > 0) lines.push({ type: 'electricityFixed', amount: fixed });

    // water: the first `waterQuota` m3 at rate A, the rest at rate B (each line rounded to whole agorot)
    const qtyA = Math.min(m3, Math.max(0, u.waterQuota));
    const qtyB = m3 - qtyA;
    if (qtyA > 0) lines.push({ type: 'waterA', qty: qtyA, rate: tariff.waterRateA, amount: flatCost(qtyA, tariff.waterRateA) });
    if (qtyB > 0) lines.push({ type: 'waterB', qty: qtyB, rate: tariff.waterRateB, amount: flatCost(qtyB, tariff.waterRateB) });

    const wFixed = waterFixed[i] ?? 0;
    if (wFixed > 0) lines.push({ type: 'waterFixed', amount: wFixed });

    const sewageQty = u.sewageQty ?? 0;
    const sewageRate = tariff.sewageRate ?? 0;
    if (sewageQty > 0 && sewageRate > 0) lines.push({ type: 'sewage', qty: sewageQty, rate: sewageRate, amount: flatCost(sewageQty, sewageRate) });
    if ((u.propertyTax ?? 0) > 0) lines.push({ type: 'propertyTax', amount: u.propertyTax ?? 0 });
    if (u.communityFee > 0) lines.push({ type: 'community', amount: u.communityFee });
    charges.forEach((c, k) => {
      const mine = c.scope === 'unit' ? (c.unitId === u.id ? c.amount : 0) : (chargeShares[k]?.[i] ?? 0);
      if (mine !== 0) lines.push({ type: 'charge', description: c.description, amount: mine });
    });
    const own = (m: MeterReadings, kind: Kind): Reading | undefined =>
      !byDifference(u, kind) && m.length > 0 && defined(m) ? { prev: m.reduce((s, r) => s + r.prev, 0), cur: m.reduce((s, r) => s + r.cur, 0) } : undefined;
    const readings: UnitBill['readings'] = {};
    const e = own(u.electricity, 'electricity');
    const w = own(u.water, 'water');
    if (e) readings.electricity = e;
    if (w) readings.water = w;
    bills.push({ unitId: u.id, readings, lines, total: lines.reduce((s, l) => s + l.amount, 0) });
  });

  return { bills, problems };
}
