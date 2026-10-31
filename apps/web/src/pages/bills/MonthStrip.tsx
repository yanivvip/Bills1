import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

type State = 'none' | 'open' | 'partial' | 'paid';
const SYMBOL: Record<State, string> = { none: '—', open: '●', partial: '½', paid: '✓' };
const COLOR: Record<State, string> = { none: 'bg-white/5 text-slate-400', open: 'bg-amber-700', partial: 'bg-sky-700', paid: 'bg-emerald-700' };

// Twelve months of the selected year with a text symbol (not only a colour) for each month's payment state.
export default function MonthStrip({ propertyId, period, onChange, version }: { propertyId: string; period: string; onChange: (p: string) => void; version: unknown }) {
  const { t, i18n } = useTranslation();
  const year = Number(period.slice(0, 4));
  const [states, setStates] = useState<State[]>(Array<State>(12).fill('none'));

  useEffect(() => {
    void supabase
      .from('statements')
      .select('period,paid_on,units!inner(property_id)')
      .eq('units.property_id', propertyId)
      .gte('period', `${year}-01-01`)
      .lte('period', `${year}-12-01`)
      .then(({ data }) => {
        const next = Array<State>(12).fill('none');
        const rows = (data ?? []) as { period: string; paid_on: string | null }[];
        for (let m = 0; m < 12; m++) {
          const of = rows.filter((r) => Number(r.period.slice(5, 7)) - 1 === m);
          if (of.length === 0) continue;
          const paid = of.filter((r) => r.paid_on).length;
          next[m] = paid === of.length ? 'paid' : paid === 0 ? 'open' : 'partial';
        }
        setStates(next);
      });
  }, [propertyId, year, version]);

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-6 gap-1 text-center text-xs">
        {states.map((s, m) => {
          const p = `${year}-${String(m + 1).padStart(2, '0')}-01`;
          const selected = p === period;
          return (
            <button key={p} onClick={() => onChange(p)} aria-current={selected ? 'date' : undefined} className={`rounded-lg px-1 py-1.5 ${COLOR[s]} ${selected ? 'ring-2 ring-violet-400' : ''}`}>
              <div>{new Date(year, m, 1).toLocaleDateString(i18n.language, { month: 'short' })}</div>
              <div className="font-bold">{SYMBOL[s]}</div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">{t('bills.legend')}</p>
    </div>
  );
}
