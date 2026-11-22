import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeBills, isDueMonth, type BillCharge, type ChargeScope, type FixedScope, type KindLayout, type BillInput, type BillLine, type BillResult, type BillTariff, type MeterReadings } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { shiftMonth } from '../../lib/period';

export interface UnitInfo {
  id: string;
  name: string;
  community_fee_agorot: number;
  water_quota: number;
  is_residual: boolean;
  property_tax_agorot: number;
  occupants: number;
  electricity_percent: number | null;
  water_percent: number | null;
  contracts: { id: string; status: string }[];
}
export interface ChargeRow {
  id: string;
  unit_id: string | null;
  scope: ChargeScope;
  recurring: boolean;
  description: string;
  amount: number;
}
export interface StatementRow {
  id: string;
  unit_id: string;
  contract_id: string;
  period: string;
  total_agorot: number;
  lines: BillLine[];
  readings?: { electricity?: { prev: number; cur: number }; water?: { prev: number; cur: number } } | null;
  paid_agorot: number;
  paid_on: string | null;
  paid_method: 'bit' | 'transfer' | 'cash' | 'other' | null;
  /** when the renter said they paid; the landlord still records the payment */
  renter_paid_notice_at?: string | null;
}
export interface PaymentRow {
  id: string;
  statement_id: string;
  amount_agorot: number;
  paid_on: string;
  method: 'bit' | 'transfer' | 'cash' | 'other';
  note: string | null;
}
export type SupplierAmounts = { electricity?: number; water?: number };
interface TariffRow {
  electricity_rate: number;
  electricity_fixed: number;
  water_rate_a: number;
  water_rate_b: number;
  water_fixed: number;
  electricity_fixed_scope: FixedScope;
  water_fixed_scope: FixedScope;
  sewage_rate: number;
  property_tax_every: 1 | 2;
  property_tax_anchor: string | null;
  electricity_layout: KindLayout['mode'];
  electricity_difference: KindLayout['difference'];
  electricity_split: KindLayout['split'];
  water_layout: KindLayout['mode'];
  water_difference: KindLayout['difference'];
  water_split: KindLayout['split'];
}
interface MeterInfo {
  id: string;
  unit_id: string | null;
  kind: 'electricity' | 'water';
}

export const tariffFromRow = (t: TariffRow): BillTariff => ({
  electricityRate: Number(t.electricity_rate),
  electricityFixed: Number(t.electricity_fixed),
  waterRateA: Number(t.water_rate_a),
  waterRateB: Number(t.water_rate_b),
  waterFixed: Number(t.water_fixed),
  electricityFixedScope: t.electricity_fixed_scope,
  waterFixedScope: t.water_fixed_scope,
  sewageRate: Number(t.sewage_rate),
});
export const TARIFF_COLUMNS = 'electricity_rate,electricity_fixed,water_rate_a,water_rate_b,water_fixed,electricity_fixed_scope,water_fixed_scope,sewage_rate,property_tax_every,property_tax_anchor,electricity_layout,electricity_difference,electricity_split,water_layout,water_difference,water_split';
export const layoutFromRow = (t: TariffRow): { electricity: KindLayout; water: KindLayout } => ({
  electricity: { mode: t.electricity_layout, difference: t.electricity_difference, split: t.electricity_split },
  water: { mode: t.water_layout, difference: t.water_difference, split: t.water_split },
});

// Everything the landlord's billing page needs for one property and month, and the computed preview.
export function useBilling(propertyId: string | undefined, period: string) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [tariff, setTariff] = useState<TariffRow | null>(null);
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [meters, setMeters] = useState<MeterInfo[]>([]);
  const [readings, setReadings] = useState<{ meter_id: string; period: string; value: number }[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [billing, setBilling] = useState<{ id: string } | null>(null);
  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [supplier, setSupplier] = useState<SupplierAmounts>({});
  const [sewage, setSewage] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!propertyId) return;
    const [t, u, m, r, c, b, sb, sw, mf] = await Promise.all([
      supabase.from('tariffs').select(TARIFF_COLUMNS).eq('property_id', propertyId).maybeSingle(),
      supabase.from('units').select('id,name,community_fee_agorot,water_quota,is_residual,property_tax_agorot,occupants,electricity_percent,water_percent,contracts(id,status)').eq('property_id', propertyId).order('created_at'),
      supabase.from('meters').select('id,unit_id,kind').eq('property_id', propertyId),
      supabase.from('readings').select('meter_id,period,value').in('period', [period, shiftMonth(period, -1)]),
      supabase.from('charges').select('id,unit_id,scope,recurring,description,amount').eq('property_id', propertyId).eq('period', period).order('created_at'),
      supabase.from('billing_periods').select('id').eq('property_id', propertyId).eq('period', period).maybeSingle(),
      supabase.from('supplier_bills').select('kind,amount_agorot').eq('property_id', propertyId).eq('period', period),
      supabase.from('sewage_entries').select('unit_id,qty').eq('property_id', propertyId).eq('period', period),
      // the standing charges of the latest month up to this one (they hold until they are changed again)
      supabase.from('monthly_fixed').select('electricity_fixed,water_fixed').eq('property_id', propertyId).lte('period', period).order('period', { ascending: false }).limit(1),
    ]);
    const err = [t, u, m, r, c, b].find((x) => x.error)?.error;
    setError(err?.message ?? '');
    const fixed = ((mf.data ?? []) as { electricity_fixed: number; water_fixed: number }[])[0];
    setTariff(t.data ? ({ ...(t.data as unknown as TariffRow), ...(fixed ? { electricity_fixed: fixed.electricity_fixed, water_fixed: fixed.water_fixed } : {}) } as TariffRow) : null);
    setUnits((u.data as UnitInfo[]) ?? []);
    setMeters((m.data as MeterInfo[]) ?? []);
    setReadings(((r.data ?? []) as { meter_id: string; period: string; value: number }[]).map((x) => ({ ...x, value: Number(x.value) })));
    setCharges(((c.data ?? []) as ChargeRow[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setBilling((b.data as { id: string } | null) ?? null);
    const sup: SupplierAmounts = {};
    for (const x of (sb.data ?? []) as { kind: 'electricity' | 'water'; amount_agorot: number }[]) sup[x.kind] = Number(x.amount_agorot);
    setSupplier(sup);
    setSewage(Object.fromEntries(((sw.data ?? []) as { unit_id: string; qty: number }[]).map((x) => [x.unit_id, Number(x.qty)])));
    if (b.data) {
      const s = await supabase
        .from('statements')
        .select('id,unit_id,contract_id,period,total_agorot,lines,paid_agorot,paid_on,paid_method,renter_paid_notice_at')
        .eq('billing_id', (b.data as { id: string }).id);
      const rows = ((s.data ?? []) as StatementRow[]).map((x) => ({ ...x, total_agorot: Number(x.total_agorot), paid_agorot: Number(x.paid_agorot) }));
      setStatements(rows);
      const p = rows.length > 0 ? await supabase.from('payments').select('id,statement_id,amount_agorot,paid_on,method,note').in('statement_id', rows.map((x) => x.id)).order('paid_on') : { data: [] };
      setPayments(((p.data ?? []) as PaymentRow[]).map((x) => ({ ...x, amount_agorot: Number(x.amount_agorot) })));
    } else {
      setStatements([]);
      setPayments([]);
    }
    setLoaded(true);
  }, [propertyId, period]);

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [load]);

  // property tax and sewage are billed only in the months the property-tax bill falls in
  const taxDue = tariff ? isDueMonth(Number(tariff.property_tax_every) === 2 ? 2 : 1, tariff.property_tax_anchor, period) : false;

  const { input, result, own } = useMemo(() => {
    if (!tariff) return { input: null, result: null as BillResult | null, own: null as number | null };
    const prev = shiftMonth(period, -1);
    const read = (meterId: string) => {
      const cur = readings.find((x) => x.meter_id === meterId && x.period === period);
      const before = readings.find((x) => x.meter_id === meterId && x.period === prev);
      return cur && before ? { prev: before.value, cur: cur.value } : undefined;
    };
    const of = (unitId: string | null, kind: MeterInfo['kind']): MeterReadings =>
      meters.filter((x) => x.unit_id === unitId && x.kind === kind).map((x) => read(x.id));
    const billCharges: BillCharge[] = charges.map((x) => ({ id: x.id, scope: x.scope, unitId: x.unit_id, description: x.description, amount: x.amount }));
    const inp: BillInput = {
      tariff: tariffFromRow(tariff),
      layout: layoutFromRow(tariff),
      main: { electricity: of(null, 'electricity'), water: of(null, 'water') },
      units: units.map((u) => ({
        id: u.id,
        billed: u.contracts.some((c) => c.status === 'active'),
        residual: u.is_residual,
        communityFee: Number(u.community_fee_agorot),
        occupants: Number(u.occupants),
        percent: { electricity: u.electricity_percent === null ? undefined : Number(u.electricity_percent), water: u.water_percent === null ? undefined : Number(u.water_percent) },
        propertyTax: taxDue ? Number(u.property_tax_agorot) : 0,
        sewageQty: taxDue ? (sewage[u.id] ?? 0) : 0,
        waterQuota: Number(u.water_quota),
        electricity: of(u.id, 'electricity'),
        water: of(u.id, 'water'),
      })),
      charges: billCharges,
    };
    // what the landlord's own household uses, priced like a renter's (the difference between the main meter and the units)
    const ownUnit = inp.units.find((u) => u.residual && !u.billed);
    let own: number | null = null;
    if (ownUnit) {
      const hypothetical = computeBills({ ...inp, units: inp.units.map((u) => (u === ownUnit ? { ...u, billed: true } : u)) });
      const b = hypothetical.bills.find((x) => x.unitId === ownUnit.id);
      if (b) own = b.lines.filter((l) => l.type === 'electricity' || l.type === 'waterA' || l.type === 'waterB').reduce((s, l) => s + l.amount, 0);
    }
    return { input: inp, result: computeBills(inp), own };
  }, [tariff, units, meters, readings, charges, period, taxDue, sewage]);

  return { loaded, error, setError, tariff, taxDue, sewage, units, charges, billing, statements, payments, supplier, input, result, own, reload: load };
}
