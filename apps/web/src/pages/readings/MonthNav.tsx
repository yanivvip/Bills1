import { useTranslation } from 'react-i18next';
import { monthLabel, monthStart, shiftMonth } from '../../lib/period';

export default function MonthNav({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  const { i18n } = useTranslation();
  const isCurrent = period >= monthStart();
  const btn = 'rounded-lg bg-white/10 px-3 py-1.5';
  return (
    <div className="flex items-center justify-between gap-2">
      <button className={btn} onClick={() => onChange(shiftMonth(period, -1))} aria-label="previous month">
        <span className="inline-block rtl:rotate-180">←</span>
      </button>
      <strong className="text-lg">{monthLabel(period, i18n.language)}</strong>
      <button className={`${btn} disabled:opacity-40`} disabled={isCurrent} onClick={() => onChange(shiftMonth(period, 1))} aria-label="next month">
        <span className="inline-block rtl:rotate-180">→</span>
      </button>
    </div>
  );
}
