import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { monthStart } from '../../lib/period';
import { useProperty } from '../landlord/PropertyContext';
import MonthNav from './MonthNav';
import ReadingInput from './ReadingInput';
import { useMonthlyReadings, type MeterRow } from './useMonthlyReadings';

interface Group {
  key: string;
  title: string;
  meters: MeterRow[];
}

// Landlord: every meter for the month, grouped by property -> (main meters, then each unit).
export default function ReadingsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(monthStart());
  const [group, setGroup] = useState('');
  const { meters: all, error, save, current, previous } = useMonthlyReadings(period);
  const { propertyId } = useProperty();
  const meters = all && (propertyId ? all.filter((m) => m.property_id === propertyId) : all);

  if (!meters) return <p className="p-4">{t('common.loading')}</p>;

  const groups: Group[] = [];
  for (const m of meters) {
    const key = `${m.property_id}:${m.unit_id ?? 'main'}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const property = m.properties?.name ?? '';
      g = { key, title: m.unit_id ? `${property} · ${m.units?.name ?? ''}` : `${property} · ${t('meters.main')}`, meters: [] };
      groups.push(g);
    }
    g.meters.push(m);
  }
  groups.sort((a, b) => a.title.localeCompare(b.title));

  const done = meters.filter((m) => current(m.id)).length;

  const shown = groups.find((g) => g.key === group) ?? groups.find((g) => g.meters.some((m) => !current(m.id))) ?? groups[0];

  return (
    <section className="flex flex-col gap-3.5 px-[18px] pb-4 pt-1">
      <h1 className="text-2xl font-semibold">{t('readings.title')}</h1>
      <MonthNav period={period} onChange={setPeriod} />
      {meters.length > 0 && (
        <p className={`text-sm ${done === meters.length ? 'text-ok' : 'text-warn'}`}>
          {t('readings.progress', { done, total: meters.length })}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {meters.length === 0 && (
        <p className="text-muted">
          {t('readings.noMeters')} <Link to="/" className="underline">{t('nav.home')}</Link>
        </p>
      )}

      {groups.length > 1 && (
        <div className="flex gap-1 rounded-xl bg-track p-1" role="tablist">
          {groups.map((g) => {
            const complete = g.meters.every((m) => current(m.id));
            const on = g.key === shown?.key;
            return (
              <button key={g.key} role="tab" aria-selected={on} onClick={() => setGroup(g.key)} className={`h-10 flex-1 rounded-[9px] px-1 text-sm ${on ? 'bg-white font-semibold text-primary-dark shadow-sm' : 'text-ink-2'}`}>
                {g.title.split(' · ').slice(1).join(' · ') || g.title}
                {complete ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      )}

      {shown && (
        <div key={shown.key} className="flex flex-col gap-3.5">
          {groups.length === 1 && <h2 className="text-sm font-semibold text-muted">{shown.title}</h2>}
          {shown.meters.map((m) => (
            <ReadingInput key={m.id} meter={m} period={period} current={current(m.id)} previous={previous(m.id)} onSave={(v, d) => save(m, v, d)} />
          ))}
        </div>
      )}
    </section>
  );
}
