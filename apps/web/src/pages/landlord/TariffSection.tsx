import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { FixedScope, KindLayout } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { parseAgorot, parseRate, rateToShekels } from '../../lib/money';
import { TARIFF_COLUMNS, layoutFromRow } from '../bills/useBilling';
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
  electricity_layout: KindLayout['mode'];
  electricity_difference: KindLayout['difference'];
  electricity_split: KindLayout['split'];
  water_layout: KindLayout['mode'];
  water_difference: KindLayout['difference'];
  water_split: KindLayout['split'];
}

type Layouts = { electricity: KindLayout; water: KindLayout };
const MODES: KindLayout['mode'][] = ['main_sub', 'separate', 'shared', 'direct'];

const SCOPES: FixedScope[] = ['units', 'all', 'landlord'];

// Rates of one property, entered in shekels. The tariff in force when a month is approved is frozen with that month.
export default function TariffSection({ orgId, propertyId }: { orgId: string; propertyId: string }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ rate: '', fixed: '', a: '', b: '', waterFixed: '', sewage: '' });
  const [elecScope, setElecScope] = useState<FixedScope>('units');
  const [waterScope, setWaterScope] = useState<FixedScope>('units');
  const [taxEvery, setTaxEvery] = useState<1 | 2>(1);
  const [taxAnchor, setTaxAnchor] = useState(''); // YYYY-MM
  const [layout, setLayout] = useState<Layouts>({ electricity: { mode: 'main_sub', difference: 'landlord', split: 'heads' }, water: { mode: 'main_sub', difference: 'landlord', split: 'heads' } });
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
        setLayout(layoutFromRow(r));
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
      electricity_layout: layout.electricity.mode,
      electricity_difference: layout.electricity.difference,
      electricity_split: layout.electricity.split,
      water_layout: layout.water.mode,
      water_difference: layout.water.difference,
      water_split: layout.water.split,
      property_tax_every: taxEvery,
      property_tax_anchor: taxEvery === 2 ? `${taxAnchor}-01` : null,
      updated_at: new Date().toISOString(),
    });
    setError(error?.message ?? '');
    setState(error ? 'failed' : 'saved');
  };

  const field = (k: keyof typeof f, label: string) => (
    <label className="flex flex-col gap-1 text-sm text-ink-2">
      {label}
      <input type="text" inputMode="decimal" dir="ltr" value={f[k]} onChange={set(k)} placeholder="0.00" className={input} />
    </label>
  );
  const scopeSelect = (label: string, value: FixedScope, onChange: (s: FixedScope) => void) => (
    <label className="flex flex-col gap-1 text-sm text-ink-2">
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

  // how one kind of meter is connected; the extra choice depends on the layout
  const layoutBlock = (kind: 'electricity' | 'water') => {
    const l = layout[kind];
    const change = (patch: Partial<KindLayout>) => {
      setLayout({ ...layout, [kind]: { ...l, ...patch } });
      touch();
    };
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3">
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          {t(`layout.${kind}`)}
          <select value={l.mode} onChange={(e) => change({ mode: e.target.value as KindLayout['mode'] })} className={input}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(`layout.mode.${m}`)}
              </option>
            ))}
          </select>
        </label>
        {l.mode === 'main_sub' && (
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            {t('layout.differenceLabel')}
            <select value={l.difference} onChange={(e) => change({ difference: e.target.value as KindLayout['difference'] })} className={input}>
              <option value="landlord">{t('layout.difference.landlord')}</option>
              <option value="units">{t('layout.difference.units')}</option>
            </select>
          </label>
        )}
        {l.mode === 'shared' && (
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            {t('layout.splitLabel')}
            <select value={l.split} onChange={(e) => change({ split: e.target.value as KindLayout['split'] })} className={input}>
              <option value="heads">{t('layout.split.heads')}</option>
              <option value="percent">{t('layout.split.percent')}</option>
            </select>
          </label>
        )}
        <p className="text-xs text-muted">{t(`layout.hint.${l.mode}`)}</p>
      </div>
    );
  };

  // render only after the saved values arrived, so typing is never overwritten by a late response
  if (!loaded) return null;

  return (
    <form onSubmit={save} className={card}>
      <h2 className="text-xl font-semibold text-ink-2">{t('layout.title')}</h2>
      {layoutBlock('electricity')}
      {layoutBlock('water')}
      <h2 className="text-xl font-semibold text-ink-2">{t('tariff.title')}</h2>
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
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          {t('tariff.propertyTaxEvery')}
          <select value={taxEvery} onChange={(e) => { setTaxEvery(e.target.value === '2' ? 2 : 1); touch(); }} className={input}>
            <option value={1}>{t('tariff.monthly')}</option>
            <option value={2}>{t('tariff.bimonthly')}</option>
          </select>
        </label>
        {taxEvery === 2 && (
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            {t('tariff.propertyTaxAnchor')}
            <input type="month" dir="ltr" value={taxAnchor} onChange={(e) => { setTaxAnchor(e.target.value); touch(); }} className={input} />
          </label>
        )}
      </div>
      <p className="text-xs text-muted">{t('tariff.hint')}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {state === 'saved' && <p className="text-sm text-ok">✓ {t('tariff.saved')}</p>}
      <button disabled={!valid} className={`${primary} self-start disabled:opacity-50`}>
        {t('common.save')}
      </button>
    </form>
  );
}
