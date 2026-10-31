import { splitEvenly, type Agorot } from './money.js';
import { consumption, type Reading } from './usage.js';
import { flatCost } from './tariff.js';

/** All meters of one kind. An entry is `undefined` while its reading (this or last month) is still missing. */
export type MeterReadings = readonly (Reading | undefined)[];

export interface BillTariff {
  /** agorot per kWh (may be fractional) */
  electricityRate: number;
  /** fixed monthly electricity charge for the whole property, split evenly between the billed units */
  electricityFixed: Agorot;
  /** agorot per m3 up to the unit's quota, and above it */
  waterRateA: number;
  waterRateB: number;
}

export interface BillUnit {
  id: string;
  /** false for a vacant unit: its meters still count when subtracting from the main meter, but it gets no bill */
  billed: boolean;
  /** true: consumption = main meter minus the other units' meters (the landlord's own household) */
  residual: boolean;
  communityFee: Agorot;
  /** m3 per month charged at rate A; the rest at rate B */
  waterQuota: number;
  electricity: MeterReadings;
  water: MeterReadings;
}

export interface BillCharge {
  id: string;
  /** null = charged to every billed unit (the full amount to each) */
  unitId: string | null;
  description: string;
  amount: Agorot;
}

export interface BillInput {
  tariff: BillTariff;
  units: readonly BillUnit[];
  main: { electricity: MeterReadings; water: MeterReadings };
  charges: readonly BillCharge[];
}

export type LineType = 'electricity' | 'electricityFixed' | 'waterA' | 'waterB' | 'community' | 'charge';

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
  const fixedShares = billed.length > 0 ? splitEvenly(tariff.electricityFixed, billed.length) : [];

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
    const fixed = fixedShares[i] ?? 0;
    if (fixed > 0) lines.push({ type: 'electricityFixed', amount: fixed });

    // water: the first `waterQuota` m3 at rate A, the rest at rate B (each line rounded to whole agorot)
    const qtyA = Math.min(m3, Math.max(0, u.waterQuota));
    const qtyB = m3 - qtyA;
    if (qtyA > 0) lines.push({ type: 'waterA', qty: qtyA, rate: tariff.waterRateA, amount: flatCost(qtyA, tariff.waterRateA) });
    if (qtyB > 0) lines.push({ type: 'waterB', qty: qtyB, rate: tariff.waterRateB, amount: flatCost(qtyB, tariff.waterRateB) });

    if (u.communityFee > 0) lines.push({ type: 'community', amount: u.communityFee });
    for (const c of charges) {
      if (c.unitId === null || c.unitId === u.id) lines.push({ type: 'charge', description: c.description, amount: c.amount });
    }
    bills.push({ unitId: u.id, lines, total: lines.reduce((s, l) => s + l.amount, 0) });
  });

  return { bills, problems };
}
