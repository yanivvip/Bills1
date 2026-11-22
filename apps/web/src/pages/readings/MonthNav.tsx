import { useTranslation } from 'react-i18next';
import { monthLabel, monthStart, shiftMonth } from '../../lib/period';

// The month switcher of the design: a white box with the month in the middle and 44px arrow buttons on both sides.
export default function MonthNav({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  const { i18n } = useTranslation();
  const isCurrent = period >= monthStart();
  const btn = 'flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-2 disabled:opacity-40';
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-line bg-card p-1">
      <button className={btn} onClick={() => onChange(shiftMonth(period, -1))} aria-label="previous month">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="rtl:rotate-180">
          <path d="m15 6-6 6 6 6" />
        </svg>
      </button>
      <strong className="text-[17px] font-semibold">{monthLabel(period, i18n.language)}</strong>
      <button className={btn} disabled={isCurrent} onClick={() => onChange(shiftMonth(period, 1))} aria-label="next month">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="rtl:rotate-180">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
