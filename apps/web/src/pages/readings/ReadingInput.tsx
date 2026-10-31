import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultReadDate, monthLabel, today } from '../../lib/period';
import type { MeterRow, ReadingRow } from './useMonthlyReadings';

const unitOf = (kind: MeterRow['kind']) => (kind === 'electricity' ? 'kWh' : 'm³');

// One meter for one month: enter/replace the cumulative reading, see last month and the consumption.
export default function ReadingInput({
  meter,
  current,
  previous,
  period,
  onSave,
}: {
  meter: MeterRow;
  current?: ReadingRow;
  previous?: ReadingRow;
  period: string;
  onSave: (value: number, readOn: string) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState(current ? String(current.value) : '');
  const [date, setDate] = useState(current?.read_on ?? defaultReadDate(period));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  // Follow the saved value when the month changes or data reloads.
  useEffect(() => {
    setText(current ? String(current.value) : '');
    setDate(current?.read_on ?? defaultReadDate(period));
    setState('idle');
  }, [current?.id, current?.value, current?.read_on, period]);

  const entered = text.trim() === '' ? null : Number(text);
  const valid = entered !== null && Number.isFinite(entered) && entered >= 0;
  const lower = valid && previous !== undefined && entered < previous.value;
  const used = current && previous ? current.value - previous.value : null;
  const locked = current?.status === 'approved';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today();
  const dirty = !current || (valid && (entered !== current.value || date !== current.read_on));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !validDate) return;
    setState('saving');
    setState((await onSave(entered, date)) ? 'saved' : 'failed');
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <strong>
          {meter.kind === 'electricity' ? '⚡' : '💧'} {meter.name}
        </strong>
        {current ? (
          <span className="text-xs text-emerald-400">✓ {t('readings.submitted')}</span>
        ) : (
          <span className="text-xs text-amber-400">{t('readings.missing')}</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={text}
          disabled={locked}
          onChange={(e) => {
            setText(e.target.value);
            setState('idle');
          }}
          placeholder={`${t('readings.value')} (${unitOf(meter.kind)})`}
          className="flex-1 rounded-lg bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
        />
        <button
          disabled={!valid || !validDate || !dirty || state === 'saving' || locked}
          className="rounded-lg bg-violet-600 px-4 py-2 font-semibold disabled:opacity-50"
        >
          {state === 'saving' ? '…' : t('common.save')}
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        {t('readings.date')}
        <input
          type="date"
          value={date}
          max={today()}
          disabled={locked}
          onChange={(e) => {
            setDate(e.target.value);
            setState('idle');
          }}
          className="rounded-lg bg-white/10 px-2 py-1 text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
        />
      </label>
      <div className="text-xs text-slate-400">
        {previous
          ? `${t('readings.last')}: ${previous.value} ${unitOf(meter.kind)}`
          : t('readings.noPrevious')}
        {used !== null && ` · ${t('readings.used')}: ${Math.round(used * 1000) / 1000} ${unitOf(meter.kind)}`}
      </div>
      {lower && <p className="text-xs text-amber-400">{t('readings.lowerWarning')}</p>}
      {state === 'saved' && (
        <p className="text-xs text-emerald-400">
          ✓ {t('readings.saved', { month: monthLabel(period, i18n.language) })}
        </p>
      )}
      {state === 'failed' && <p className="text-xs text-red-400">{t('readings.failed')}</p>}
      {locked && <p className="text-xs text-slate-400">{t('readings.locked')}</p>}
    </form>
  );
}
