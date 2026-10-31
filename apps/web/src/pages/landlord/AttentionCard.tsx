import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { attentionItems, type AttentionItem } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthLabel, monthStart, shiftMonth } from '../../lib/period';
import { whatsappLink } from '../../lib/billLabels';

interface Data {
  items: AttentionItem[];
  unitName: (id: string | null) => string;
  hasMeters: boolean;
}

// Landlord home: what needs attention this month (missing reports, unpaid bills, unusual usage).
export default function AttentionCard() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const period = monthStart();

  useEffect(() => {
    void (async () => {
      const [u, m, r, s] = await Promise.all([
        supabase.from('units').select('id,name,properties(name),contracts(status)'),
        supabase.from('meters').select('id,unit_id,kind,name'),
        supabase.from('readings').select('meter_id,period,value').gte('period', shiftMonth(period, -4)),
        supabase.from('statements').select('unit_id,period,total_agorot,paid_on').is('paid_on', null),
      ]);
      type U = { id: string; name: string; properties: { name: string } | null; contracts: { status: string }[] };
      const units = (u.data ?? []) as unknown as U[];
      const items = attentionItems({
        period,
        units: units.map((x) => ({ id: x.id, name: x.name, rented: x.contracts.some((c) => c.status === 'active') })),
        meters: ((m.data ?? []) as { id: string; unit_id: string | null; kind: 'electricity' | 'water'; name: string }[]).map((x) => ({ id: x.id, unitId: x.unit_id, kind: x.kind, name: x.name })),
        readings: ((r.data ?? []) as { meter_id: string; period: string; value: number }[]).map((x) => ({ meterId: x.meter_id, period: x.period, value: Number(x.value) })),
        statements: ((s.data ?? []) as { unit_id: string; period: string; total_agorot: number }[]).map((x) => ({ unitId: x.unit_id, period: x.period, total: Number(x.total_agorot), paid: false })),
      });
      setData({
        items,
        unitName: (id) => (id ? (units.find((x) => x.id === id)?.name ?? '') : t('bills.mainMeters')),
        hasMeters: (m.data ?? []).length > 0,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || !data.hasMeters) return null;
  const { items, unitName } = data;

  if (items.length === 0) {
    return <p className="rounded-2xl bg-emerald-900/30 p-3 text-sm text-emerald-300">✓ {t('attention.allClear')}</p>;
  }

  // a line that links to the right page, with an optional ready-made WhatsApp reminder for the renter
  const row = (key: string, to: string, text: string, reminder?: string) => (
    <div key={key} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
      <Link to={to}>{text}</Link>
      {reminder && (
        <a href={whatsappLink(reminder)} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-md bg-white/10 px-2 py-1 text-xs">
          💬 {t('attention.remind')}
        </a>
      )}
    </div>
  );
  const kind = (k: 'electricity' | 'water') => t(`meters.${k}`);

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-amber-900/30 p-4" role="region" aria-label={t('attention.title')}>
      <h2 className="text-lg font-semibold text-amber-300">⚠ {t('attention.title')}</h2>
      {items.map((it, i) => {
        if (it.type === 'noReport') return row(`n${i}`, '/readings', t('attention.noReport', { unit: unitName(it.unitId), kind: kind(it.kind) }), t('attention.remindReport', { unit: unitName(it.unitId), kind: kind(it.kind) }));
        if (it.type === 'unpaid')
          return row(`p${i}`, '/bills', t('attention.unpaid', { unit: unitName(it.unitId), month: monthLabel(it.period, i18n.language), amount: formatMoney(it.total, i18n.language) }), t('attention.remindPay', { unit: unitName(it.unitId), month: monthLabel(it.period, i18n.language), amount: formatMoney(it.total, i18n.language) }));
        return row(`h${i}`, '/readings', t('attention.highUsage', { name: unitName(it.unitId), kind: kind(it.kind), usage: Math.round(it.usage * 10) / 10, average: Math.round(it.average * 10) / 10 }));
      })}
    </div>
  );
}
