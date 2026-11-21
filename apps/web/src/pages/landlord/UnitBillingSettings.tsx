import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { parseAgorot } from '../../lib/money';
import { card, input, primary } from './shared';

// How this unit is billed: monthly community fee, water quota at the lower rate, and whether it is billed by subtraction.
export default function UnitBillingSettings({ unitId }: { unitId: string }) {
  const { t } = useTranslation();
  const [fee, setFee] = useState('');
  const [quota, setQuota] = useState('');
  const [tax, setTax] = useState('');
  const [occupants, setOccupants] = useState('1');
  const [percent, setPercent] = useState({ electricity: '', water: '' });
  // which of this unit's shared-meter weights the property layout uses
  const [needs, setNeeds] = useState({ heads: false, electricityPercent: false, waterPercent: false });
  const [residual, setResidual] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase
      .from('units')
      .select('property_id,community_fee_agorot,water_quota,is_residual,property_tax_agorot,occupants,electricity_percent,water_percent')
      .eq('id', unitId)
      .maybeSingle()
      .then(({ data }) => {
        setLoaded(true);
        if (!data) return;
        setFee(String(Number(data.community_fee_agorot) / 100));
        setQuota(String(Number(data.water_quota)));
        setTax(String(Number(data.property_tax_agorot) / 100));
        setOccupants(String(Number(data.occupants)));
        setPercent({ electricity: data.electricity_percent === null ? '' : String(Number(data.electricity_percent)), water: data.water_percent === null ? '' : String(Number(data.water_percent)) });
        void supabase
          .from('tariffs')
          .select('electricity_layout,electricity_split,water_layout,water_split')
          .eq('property_id', data.property_id)
          .maybeSingle()
          .then(({ data: l }) => {
            if (!l) return;
            const e = l.electricity_layout === 'shared';
            const w = l.water_layout === 'shared';
            setNeeds({ heads: (e && l.electricity_split === 'heads') || (w && l.water_split === 'heads'), electricityPercent: e && l.electricity_split === 'percent', waterPercent: w && l.water_split === 'percent' });
          });
        setResidual(Boolean(data.is_residual));
      });
  }, [unitId]);

  const feeAgorot = fee.trim() === '' ? 0 : parseAgorot(fee);
  const quotaNum = quota.trim() === '' ? 0 : Number(quota.replace(',', '.'));
  const taxAgorot = tax.trim() === '' ? 0 : parseAgorot(tax);
  const occupantsNum = Number(occupants);
  const pct = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const percentOk = (v: string) => pct(v) === null || (Number.isFinite(pct(v)) && (pct(v) as number) >= 0 && (pct(v) as number) <= 100);
  const valid = Number.isInteger(occupantsNum) && occupantsNum >= 0 && percentOk(percent.electricity) && percentOk(percent.water) && feeAgorot !== null && feeAgorot >= 0 && taxAgorot !== null && taxAgorot >= 0 && Number.isFinite(quotaNum) && quotaNum >= 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const { error } = await supabase.from('units').update({ community_fee_agorot: feeAgorot, water_quota: quotaNum, property_tax_agorot: taxAgorot, is_residual: residual, occupants: occupantsNum, electricity_percent: pct(percent.electricity), water_percent: pct(percent.water) }).eq('id', unitId);
    setError(error?.message.includes('units_one_residual_per_property') ? t('unitBilling.oneResidual') : (error?.message ?? ''));
    setState(error ? 'failed' : 'saved');
  };
  const touch = () => setState('idle');

  // render only after the saved values arrived, so typing is never overwritten by a late response
  if (!loaded) return null;

  return (
    <form onSubmit={save} className={card}>
      <h2 className="text-xl font-semibold text-slate-300">{t('unitBilling.title')}</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          {t('unitBilling.communityFee')}
          <input type="text" inputMode="decimal" dir="ltr" value={fee} onChange={(e) => { setFee(e.target.value); touch(); }} placeholder="0.00" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          {t('unitBilling.waterQuota')}
          <input type="text" inputMode="decimal" dir="ltr" value={quota} onChange={(e) => { setQuota(e.target.value); touch(); }} placeholder="0" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          {t('unitBilling.propertyTax')}
          <input type="text" inputMode="decimal" dir="ltr" value={tax} onChange={(e) => { setTax(e.target.value); touch(); }} placeholder="0.00" className={input} />
        </label>
      </div>
      {(needs.heads || needs.electricityPercent || needs.waterPercent) && (
        <div className="grid grid-cols-2 gap-3">
          {needs.heads && (
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {t('unitBilling.occupants')}
              <input type="text" inputMode="numeric" dir="ltr" value={occupants} onChange={(e) => { setOccupants(e.target.value); touch(); }} className={input} />
            </label>
          )}
          {needs.electricityPercent && (
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {t('unitBilling.electricityPercent')}
              <input type="text" inputMode="decimal" dir="ltr" value={percent.electricity} onChange={(e) => { setPercent({ ...percent, electricity: e.target.value }); touch(); }} className={input} />
            </label>
          )}
          {needs.waterPercent && (
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {t('unitBilling.waterPercent')}
              <input type="text" inputMode="decimal" dir="ltr" value={percent.water} onChange={(e) => { setPercent({ ...percent, water: e.target.value }); touch(); }} className={input} />
            </label>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={residual} onChange={(e) => { setResidual(e.target.checked); touch(); }} />
        {t('unitBilling.residual')}
      </label>
      <p className="text-xs text-slate-400">{t('unitBilling.residualHint')}</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {state === 'saved' && <p className="text-sm text-emerald-400">✓ {t('tariff.saved')}</p>}
      <button disabled={!valid} className={`${primary} self-start disabled:opacity-50`}>
        {t('common.save')}
      </button>
    </form>
  );
}
