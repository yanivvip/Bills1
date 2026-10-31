import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { shiftMonth } from '../../lib/period';

export type MeterKind = 'electricity' | 'water';

export interface MeterRow {
  id: string;
  org_id: string;
  property_id: string;
  unit_id: string | null;
  kind: MeterKind;
  name: string;
  properties: { name: string } | null;
  units: { name: string } | null;
}
export interface ReadingRow {
  id: string;
  meter_id: string;
  period: string;
  value: number;
  status: 'submitted' | 'approved';
  submitted_at: string;
  read_on: string;
}

// Meters visible to the signed-in user (RLS decides: landlord sees all, renter only their unit)
// plus the readings for the chosen month and the month before it.
export function useMonthlyReadings(period: string) {
  const [meters, setMeters] = useState<MeterRow[] | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [m, r] = await Promise.all([
      supabase.from('meters').select('id,org_id,property_id,unit_id,kind,name,properties(name),units(name)').order('created_at'),
      supabase.from('readings').select('id,meter_id,period,value,status,submitted_at,read_on').in('period', [period, shiftMonth(period, -1)]),
    ]);
    setError(m.error?.message ?? r.error?.message ?? '');
    setMeters((m.data as unknown as MeterRow[]) ?? []);
    setReadings(((r.data ?? []) as ReadingRow[]).map((x) => ({ ...x, value: Number(x.value) })));
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (meter: MeterRow, value: number, readOn: string) => {
    const { error } = await supabase
      .from('readings')
      .upsert({ org_id: meter.org_id, meter_id: meter.id, period, value, read_on: readOn }, { onConflict: 'meter_id,period' });
    setError(error?.message ?? '');
    if (!error) await load();
    return !error;
  };

  const current = (meterId: string) => readings.find((x) => x.meter_id === meterId && x.period === period);
  const previous = (meterId: string) => readings.find((x) => x.meter_id === meterId && x.period === shiftMonth(period, -1));

  return { meters, error, save, current, previous };
}
