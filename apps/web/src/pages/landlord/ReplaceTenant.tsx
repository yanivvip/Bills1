import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { parseAgorot } from '../../lib/money';
import { monthStart, today } from '../../lib/period';
import { card, input, primary } from './shared';

const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseEmails = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

interface Checks {
  closingReadings: boolean;
  monthApproved: boolean;
  unpaid: number;
}

// Replacing the tenant of a unit: a checklist of what should be finished for the outgoing tenant,
// then the handover date and the new renters. Ends the old contract and starts the new one in one step.
export default function ReplaceTenant({ unitId, propertyId, contractId, onDone }: { unitId: string; propertyId: string; contractId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [endDate, setEndDate] = useState(today());
  const [startDate, setStartDate] = useState(nextDay(today()));
  const [emails, setEmails] = useState('');
  const [rent, setRent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const period = monthStart();

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [m, r, b, s] = await Promise.all([
        supabase.from('meters').select('id').eq('unit_id', unitId),
        supabase.from('readings').select('meter_id').eq('period', period),
        supabase.from('billing_periods').select('id').eq('property_id', propertyId).eq('period', period).maybeSingle(),
        supabase.from('statements').select('id').eq('contract_id', contractId).is('paid_on', null),
      ]);
      const meters = (m.data ?? []) as { id: string }[];
      const reported = new Set(((r.data ?? []) as { meter_id: string }[]).map((x) => x.meter_id));
      setChecks({
        closingReadings: meters.every((x) => reported.has(x.id)),
        monthApproved: !!b.data,
        unpaid: (s.data ?? []).length,
      });
    })();
  }, [open, unitId, propertyId, contractId, period]);

  const list = parseEmails(emails);
  const rentAgorot = rent.trim() === '' ? null : parseAgorot(rent);
  const valid = list.length > 0 && startDate >= endDate && (rent.trim() === '' || rentAgorot !== null);
  const incomplete = !!checks && (!checks.closingReadings || !checks.monthApproved || checks.unpaid > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (!window.confirm(t(incomplete ? 'replace.confirmIncomplete' : 'replace.confirm'))) return;
    setBusy(true);
    const { error } = await supabase.rpc('replace_tenant', { p_unit: unitId, p_end_date: endDate, p_start_date: startDate, p_emails: list, p_rent: rentAgorot });
    setBusy(false);
    if (error) return setError(error.message.includes('landlord_cannot_be_renter') ? t('landlord.landlordCannotBeRenter') : error.message);
    setError('');
    setOpen(false);
    setEmails('');
    onDone();
  };

  if (!open) {
    return (
      <button className="self-start rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold" onClick={() => setOpen(true)}>
        {t('replace.button')}
      </button>
    );
  }

  const row = (ok: boolean, text: string, to?: string) => (
    <li className={ok ? 'text-emerald-400' : 'text-amber-400'}>
      {ok ? '✓' : '○'} {text}
      {!ok && to && (
        <>
          {' '}
          <Link to={to} className="underline">
            {t('replace.open')}
          </Link>
        </>
      )}
    </li>
  );

  return (
    <form onSubmit={submit} className={card}>
      <h2 className="text-xl font-semibold text-slate-300">{t('replace.title')}</h2>
      <p className="text-sm text-slate-400">{t('replace.intro')}</p>
      {checks && (
        <ul className="flex flex-col gap-1 text-sm">
          {row(checks.closingReadings, t('replace.closingReadings'), '/readings')}
          {row(checks.monthApproved, t('replace.monthApproved'), '/bills')}
          {row(checks.unpaid === 0, checks.unpaid === 0 ? t('replace.allPaid') : t('replace.unpaid', { count: checks.unpaid }), '/bills')}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          {t('replace.endDate')}
          <input type="date" required value={endDate} onChange={(e) => { setEndDate(e.target.value); if (startDate < e.target.value) setStartDate(nextDay(e.target.value)); }} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          {t('replace.startDate')}
          <input type="date" required min={endDate} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
        </label>
      </div>
      <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder={t('landlord.renterEmails')} aria-label={t('replace.newRenters')} className={input} />
      <input type="number" min="0" step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} placeholder={t('landlord.rent')} className={`${input} w-40`} />
      <p className="text-xs text-slate-400">{t('replace.note')}</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button disabled={!valid || busy} className={`${primary} disabled:opacity-50`}>
          {t('replace.submit')}
        </button>
        <button type="button" className="text-slate-400 underline" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
