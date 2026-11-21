import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { FixedScope } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { parseAgorot, parseRate, rateToShekels } from '../../lib/money';
import { TARIFF_COLUMNS } from '../bills/useBilling';
import { card, input, primary } from './shared';

interface Row {
  electricity_rate: number;
  electricity_fixed: number;
  water_rate_a: number;
  water_rate_b: number;
  water_fixed: number;
  electricity_fixed_scope: FixedScope;
  water_fixed_scope: FixedScope;
  sewage_rate: number;
  property_tax_every: 1 | 2;
  property_tax_anchor: string | null;
}

const SCOPES: FixedScope[] = ['units', 'all', 'landlord'];

// Rates of one property, entered in shekels. The tariff in force when a month is approved is frozen with that month.
export default function TariffSection({ orgId, propertyId }: { orgId: string; propertyId: string }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ rate: '', fixed: '', a: '', b: '', waterFixed: '', sewage: '' });
  const [elecScope, setElecScope] = useState<FixedScope>('units');
  const [waterScope, setWaterScope] = useState<FixedScope>('units');
  const [taxEvery, setTaxEvery] = useState<1 | 2>(1);
  const [taxAnchor, setTaxAnchor] = useState(''); // YYYY-MM
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase
      .from('tariffs')
      .select(TARIFF_COLUMNS)
      .eq('property_id', propertyId)
      .maybeSingle()
      .then(({ data }) => {
        setLoaded(true);
        const r = data as Row | null;
        if (!r) return;
        setF({
          rate: rateToShekels(Number(r.electricity_rate)),
          fixed: String(Number(r.electricity_fixed) / 100),
          a: rateToShekels(Number(r.water_rate_a)),
          b: rateToShekels(Number(r.water_rate_b)),
          waterFixed: String(Number(r.water_fixed) / 100),
          sewage: rateToShekels(Number(r.sewage_rate)),
        });
        setElecScope(r.electricity_fixed_scope);
        setWaterScope(r.water_fixed_scope);
        setTaxEvery(Number(r.property_tax_every) === 2 ? 2 : 1);
        setTaxAnchor(r.property_tax_anchor?.slice(0, 7) ?? '');
      });
  }, [propertyId]);

  const touch = () => setState('idle');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    touch();
  };
  const rate = parseRate(f.rate);
  const fixed = f.fixed.trim() === '' ? 0 : parseAgorot(f.fixed);
  const a = parseRate(f.a);
  const b = parseRate(f.b);
  const waterFixed = f.waterFixed.trim() === '' ? 0 : parseAgorot(f.waterFixed);
  const sewage = f.sewage.trim() === '' ? 0 : parseRate(f.sewage);
  const valid =
    rate !== null && fixed !== null && fixed >= 0 && a !== null && b !== null && waterFixed !== null && waterFixed >= 0 && sewage !== null && (taxEvery === 1 || taxAnchor !== '');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const { error } = await supabase.from('tariffs').upsert({
      property_id: propertyId,
      org_id: orgId,
      electricity_rate: rate,
      electricity_fixed: fixed,
      electricity_fixed_scope: elecScope,
      water_rate_a: a,
      water_rate_b: b,
      water_fixed: waterFixed,
      water_fixed_scope: waterScope,
      sewage_rate: sewage,
      property_tax_every: taxEvery,
      property_tax_anchor: taxEvery === 2 ? `${taxAnchor}-01` : null,
      updated_at: new Date().toISOString(),
    });
    setError(error?.message ?? '');
    setState(error ? 'failed' : 'saved');
  };

  const field = (k: keyof typeof f, label: string) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      {label}
      <input type="text" inputMode="decimal" dir="ltr" value={f[k]} onChange={set(k)} placeholder="0.00" className={input} />
    </label>
  );
  const scopeSelect = (label: string, value: FixedScope, onChange: (s: FixedScope) => void) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      {label}
      <select value={value} onChange={(e) => { onChange(e.target.value as FixedScope); touch(); }} className={input}>
        {SCOPES.map((s) => (
          <option key={s} value={s}>
            {t(`tariff.scope.${s}`)}
          </option>
        ))}
      </select>
    </label>
  );

  // render only after the saved values arrived, so typing is never overwritten by a late response
  if (!loaded) return null;

  return (
    <form onSubmit={save} className={card}>
      <h2 className="text-xl font-semibold text-slate-300">{t('tariff.title')}</h2>
      <div className="grid grid-cols-2 gap-3">
        {field('rate', t('tariff.electricityRate'))}
        {field('fixed', t('tariff.electricityFixed'))}
        {scopeSelect(t('tariff.electricityFixedScope'), elecScope, setElecScope)}
        <span />
        {field('a', t('tariff.waterA'))}
        {field('b', t('tariff.waterB'))}
        {field('waterFixed', t('tariff.waterFixed'))}
        {scopeSelect(t('tariff.waterFixedScope'), waterScope, setWaterScope)}
        {field('sewage', t('tariff.sewageRate'))}
        <span />
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          {t('tariff.propertyTaxEvery')}
          <select value={taxEvery} onChange={(e) => { setTaxEvery(e.target.value === '2' ? 2 : 1); touch(); }} className={input}>
            <option value={1}>{t('tariff.monthly')}</option>
            <option value={2}>{t('tariff.bimonthly')}</option>
          </select>
        </label>
        {taxEvery === 2 && (
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            {t('tariff.propertyTaxAnchor')}
            <input type="month" dir="ltr" value={taxAnchor} onChange={(e) => { setTaxAnchor(e.target.value); touch(); }} className={input} />
          </label>
        )}
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
