import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthLabel, monthStart } from '../../lib/period';
import AttentionCard from './AttentionCard';
import { useProperty } from './PropertyContext';
import { ChevronIcon, PlusIcon } from '../../components/NavIcons';
import { whatsappLink } from '../../lib/billLabels';

interface Data {
  orgName: string;
  properties: number;
  /** every meter of a rented unit, and every main meter, with whether it has this month's reading */
  meters: { id: string; label: string; sub: string; done: boolean; remind?: string }[];
  bill: { period: string; total: number; paid: number; count: number; paidCount: number } | null;
}

// Landlord home: this month's readings, the latest bills and what needs attention.
export default function LandlordHome({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const period = monthStart();
  const { properties, propertyId } = useProperty();

  useEffect(() => {
    void (async () => {
      const [org, props, units, meters, readings, statements] = await Promise.all([
        supabase.from('organizations').select('name').eq('id', orgId).single(),
        supabase.from('properties').select('id'),
        supabase.from('units').select('id,name,property_id,contracts(status,contract_renters(phone))'),
        supabase.from('meters').select('id,unit_id,kind,property_id'),
        supabase.from('readings').select('meter_id,value').eq('period', period),
        supabase.from('statements').select('period,total_agorot,paid_agorot,paid_on').order('period', { ascending: false }).limit(60),
      ]);
      const unitRows = ((units.data ?? []) as { id: string; name: string; property_id: string; contracts: { status: string; contract_renters: { phone: string | null }[] }[] }[]).filter((u) => !propertyId || u.property_id === propertyId);
      const values = new Map(((readings.data ?? []) as { meter_id: string; value: number }[]).map((x) => [x.meter_id, Number(x.value)]));
      const reported = new Set(values.keys());
      const expected = ((meters.data ?? []) as { id: string; unit_id: string | null; kind: 'electricity' | 'water'; property_id: string }[])
        .filter((m) => !propertyId || m.property_id === propertyId)
        .map((m) => ({ m, unit: unitRows.find((u) => u.id === m.unit_id) }))
        .filter(({ m, unit }) => m.unit_id === null || unit?.contracts.some((c) => c.status === 'active'))
        .map(({ m, unit }) => ({
          id: m.id,
          label: `${unit ? unit.name : t('bills.mainMeters')} · ${t(`meters.${m.kind}`)}`,
          done: reported.has(m.id),
          sub: reported.has(m.id) ? t(unit ? 'landlordHome.renterReported' : 'landlordHome.entered', { v: values.get(m.id) }) : t('landlordHome.notYet'),
          // a ready WhatsApp reminder for the renter of a unit meter that is still empty
          remind: unit && !reported.has(m.id) ? whatsappLink(t('attention.remindReport', { unit: unit.name, kind: t(`meters.${m.kind}`) }), unit.contracts.find((c) => c.status === 'active')?.contract_renters.find((r) => r.phone)?.phone) : undefined,
        }));

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
  }, [orgId, propertyId]);

  if (!data || !properties) return <p className="p-4">{t('common.loading')}</p>;

  const done = data.meters.filter((m) => m.done).length;
  const money = (a: number) => formatMoney(a, i18n.language);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? t('landlordHome.night') : hour < 12 ? t('landlordHome.morning') : hour < 18 ? t('landlordHome.afternoon') : t('landlordHome.evening');
  const pct = data.meters.length ? Math.round((done / data.meters.length) * 100) : 0;

  return (
    <section className="flex flex-col gap-3.5 px-[18px] pb-4 pt-2">
      <div>
        <div className="text-[15px] text-muted">
          {greeting}
          {data.orgName ? `, ${data.orgName}` : ''}
        </div>
        <h1 className="mt-0.5 text-[26px] font-semibold">{monthLabel(period, i18n.language)}</h1>
      </div>

      {data.properties === 0 && (
        <Link to="/property/new" className="flex flex-col gap-1 rounded-[18px] bg-primary p-4 text-white">
          <strong className="text-lg">{t('landlordHome.firstProperty')}</strong>
          <span className="text-sm text-white/85">{t('landlordHome.firstPropertyBody')}</span>
        </Link>
      )}

      {data.meters.length > 0 && (
        <div className="rounded-[18px] border border-line bg-card p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold">{t('landlordHome.readings')}</h2>
            <span className="text-sm text-muted">{t('landlordHome.readingsProgress', { done, total: data.meters.length })}</span>
          </div>
          <div className="mb-1 h-2 overflow-hidden rounded bg-track">
            <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <ul>
            {data.meters.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 border-t border-line-soft py-3 first:border-t-0">
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-[13px] text-muted">{m.sub}</span>
                </span>
                {m.done ? (
                  <span className="inline-flex h-[26px] items-center rounded-full bg-primary-soft px-2.5 text-[13px] font-medium text-primary-dark">✓ {t('landlordHome.reported')}</span>
                ) : m.remind ? (
                  <a href={m.remind} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-[10px] border border-line-strong bg-white px-3 text-sm font-medium text-primary-dark">
                    {t('landlordHome.sendReminder')}
                  </a>
                ) : (
                  <span className="inline-flex h-[26px] items-center rounded-full bg-warn-soft px-2.5 text-[13px] font-medium text-warn">{t('landlordHome.waiting')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.meters.length > 0 && (
        <Link to="/readings" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-medium text-white">
          <PlusIcon />
          {t('landlordHome.enterReading')}
        </Link>
      )}

      {data.bill && (
        <Link to="/bills" className="flex items-center justify-between rounded-[18px] border border-line bg-card p-4">
          <span className="flex flex-col">
            <span className="text-sm text-muted">
              {t('landlordHome.lastBills')} · {monthLabel(data.bill.period, i18n.language)}
            </span>
            <strong className="mt-0.5 text-[26px] font-semibold" dir="ltr">
              {money(data.bill.total)}
            </strong>
            <span className="mt-0.5 text-[13px] text-primary-dark">{t('landlordHome.paidOf', { paid: data.bill.paidCount, count: data.bill.count, amount: money(data.bill.paid) })}</span>
          </span>
          <span className="text-muted">
            <ChevronIcon />
          </span>
        </Link>
      )}

      <AttentionCard />
    </section>
  );
}
