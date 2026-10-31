import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { parseAgorot, parseRate, rateToShekels } from '../../lib/money';
import { card, input, primary } from './shared';

interface Row {
  electricity_rate: number;
  electricity_fixed: number;
  water_rate_a: number;
  water_rate_b: number;
}

// Rates of one property, entered in shekels. The tariff in force when a month is approved is frozen with that month.
export default function TariffSection({ orgId, propertyId }: { orgId: string; propertyId: string }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ rate: '', fixed: '', a: '', b: '' });
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase
      .from('tariffs')
      .select('electricity_rate,electricity_fixed,water_rate_a,water_rate_b')
      .eq('property_id', propertyId)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as Row | null;
        if (r) setF({ rate: rateToShekels(Number(r.electricity_rate)), fixed: String(Number(r.electricity_fixed) / 100), a: rateToShekels(Number(r.water_rate_a)), b: rateToShekels(Number(r.water_rate_b)) });
      });
  }, [propertyId]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setState('idle');
  };
  const rate = parseRate(f.rate);
  const fixed = f.fixed.trim() === '' ? 0 : parseAgorot(f.fixed);
  const a = parseRate(f.a);
  const b = parseRate(f.b);
  const valid = rate !== null && fixed !== null && fixed >= 0 && a !== null && b !== null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const { error } = await supabase
      .from('tariffs')
      .upsert({ property_id: propertyId, org_id: orgId, electricity_rate: rate, electricity_fixed: fixed, water_rate_a: a, water_rate_b: b, updated_at: new Date().toISOString() });
    setError(error?.message ?? '');
    setState(error ? 'failed' : 'saved');
  };

  const field = (k: keyof typeof f, label: string) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      {label}
      <input type="text" inputMode="decimal" dir="ltr" value={f[k]} onChange={set(k)} placeholder="0.00" className={input} />
    </label>
  );

  return (
    <form onSubmit={save} className={card}>
      <h2 className="text-xl font-semibold text-slate-300">{t('tariff.title')}</h2>
      <div className="grid grid-cols-2 gap-3">
        {field('rate', t('tariff.electricityRate'))}
        {field('fixed', t('tariff.electricityFixed'))}
        {field('a', t('tariff.waterA'))}
        {field('b', t('tariff.waterB'))}
      </div>
      <p className="text-xs text-slate-400">{t('tariff.hint')}</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {state === 'saved' && <p className="text-sm text-emerald-400">✓ {t('tariff.saved')}</p>}
      <button disabled={!valid} className={`${primary} self-start disabled:opacity-50`}>
        {t('common.save')}
      </button>
    </form>
  );
}
