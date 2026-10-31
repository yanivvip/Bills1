import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { card, input, primary } from './shared';

interface Meter {
  id: string;
  kind: 'electricity' | 'water';
  name: string;
  unit_id: string | null;
}

// All meters of a property: main (building) meters and the sub-meter of each unit. Meters are managed only here.
export default function MetersSection({ orgId, propertyId, units }: { orgId: string; propertyId: string; units: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const [meters, setMeters] = useState<Meter[] | null>(null);
  const [kind, setKind] = useState<Meter['kind']>('electricity');
  const [where, setWhere] = useState(''); // '' = the whole property, else a unit id
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await supabase.from('meters').select('id,kind,name,unit_id').eq('property_id', propertyId).order('created_at');
    setMeters((data as Meter[]) ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('meters').insert({
      org_id: orgId,
      property_id: propertyId,
      unit_id: where || null,
      kind,
      name: name.trim() || t(`meters.default.${kind}`),
    });
    setError(error?.message ?? '');
    if (!error) {
      setName('');
      await load();
    }
  };

  const remove = async (m: Meter) => {
    if (!window.confirm(t('meters.confirmRemove', { name: m.name }))) return;
    const { error } = await supabase.from('meters').delete().eq('id', m.id);
    setError(error ? t('meters.removeFailed') : '');
    if (!error) await load();
  };

  const unitName = (id: string | null) => (id ? units.find((u) => u.id === id)?.name ?? '' : t('meters.building'));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold text-slate-300">{t('meters.title')}</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {meters && meters.length === 0 && <p className="text-sm text-slate-400">{t('meters.none')}</p>}
      {meters?.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
          <span>
            {m.kind === 'electricity' ? '⚡' : '💧'} {m.name}
            <span className="ms-2 text-sm text-slate-400">· {unitName(m.unit_id)}</span>
          </span>
          <button className="text-sm text-red-400" onClick={() => void remove(m)}>
            {t('landlord.remove')}
          </button>
        </div>
      ))}
      <form onSubmit={add} className={`${card} flex-row flex-wrap items-center`}>
        <select aria-label={t('meters.title')} value={where} onChange={(e) => setWhere(e.target.value)} className={input}>
          <option value="">{t('meters.building')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as Meter['kind'])} className={input}>
          <option value="electricity">{t('meters.electricity')}</option>
          <option value="water">{t('meters.water')}</option>
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('meters.namePlaceholder')} className={`${input} min-w-0 flex-1`} />
        <button className={primary}>{t('meters.add')}</button>
      </form>
    </div>
  );
}
