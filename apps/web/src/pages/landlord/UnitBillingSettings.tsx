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
  const [residual, setResidual] = useState(false);
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase
      .from('units')
      .select('community_fee_agorot,water_quota,is_residual')
      .eq('id', unitId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setFee(String(Number(data.community_fee_agorot) / 100));
        setQuota(String(Number(data.water_quota)));
        setResidual(Boolean(data.is_residual));
      });
  }, [unitId]);

  const feeAgorot = fee.trim() === '' ? 0 : parseAgorot(fee);
  const quotaNum = quota.trim() === '' ? 0 : Number(quota.replace(',', '.'));
  const valid = feeAgorot !== null && feeAgorot >= 0 && Number.isFinite(quotaNum) && quotaNum >= 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const { error } = await supabase.from('units').update({ community_fee_agorot: feeAgorot, water_quota: quotaNum, is_residual: residual }).eq('id', unitId);
    setError(error?.message.includes('units_one_residual_per_property') ? t('unitBilling.oneResidual') : (error?.message ?? ''));
    setState(error ? 'failed' : 'saved');
  };
  const touch = () => setState('idle');

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
      </div>
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
