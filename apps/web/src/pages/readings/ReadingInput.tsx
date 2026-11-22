import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BoltIcon, DropIcon } from '../../components/NavIcons';
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

  const isWater = meter.kind === 'water';
  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5">
          <span className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] ${isWater ? 'bg-info-soft text-info' : 'bg-warn-soft text-warn'}`}>{isWater ? <DropIcon /> : <BoltIcon />}</span>
          <strong className="text-[17px] font-semibold">{meter.name}</strong>
        </span>
        {current ? (
          <span className="inline-flex h-[26px] items-center rounded-full bg-primary-soft px-2.5 text-[13px] font-medium text-primary-dark">✓ {t('readings.submitted')}</span>
        ) : (
          <span className="inline-flex h-[26px] items-center rounded-full bg-warn-soft px-2.5 text-[13px] font-medium text-warn">{t('readings.missing')}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 text-[13px] text-muted">{previous ? t('readings.last') : t('readings.noPrevious')}</div>
          <div dir="ltr" className="flex h-[52px] items-center rounded-xl bg-page px-3.5 text-xl text-ink-2">
            {previous ? previous.value : '—'}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-muted">{t('readings.value')} ({unitOf(meter.kind)})</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            dir="ltr"
            value={text}
            disabled={locked}
            onChange={(e) => {
              setText(e.target.value);
              setState('idle');
            }}
            placeholder={`${t('readings.value')} (${unitOf(meter.kind)})`}
            aria-label={`${t('readings.value')} (${unitOf(meter.kind)})`}
            className="h-[52px] w-full rounded-xl border border-line-strong bg-white px-3.5 text-xl font-medium outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
        </label>
      </div>
      {used !== null && (
        <div className="flex items-center justify-between rounded-[10px] bg-[#f1f8f6] px-3 py-2.5 text-[15px]">
          <span className="text-muted">{t('readings.used')}</span>
          <span dir="ltr" className="font-medium">
            {Math.round(used * 1000) / 1000} {unitOf(meter.kind)}
          </span>
        </div>
      )}
      <div className="flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-[13px] text-muted">
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
            className="h-11 rounded-xl border border-line-strong bg-white px-3 text-[15px] text-ink outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
        </label>
        <button disabled={!valid || !validDate || !dirty || state === 'saving' || locked} className="h-11 rounded-xl bg-primary px-6 font-semibold text-white disabled:opacity-50">
          {state === 'saving' ? '…' : t('common.save')}
        </button>
      </div>
      {lower && <p className="text-xs text-warn">{t('readings.lowerWarning')}</p>}
      {state === 'saved' && (
        <p className="text-xs text-ok">
          ✓ {t('readings.saved', { month: monthLabel(period, i18n.language) })}
        </p>
      )}
      {state === 'failed' && <p className="text-xs text-danger">{t('readings.failed')}</p>}
      {locked && <p className="text-xs text-muted">{t('readings.locked')}</p>}
    </form>
  );
}
