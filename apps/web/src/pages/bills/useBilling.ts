import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeBills, type BillCharge, type BillInput, type BillLine, type BillResult, type BillTariff, type MeterReadings } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { shiftMonth } from '../../lib/period';

export interface UnitInfo {
  id: string;
  name: string;
  community_fee_agorot: number;
  water_quota: number;
  is_residual: boolean;
  contracts: { id: string; status: string }[];
}
export interface ChargeRow {
  id: string;
  unit_id: string | null;
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

  const load = useCallback(async () => {
    if (!propertyId) return;
    const [t, u, m, r, c, b, sb] = await Promise.all([

      supabase.from('tariffs').select('electricity_rate,electricity_fixed,water_rate_a,water_rate_b').eq('property_id', propertyId).maybeSingle(),
      supabase.from('units').select('id,name,community_fee_agorot,water_quota,is_residual,contracts(id,status)').eq('property_id', propertyId).order('created_at'),
      supabase.from('meters').select('id,unit_id,kind').eq('property_id', propertyId),
      supabase.from('readings').select('meter_id,period,value').in('period', [period, shiftMonth(period, -1)]),
      supabase.from('charges').select('id,unit_id,description,amount').eq('property_id', propertyId).eq('period', period).order('created_at'),
      supabase.from('billing_periods').select('id').eq('property_id', propertyId).eq('period', period).maybeSingle(),
      supabase.from('supplier_bills').select('kind,amount_agorot').eq('property_id', propertyId).eq('period', period),
    ]);
    const err = [t, u, m, r, c, b].find((x) => x.error)?.error;
    setError(err?.message ?? '');
    setTariff((t.data as TariffRow | null) ?? null);
    setUnits((u.data as UnitInfo[]) ?? []);
    setMeters((m.data as MeterInfo[]) ?? []);
    setReadings(((r.data ?? []) as { meter_id: string; period: string; value: number }[]).map((x) => ({ ...x, value: Number(x.value) })));
    setCharges(((c.data ?? []) as ChargeRow[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setBilling((b.data as { id: string } | null) ?? null);
    const sup: SupplierAmounts = {};
    for (const x of (sb.data ?? []) as { kind: 'electricity' | 'water'; amount_agorot: number }[]) sup[x.kind] = Number(x.amount_agorot);
    setSupplier(sup);
    if (b.data) {
      const s = await supabase
        .from('statements')
        .select('id,unit_id,contract_id,period,total_agorot,lines,paid_agorot,paid_on,paid_method')
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

  const { input, result } = useMemo(() => {
    if (!tariff) return { input: null, result: null as BillResult | null };
    const prev = shiftMonth(period, -1);
    const read = (meterId: string) => {
      const cur = readings.find((x) => x.meter_id === meterId && x.period === period);
      const before = readings.find((x) => x.meter_id === meterId && x.period === prev);
      return cur && before ? { prev: before.value, cur: cur.value } : undefined;
    };
    const of = (unitId: string | null, kind: MeterInfo['kind']): MeterReadings =>
      meters.filter((x) => x.unit_id === unitId && x.kind === kind).map((x) => read(x.id));
    const billCharges: BillCharge[] = charges.map((x) => ({ id: x.id, unitId: x.unit_id, description: x.description, amount: x.amount }));
    const inp: BillInput = {
      tariff: tariffFromRow(tariff),
      main: { electricity: of(null, 'electricity'), water: of(null, 'water') },
      units: units.map((u) => ({
        id: u.id,
        billed: u.contracts.some((c) => c.status === 'active'),
        residual: u.is_residual,
        communityFee: Number(u.community_fee_agorot),
        waterQuota: Number(u.water_quota),
        electricity: of(u.id, 'electricity'),
        water: of(u.id, 'water'),
      })),
      charges: billCharges,
    };
    return { input: inp, result: computeBills(inp) };
  }, [tariff, units, meters, readings, charges, period]);

  return { loaded, error, setError, tariff, units, charges, billing, statements, payments, supplier, input, result, reload: load };
}
