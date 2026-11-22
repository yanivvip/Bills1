import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { parseAgorot } from '../../lib/money';

// The month's fixed charges (the electricity and water standing charge), next to the readings as in the design.
// They are the property tariff's amounts: change them here when the bill changed and they hold for the coming months too.
export default function FixedChargesCard({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState<{ electricity: string; water: string } | null>(null);
  const [saved, setSaved] = useState<{ electricity: number; water: number } | null>(null);
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    setText(null);
    void supabase
      .from('tariffs')
      .select('electricity_fixed,water_fixed')
      .eq('property_id', propertyId)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as { electricity_fixed: number; water_fixed: number } | null;
        if (!r) return;
        setSaved({ electricity: Number(r.electricity_fixed), water: Number(r.water_fixed) });
        setText({ electricity: String(Number(r.electricity_fixed) / 100), water: String(Number(r.water_fixed) / 100) });
      });
  }, [propertyId]);

  if (!text || !saved) return null;
  const e = parseAgorot(text.electricity);
  const w = parseAgorot(text.water);
  const valid = e !== null && e >= 0 && w !== null && w >= 0;
  const dirty = valid && (e !== saved.electricity || w !== saved.water);

  const save = async () => {
    if (!valid) return;
    const { error } = await supabase.from('tariffs').update({ electricity_fixed: e, water_fixed: w, updated_at: new Date().toISOString() }).eq('property_id', propertyId);
    setState(error ? 'failed' : 'saved');
    if (!error) setSaved({ electricity: e, water: w });
  };

  const box = (kind: 'electricity' | 'water') => (
    <label key={kind} className="block text-[13px] text-muted">
      {t(`meters.${kind}`)}
      <input
        type="text"
        inputMode="decimal"
        dir="ltr"
        value={text[kind]}
        onChange={(ev) => {
          setText({ ...text, [kind]: ev.target.value });
          setState('idle');
        }}
        aria-label={`${t('readings.fixedTitle')} – ${t(`meters.${kind}`)}`}
        className="mt-1.5 h-[52px] w-full rounded-xl border border-line-strong bg-white px-3.5 text-xl font-medium text-ink outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );

  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-4">
      <h2 className="text-[17px] font-semibold">{t('readings.fixedTitle')}</h2>
      <div className="grid grid-cols-2 gap-3">
        {box('electricity')}
        {box('water')}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{t('readings.fixedHint')}</p>
      {dirty && (
        <button type="button" onClick={() => void save()} className="h-11 self-start rounded-xl bg-primary px-6 font-semibold text-white">
          {t('common.save')}
        </button>
      )}
      {state === 'saved' && <p className="text-xs text-ok">✓ {t('readings.fixedSaved')}</p>}
      {state === 'failed' && <p className="text-xs text-danger">{t('readings.failed')}</p>}
    </section>
  );
}
