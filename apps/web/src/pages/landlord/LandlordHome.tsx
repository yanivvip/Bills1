import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthLabel, monthStart } from '../../lib/period';
import AttentionCard from './AttentionCard';
import { card } from './shared';

interface Data {
  orgName: string;
  properties: number;
  /** every meter of a rented unit, and every main meter, with whether it has this month's reading */
  meters: { id: string; label: string; done: boolean }[];
  bill: { period: string; total: number; paid: number; count: number; paidCount: number } | null;
}

// Landlord home: this month's readings, the latest bills and what needs attention.
export default function LandlordHome({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const period = monthStart();

  useEffect(() => {
    void (async () => {
      const [org, props, units, meters, readings, statements] = await Promise.all([
        supabase.from('organizations').select('name').eq('id', orgId).single(),
        supabase.from('properties').select('id'),
        supabase.from('units').select('id,name,contracts(status)'),
        supabase.from('meters').select('id,unit_id,kind'),
        supabase.from('readings').select('meter_id').eq('period', period),
        supabase.from('statements').select('period,total_agorot,paid_agorot,paid_on').order('period', { ascending: false }).limit(60),
      ]);
      const unitRows = (units.data ?? []) as { id: string; name: string; contracts: { status: string }[] }[];
      const reported = new Set(((readings.data ?? []) as { meter_id: string }[]).map((x) => x.meter_id));
      const expected = ((meters.data ?? []) as { id: string; unit_id: string | null; kind: 'electricity' | 'water' }[])
        .map((m) => ({ m, unit: unitRows.find((u) => u.id === m.unit_id) }))
        .filter(({ m, unit }) => m.unit_id === null || unit?.contracts.some((c) => c.status === 'active'))
        .map(({ m, unit }) => ({ id: m.id, label: `${unit ? unit.name : t('bills.mainMeters')} · ${t(`meters.${m.kind}`)}`, done: reported.has(m.id) }));

      const rows = (statements.data ?? []) as { period: string; total_agorot: number; paid_agorot: number; paid_on: string | null }[];
      const latest = rows[0]?.period;
      const month = rows.filter((x) => x.period === latest);
      setData({
        orgName: org.data?.name ?? '',
        properties: (props.data ?? []).length,
        meters: expected,
        bill: latest
          ? {
              period: latest,
              total: month.reduce((s, x) => s + Number(x.total_agorot), 0),
              paid: month.reduce((s, x) => s + Number(x.paid_agorot), 0),
              count: month.length,
              paidCount: month.filter((x) => x.paid_on).length,
            }
          : null,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (!data) return <p className="p-4">{t('common.loading')}</p>;

  const done = data.meters.filter((m) => m.done).length;
  const money = (a: number) => formatMoney(a, i18n.language);

  return (
    <section className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">{data.orgName}</h1>
        <p className="text-slate-400">{monthLabel(period, i18n.language)}</p>
      </div>

      {data.properties === 0 && (
        <Link to="/property/new" className="flex flex-col gap-1 rounded-2xl bg-violet-700 p-4">
          <strong className="text-lg">{t('landlordHome.firstProperty')}</strong>
          <span className="text-sm text-violet-100">{t('landlordHome.firstPropertyBody')}</span>
        </Link>
      )}

      {data.meters.length > 0 && (
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-300">{t('landlordHome.readings')}</h2>
            <span className="text-sm text-slate-400">{t('landlordHome.readingsProgress', { done, total: data.meters.length })}</span>
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {data.meters.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span>{m.label}</span>
                <span className={m.done ? 'text-emerald-400' : 'text-amber-300'}>{m.done ? `✓ ${t('landlordHome.reported')}` : t('landlordHome.waiting')}</span>
              </li>
            ))}
          </ul>
          <Link to="/readings" className="self-start rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold">
            {t('landlordHome.enterReading')}
          </Link>
        </div>
      )}

      {data.bill && (
        <Link to="/bills" className={card}>
          <span className="text-sm text-slate-400">
            {t('landlordHome.lastBills')} · {monthLabel(data.bill.period, i18n.language)}
          </span>
          <strong className="text-3xl" dir="ltr">
            {money(data.bill.total)}
          </strong>
          <span className="text-sm text-slate-400">{t('landlordHome.paidOf', { paid: data.bill.paidCount, count: data.bill.count, amount: money(data.bill.paid) })}</span>
        </Link>
      )}

      <AttentionCard />
    </section>
  );
}
