import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { FixedScope, KindLayout } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { parseAgorot, parseRate } from '../../lib/money';
import { today } from '../../lib/period';
import { BackLink, card, input, primary } from './shared';

interface UnitDraft {
  name: string;
  emails: string;
  start: string;
  end: string;
  rent: string;
  fee: string;
  tax: string;
  quota: string;
  occupants: string;
  open: { electricity: string; water: string };
}
const emptyUnit = (): UnitDraft => ({ name: '', emails: '', start: today(), end: '', rent: '', fee: '', tax: '', quota: '', occupants: '1', open: { electricity: '', water: '' } });
const KINDS = ['electricity', 'water'] as const;
const MODES: KindLayout['mode'][] = ['main_sub', 'separate', 'shared', 'direct'];
const SCOPES: FixedScope[] = ['units', 'all', 'landlord'];
const emailsOf = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
const num = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(',', '.')));

// Setting up a property in one scroll: the property, its units and renters, how the meters are connected, the
// tariffs and the property tax. Nothing is saved until the end, and then everything is created in one step.
export default function OnboardingPage({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [livesHere, setLivesHere] = useState(false);
  const [units, setUnits] = useState<UnitDraft[]>([emptyUnit()]);
  const [layout, setLayout] = useState<Record<(typeof KINDS)[number], KindLayout>>({
    electricity: { mode: 'main_sub', difference: 'landlord', split: 'heads' },
    water: { mode: 'main_sub', difference: 'landlord', split: 'heads' },
  });
  const [mainOpen, setMainOpen] = useState({ electricity: '', water: '' });
  const [t1, setT1] = useState({ rate: '', fixed: '', a: '', b: '', waterFixed: '', sewage: '' });
  const [scopes, setScopes] = useState<{ electricity: FixedScope; water: FixedScope }>({ electricity: 'units', water: 'units' });
  const [taxEvery, setTaxEvery] = useState<1 | 2>(1);
  const [taxAnchor, setTaxAnchor] = useState('');
  const [homeOccupants, setHomeOccupants] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setCount = (n: number) => setUnits((cur) => Array.from({ length: n }, (_, i) => cur[i] ?? emptyUnit()));
  const patchUnit = (i: number, patch: Partial<UnitDraft>) => setUnits((cur) => cur.map((u, k) => (k === i ? { ...u, ...patch } : u)));

  // what is still missing or wrong, in plain words
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push(t('onboarding.needName'));
    const names = units.map((u) => u.name.trim());
    if (names.some((n) => !n)) out.push(t('onboarding.needUnitNames'));
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) out.push(t('onboarding.uniqueUnitNames'));
    if (livesHere && names.some((n) => n.toLowerCase() === t('onboarding.mainHouse').toLowerCase())) out.push(t('onboarding.uniqueUnitNames'));
    for (const u of units) {
      if (emailsOf(u.emails).some((e) => !/^\S+@\S+\.\S+$/.test(e))) out.push(t('onboarding.badEmail', { unit: u.name || '?' }));
    }
    const money = [t1.fixed, t1.waterFixed, ...units.flatMap((u) => [u.fee, u.tax, u.rent])];
    if (money.some((v) => v.trim() !== '' && parseAgorot(v) === null)) out.push(t('onboarding.badNumber'));
    if ([t1.rate, t1.a, t1.b, t1.sewage].some((v) => v.trim() !== '' && parseRate(v) === null)) out.push(t('onboarding.badNumber'));
    if (taxEvery === 2 && !taxAnchor) out.push(t('onboarding.needTaxMonth'));
    return [...new Set(out)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, units, livesHere, t1, taxEvery, taxAnchor]);

  const finish = async () => {
    setBusy(true);
    setError('');
    const mainHouse = livesHere ? [{ name: t('onboarding.mainHouse'), is_residual: true, occupants: Math.max(0, Math.floor(num(homeOccupants))) }] : [];
    const offset = mainHouse.length;
    const unitRows = units.map((u) => {
      const list = emailsOf(u.emails);
      return {
        name: u.name.trim(),
        community_fee: parseAgorot(u.fee) ?? 0,
        property_tax: parseAgorot(u.tax) ?? 0,
        water_quota: num(u.quota),
        occupants: Math.max(0, Math.floor(num(u.occupants))),
        contract: list.length > 0 ? { start: u.start || today(), end: u.end || null, rent: u.rent.trim() ? parseAgorot(u.rent) : null, emails: list } : null,
      };
    });

    const meters: { kind: string; name: string; unit_index: number | null; opening: number | null }[] = [];
    for (const kind of KINDS) {
      const mode = layout[kind].mode;
      const label = t(`meters.default.${kind}`);
      if (mode === 'main_sub' || mode === 'shared') {
        meters.push({ kind, name: `${label} – ${t('meters.building')}`, unit_index: null, opening: mainOpen[kind].trim() ? num(mainOpen[kind]) : null });
      }
      if (mode === 'main_sub' || mode === 'separate' || mode === 'direct') {
        units.forEach((u, i) => meters.push({ kind, name: `${label} – ${u.name.trim()}`, unit_index: offset + i, opening: u.open[kind].trim() ? num(u.open[kind]) : null }));
      }
    }

    const setup = {
      property: { name: name.trim(), address: address.trim() },
      units: [...mainHouse, ...unitRows],
      meters,
      tariff: {
        electricity_rate: parseRate(t1.rate) ?? 0,
        electricity_fixed: parseAgorot(t1.fixed) ?? 0,
        electricity_fixed_scope: scopes.electricity,
        water_rate_a: parseRate(t1.a) ?? 0,
        water_rate_b: parseRate(t1.b) ?? 0,
        water_fixed: parseAgorot(t1.waterFixed) ?? 0,
        water_fixed_scope: scopes.water,
        sewage_rate: parseRate(t1.sewage) ?? 0,
        property_tax_every: taxEvery,
        property_tax_anchor: taxEvery === 2 ? `${taxAnchor}-01` : null,
        electricity_layout: layout.electricity.mode,
        electricity_difference: layout.electricity.difference,
        electricity_split: layout.electricity.split,
        water_layout: layout.water.mode,
        water_difference: layout.water.difference,
        water_split: layout.water.split,
      },
    };
    const { data, error: err } = await supabase.rpc('setup_property', { p_org: orgId, p_setup: setup });
    setBusy(false);
    if (err) {
      setError(err.message.includes('landlord_cannot_be_renter') ? t('landlord.landlordCannotBeRenter') : err.message.includes('duplicate') ? t('onboarding.uniqueUnitNames') : err.message);
      return;
    }
    navigate(`/properties/${data as string}`);
  };

  const section = (n: number, title: string, children: ReactNode) => (
    <div className={card}>
      <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-300">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-700 text-sm text-white">{n}</span>
        {title}
      </h2>
      {children}
    </div>
  );
  const field = (label: string, value: string, onChange: (v: string) => void, opts: { placeholder?: string; type?: string; numeric?: boolean } = {}) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      {label}
      <input type={opts.type ?? 'text'} inputMode={opts.numeric ? 'decimal' : undefined} dir={opts.numeric ? 'ltr' : undefined} value={value} placeholder={opts.placeholder} onChange={(e) => onChange(e.target.value)} className={input} />
    </label>
  );
  const select = <V extends string>(label: string, value: V, options: { v: V; text: string }[], onChange: (v: V) => void) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as V)} className={input}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );

  const usesMain = (k: (typeof KINDS)[number]) => layout[k].mode === 'main_sub' || layout[k].mode === 'shared';
  const usesUnitMeters = (k: (typeof KINDS)[number]) => layout[k].mode !== 'shared';
  const setKind = (k: (typeof KINDS)[number], patch: Partial<KindLayout>) => setLayout((cur) => ({ ...cur, [k]: { ...cur[k], ...patch } }));

  return (
    <section className="flex flex-col gap-4 p-4">
      <BackLink to="/property">{t('landlord.properties')}</BackLink>
      <div>
        <h1 className="text-2xl font-bold">{t('onboarding.title')}</h1>
        <p className="text-sm text-slate-400">{t('onboarding.intro')}</p>
      </div>

      {section(1, t('onboarding.property'), (
        <>
          {field(t('onboarding.propertyName'), name, setName)}
          {field(t('landlord.address'), address, setAddress)}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={livesHere} onChange={(e) => setLivesHere(e.target.checked)} />
            {t('onboarding.livesHere')}
          </label>
          {livesHere && field(t('onboarding.homeOccupants'), homeOccupants, setHomeOccupants, { numeric: true })}
          <div className="flex items-center gap-3 text-sm">
            <span>{t('onboarding.unitCount')}</span>
            <button type="button" aria-label="−" className="h-9 w-9 rounded-lg bg-white/10 text-lg" onClick={() => setCount(Math.max(1, units.length - 1))}>
              −
            </button>
            <strong dir="ltr" aria-live="polite">{units.length}</strong>
            <button type="button" aria-label="+" className="h-9 w-9 rounded-lg bg-white/10 text-lg" onClick={() => setCount(Math.min(20, units.length + 1))}>
              +
            </button>
          </div>
        </>
      ))}

      {section(2, t('onboarding.unitsAndRenters'), (
        <div className="flex flex-col gap-4">
          {units.map((u, i) => (
            <fieldset key={i} className="flex flex-col gap-2 rounded-xl bg-white/5 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-300">{t('onboarding.unitN', { n: i + 1 })}</legend>
              {field(t('onboarding.unitName'), u.name, (v) => patchUnit(i, { name: v }))}
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                {t('landlord.renterEmails')}
                <textarea rows={2} value={u.emails} onChange={(e) => patchUnit(i, { emails: e.target.value })} className={input} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {field(t('onboarding.contractStart'), u.start, (v) => patchUnit(i, { start: v }), { type: 'date' })}
                {field(t('onboarding.contractEnd'), u.end, (v) => patchUnit(i, { end: v }), { type: 'date' })}
                {field(t('landlord.rent'), u.rent, (v) => patchUnit(i, { rent: v }), { numeric: true })}
                {field(t('unitBilling.occupants'), u.occupants, (v) => patchUnit(i, { occupants: v }), { numeric: true })}
              </div>
            </fieldset>
          ))}
        </div>
      ))}

      {section(3, t('onboarding.meters'), (
        <>
          {KINDS.map((k) => (
            <div key={k} className="flex flex-col gap-2 rounded-xl bg-white/5 p-3">
              {select(t(`layout.${k}`), layout[k].mode, MODES.map((m) => ({ v: m, text: t(`layout.mode.${m}`) })), (v) => setKind(k, { mode: v }))}
              {layout[k].mode === 'main_sub' &&
                select(t('layout.differenceLabel'), layout[k].difference, [{ v: 'landlord', text: t('layout.difference.landlord') }, { v: 'units', text: t('layout.difference.units') }], (v) => setKind(k, { difference: v }))}
              {layout[k].mode === 'shared' &&
                select(t('layout.splitLabel'), layout[k].split, [{ v: 'heads', text: t('layout.split.heads') }, { v: 'percent', text: t('layout.split.percent') }], (v) => setKind(k, { split: v }))}
              <p className="text-xs text-slate-400">{t(`layout.hint.${layout[k].mode}`)}</p>
              {usesMain(k) && field(`${t('onboarding.openingMain')} (${t(`meters.${k}`)})`, mainOpen[k], (v) => setMainOpen({ ...mainOpen, [k]: v }), { numeric: true })}
              {usesUnitMeters(k) &&
                units.map((u, i) => (
                  <div key={i}>{field(`${t('onboarding.opening')} – ${u.name || t('onboarding.unitN', { n: i + 1 })} (${t(`meters.${k}`)})`, u.open[k], (v) => patchUnit(i, { open: { ...u.open, [k]: v } }), { numeric: true })}</div>
                ))}
            </div>
          ))}
          <p className="text-xs text-slate-400">{t('onboarding.openingHint')}</p>
        </>
      ))}

      {section(4, t('tariff.title'), (
        <>
          <div className="grid grid-cols-2 gap-2">
            {field(t('tariff.electricityRate'), t1.rate, (v) => setT1({ ...t1, rate: v }), { numeric: true, placeholder: '0.00' })}
            {field(t('tariff.electricityFixed'), t1.fixed, (v) => setT1({ ...t1, fixed: v }), { numeric: true, placeholder: '0.00' })}
            {select(t('tariff.electricityFixedScope'), scopes.electricity, SCOPES.map((s) => ({ v: s, text: t(`tariff.scope.${s}`) })), (v) => setScopes({ ...scopes, electricity: v }))}
            <span />
            {field(t('tariff.waterA'), t1.a, (v) => setT1({ ...t1, a: v }), { numeric: true, placeholder: '0.00' })}
            {field(t('tariff.waterB'), t1.b, (v) => setT1({ ...t1, b: v }), { numeric: true, placeholder: '0.00' })}
            {field(t('tariff.waterFixed'), t1.waterFixed, (v) => setT1({ ...t1, waterFixed: v }), { numeric: true, placeholder: '0.00' })}
            {select(t('tariff.waterFixedScope'), scopes.water, SCOPES.map((s) => ({ v: s, text: t(`tariff.scope.${s}`) })), (v) => setScopes({ ...scopes, water: v }))}
            {field(t('tariff.sewageRate'), t1.sewage, (v) => setT1({ ...t1, sewage: v }), { numeric: true, placeholder: '0.00' })}
          </div>
          <div className="flex flex-col gap-2">
            {units.map((u, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem] items-end gap-2">
                <span className="text-sm text-slate-300">{u.name || t('onboarding.unitN', { n: i + 1 })}</span>
                {field(t('unitBilling.waterQuota'), u.quota, (v) => patchUnit(i, { quota: v }), { numeric: true })}
              </div>
            ))}
          </div>
        </>
      ))}

      {section(5, t('onboarding.taxAndCharges'), (
        <>
          <div className="grid grid-cols-2 gap-2">
            {select(t('tariff.propertyTaxEvery'), String(taxEvery) as '1' | '2', [{ v: '1', text: t('tariff.monthly') }, { v: '2', text: t('tariff.bimonthly') }], (v) => setTaxEvery(v === '2' ? 2 : 1))}
            {taxEvery === 2 && field(t('tariff.propertyTaxAnchor'), taxAnchor, setTaxAnchor, { type: 'month' })}
          </div>
          {units.map((u, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              {field(`${t('unitBilling.propertyTax')} – ${u.name || t('onboarding.unitN', { n: i + 1 })}`, u.tax, (v) => patchUnit(i, { tax: v }), { numeric: true })}
              {field(`${t('unitBilling.communityFee')} – ${u.name || t('onboarding.unitN', { n: i + 1 })}`, u.fee, (v) => patchUnit(i, { fee: v }), { numeric: true })}
            </div>
          ))}
          <p className="text-xs text-slate-400">{t('onboarding.chargesHint')}</p>
        </>
      ))}

      {section(6, t('onboarding.summary'), (
        <>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              {t('onboarding.property')}: <strong>{name || '—'}</strong>
            </li>
            <li>
              {t('landlord.unitsCount', { count: units.length })}
              {livesHere ? ` + ${t('onboarding.mainHouse')}` : ''}
            </li>
            {KINDS.map((k) => (
              <li key={k}>
                {t(`meters.${k}`)}: {t(`layout.mode.${layout[k].mode}`)}
              </li>
            ))}
          </ul>
          {problems.length > 0 && (
            <ul className="list-disc rounded-xl bg-amber-900/30 p-3 ps-8 text-sm text-amber-200">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={busy || problems.length > 0} onClick={() => void finish()} className={`${primary} disabled:opacity-50`}>
            {t('onboarding.finish')}
          </button>
          <p className="text-xs text-slate-400">{t('onboarding.finishHint')}</p>
        </>
      ))}
    </section>
  );
}
