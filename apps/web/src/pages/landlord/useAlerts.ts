import { useCallback, useEffect, useMemo, useState } from 'react';
import { attentionItems, contractsEnding } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { monthStart, shiftMonth, today } from '../../lib/period';
import { loadOrgSettings } from './useOrgSettings';

export type AlertType = 'monthlyReminder' | 'highUsage' | 'noReport' | 'unpaid' | 'contractEnding' | 'reported' | 'renterPaid';
export interface Alert {
  /** stable id used to remember that the alert was read */
  key: string;
  type: AlertType;
  /** where tapping the alert goes */
  to: string;
  params: Record<string, string | number>;
}

const storeKey = (userId: string) => `bills.alertsRead.${userId}`;
const readSeen = (userId: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(storeKey(userId)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

type UnitRow = { id: string; name: string; contracts: { status: string; end_date: string | null }[] };
type MeterRow = { id: string; unit_id: string | null; kind: 'electricity' | 'water'; name: string };
type ReadingRow = { meter_id: string; period: string; value: number; submitted_by: string | null; submitted_at: string };
type StatementRow = { unit_id: string; period: string; total_agorot: number; paid_agorot: number; renter_paid_notice_at: string | null };

// Everything the landlord should know about, worked out from the data (nothing is stored except which alerts were read).
// "Read" is remembered on this device only.
export function useAlerts() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(userId));

  useEffect(() => {
    if (!userId) return;
    setSeen(readSeen(userId));
    void (async () => {
      const period = monthStart();
      const [settings, u, m, r, s] = await Promise.all([
        loadOrgSettings(),
        supabase.from('units').select('id,name,contracts(status,end_date)'),
        supabase.from('meters').select('id,unit_id,kind,name'),
        supabase.from('readings').select('meter_id,period,value,submitted_by,submitted_at').gte('period', shiftMonth(period, -4)),
        supabase.from('statements').select('unit_id,period,total_agorot,paid_agorot,renter_paid_notice_at').is('paid_on', null),
      ]);
      const units = (u.data ?? []) as unknown as UnitRow[];
      const meters = (m.data ?? []) as MeterRow[];
      const readings = ((r.data ?? []) as ReadingRow[]).map((x) => ({ ...x, value: Number(x.value) }));
      const statements = (s.data ?? []) as StatementRow[];
      const name = (id: string | null) => (id ? (units.find((x) => x.id === id)?.name ?? '') : '');
      const out: Alert[] = [];

      const items = attentionItems({
        period,
        units: units.map((x) => ({ id: x.id, name: x.name, rented: x.contracts.some((c) => c.status === 'active') })),
        meters: meters.map((x) => ({ id: x.id, unitId: x.unit_id, kind: x.kind, name: x.name })),
        readings: readings.map((x) => ({ meterId: x.meter_id, period: x.period, value: x.value })),
        statements: statements
          .filter((x) => Number(x.total_agorot) > Number(x.paid_agorot))
          .map((x) => ({ unitId: x.unit_id, period: x.period, total: Number(x.total_agorot) - Number(x.paid_agorot), paid: false })),
        thresholdPct: settings.usage_threshold_pct,
      });
      const day = new Date().getDate();
      const remindNow = settings.remind_monthly && day >= settings.remind_day;
      for (const it of items) {
        if (it.type === 'highUsage' && settings.usage_alert) out.push({ key: `high:${it.meterId}:${period}`, type: 'highUsage', to: '/history', params: { name: name(it.unitId), kind: it.kind, pct: Math.round((it.usage / it.average - 1) * 100) } });
        if (it.type === 'noReport' && remindNow) out.push({ key: `noreport:${it.meterId}:${period}`, type: 'noReport', to: '/readings', params: { unit: name(it.unitId), kind: it.kind } });
        if (it.type === 'unpaid') out.push({ key: `unpaid:${it.unitId}:${it.period}`, type: 'unpaid', to: '/bills', params: { unit: name(it.unitId), period: it.period, total: it.total } });
      }

      for (const x of statements) {
        if (x.renter_paid_notice_at && Number(x.total_agorot) > Number(x.paid_agorot)) {
          out.push({ key: `renterpaid:${x.unit_id}:${x.period}:${x.renter_paid_notice_at}`, type: 'renterPaid', to: '/bills', params: { unit: name(x.unit_id), period: x.period } });
        }
      }

      // a renter (anybody but the landlord) reported this month's readings in the last two weeks
      const since = Date.now() - 14 * 86_400_000;
      const reported = new Map<string, number>();
      for (const x of readings) {
        if (x.period !== period || x.submitted_by === userId || new Date(x.submitted_at).getTime() < since) continue;
        const unitId = meters.find((mt) => mt.id === x.meter_id)?.unit_id;
        if (unitId) reported.set(unitId, Math.max(reported.get(unitId) ?? 0, new Date(x.submitted_at).getTime()));
      }
      for (const [unitId, at] of reported) out.push({ key: `reported:${unitId}:${period}:${at}`, type: 'reported', to: '/readings', params: { unit: name(unitId) } });

      // the monthly reminder: from the chosen day, one line to remind the renters who have not reported
      const missing = items.filter((it) => it.type === 'noReport').length;
      if (remindNow && missing > 0) out.unshift({ key: `remind:${period}`, type: 'monthlyReminder', to: '/', params: { count: missing } });

      const ending = settings.contract_alert
        ? contractsEnding(
            units.flatMap((x) => x.contracts.filter((c) => c.status === 'active').map((c) => ({ unitId: x.id, endDate: c.end_date }))),
            today(),
            settings.contract_alert_days,
          )
        : [];
      for (const c of ending) out.push({ key: `ending:${c.unitId}:${c.endDate}`, type: 'contractEnding', to: `/units/${c.unitId}`, params: { unit: name(c.unitId), days: c.days, date: c.endDate } });

      setAlerts(out);
    })();
  }, [userId]);

  const unread = useMemo(() => (alerts ?? []).filter((a) => !seen.has(a.key)), [alerts, seen]);

  const markAllRead = useCallback(() => {
    if (!alerts || !userId) return;
    const next = new Set([...seen, ...alerts.map((a) => a.key)]);
    try {
      localStorage.setItem(storeKey(userId), JSON.stringify([...next]));
    } catch {
      // private mode: the alerts simply come back as unread
    }
    setSeen(next);
  }, [alerts, seen, userId]);

  return { alerts, seen, unread, markAllRead };
}
