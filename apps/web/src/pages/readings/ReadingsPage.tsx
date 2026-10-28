import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { monthStart } from '../../lib/period';
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
  const { meters, error, save, current, previous } = useMonthlyReadings(period);

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

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('readings.title')}</h1>
      <MonthNav period={period} onChange={setPeriod} />
      {meters.length > 0 && (
        <p className={`text-sm ${done === meters.length ? 'text-emerald-400' : 'text-amber-400'}`}>
          {t('readings.progress', { done, total: meters.length })}
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {meters.length === 0 && (
        <p className="text-slate-400">
          {t('readings.noMeters')} <Link to="/" className="underline">{t('nav.home')}</Link>
        </p>
      )}

      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{g.title}</h2>
          {g.meters.map((m) => (
            <ReadingInput key={m.id} meter={m} period={period} current={current(m.id)} previous={previous(m.id)} onSave={(v) => save(m, v)} />
          ))}
        </div>
      ))}
    </section>
  );
}
