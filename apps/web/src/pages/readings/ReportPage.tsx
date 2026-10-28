import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { monthStart } from '../../lib/period';
import MonthNav from './MonthNav';
import ReadingInput from './ReadingInput';
import { useMonthlyReadings } from './useMonthlyReadings';

// Renter: report this month's readings for the meters of the unit they rent (RLS limits the list).
export default function ReportPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(monthStart());
  const { meters, error, save, current, previous } = useMonthlyReadings(period);

  if (!meters) return <p className="p-4">{t('common.loading')}</p>;

  const unit = meters[0]?.units?.name;
  const property = meters[0]?.properties?.name;

  return (
    <section className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">{t('readings.report')}</h1>
        {property && <p className="text-slate-400">{property} · {unit}</p>}
      </div>
      <MonthNav period={period} onChange={setPeriod} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {meters.length === 0 && <p className="text-slate-400">{t('readings.renterNoMeters')}</p>}
      {meters.map((m) => (
        <ReadingInput key={m.id} meter={m} period={period} current={current(m.id)} previous={previous(m.id)} onSave={(v) => save(m, v)} />
      ))}
    </section>
  );
}
