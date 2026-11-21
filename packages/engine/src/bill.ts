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

export interface BillInput {
  tariff: BillTariff;
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
  reason: 'missing' | 'backwards';
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

  /** Usage in kWh / m3 for a unit, or null when it cannot be computed. */
  const usage = (u: BillUnit, kind: Kind): number | null => {
    const own = u[kind];
    try {
      if (!u.residual) {
        if (!defined(own)) {
          problems.push({ unitId: u.id, kind, reason: 'missing' });
          return null;
        }
        return sum(own);
      }
      // residual unit: main meters minus everybody else's meters
      const parent = main[kind];
      if (parent.length === 0) return 0;
      const others = units.filter((o) => o !== u).flatMap((o) => o[kind]);
      if (!defined(parent) || !defined(others)) {
        problems.push({ unitId: u.id, kind, reason: 'missing' });
        return null;
      }
      const total = (parent as readonly Reading[]).reduce((s, p) => s + consumption(p), 0);
      const used = (others as readonly Reading[]).reduce((s, o) => s + consumption(o), 0);
      return Math.max(0, total - used);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      problems.push({ unitId: u.id, kind, reason: 'backwards' });
      return null;
    }
  };

  const bills: UnitBill[] = [];
  billed.forEach((u, i) => {
    const before = problems.length;
    const kwh = usage(u, 'electricity');
    const m3 = usage(u, 'water');
    if (problems.length > before || kwh === null || m3 === null) return;

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
    const own = (m: MeterReadings): Reading | undefined =>
      !u.residual && m.length > 0 && defined(m) ? { prev: m.reduce((s, r) => s + r.prev, 0), cur: m.reduce((s, r) => s + r.cur, 0) } : undefined;
    const readings: UnitBill['readings'] = {};
    const e = own(u.electricity);
    const w = own(u.water);
    if (e) readings.electricity = e;
    if (w) readings.water = w;
    bills.push({ unitId: u.id, readings, lines, total: lines.reduce((s, l) => s + l.amount, 0) });
  });

  return { bills, problems };
}
