import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { parseAgorot } from '../../lib/money';
import { monthLabel, shiftMonth } from '../../lib/period';
import { card, input } from '../landlord/shared';
import type { useBilling } from './useBilling';

export type Act = (op: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
type Billing = ReturnType<typeof useBilling>;

// The month's extra charges: the amount is the total, split between the rented units, between everyone including the
// landlord's own home, or paid by one unit. A charge marked recurring can be copied to the next month.
export function Charges({
  orgId,
  propertyId,
  period,
  b,
  unitName,
  act,
  busy,
  money,
}: {
  orgId: string;
  propertyId: string;
  period: string;
  b: Billing;
  unitName: (id: string | null) => string;
  act: Act;
  busy: boolean;
  money: (a: number) => string;
}) {
  const { t, i18n } = useTranslation();
  // 'units' / 'all' split the total; anything else is the id of the one unit that pays it all
  const [who, setWho] = useState('units');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [open, setOpen] = useState(false);
  const agorot = parseAgorot(amount);
  // the landlord's own household exists when a unit is billed by subtraction and nobody rents it
  const landlordHome = b.units.some((u) => u.is_residual && !u.contracts.some((c) => c.status === 'active'));
  // who the amount is split between, for the preview
  const rented = b.units.filter((u) => !u.is_residual && u.contracts.some((c) => c.status === 'active')).map((u) => u.name);
  const recipients = who === 'units' ? rented : who === 'all' ? [...rented, ...b.units.filter((u) => u.is_residual).map((u) => u.name)] : [b.units.find((u) => u.id === who)?.name ?? ''];
  const scopeText = (c: { scope: string; unit_id: string | null }) => (c.scope === 'unit' ? unitName(c.unit_id) : c.scope === 'all' ? t('bills.chargeAll') : t('bills.chargeUnits'));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (agorot === null || agorot === 0 || !description.trim()) return;
    const scope = who === 'units' || who === 'all' ? who : 'unit';
    const ok = await act(
      supabase.from('charges').insert({ org_id: orgId, property_id: propertyId, scope, unit_id: scope === 'unit' ? who : null, recurring, period, description: description.trim(), amount: agorot }),
    );
    if (ok) {
      setDescription('');
      setAmount('');
      setOpen(false);
    }
  };

  // last month's recurring charges, ready to be given this month's amounts
  const copyRecurring = async () => {
    const prev = await supabase
      .from('charges')
      .select('scope,unit_id,description,amount')
      .eq('property_id', propertyId)
      .eq('period', shiftMonth(period, -1))
      .eq('recurring', true);
    const rows = ((prev.data ?? []) as { scope: string; unit_id: string | null; description: string; amount: number }[]).filter(
      (r) => !b.charges.some((c) => c.recurring && c.description === r.description && c.scope === r.scope && c.unit_id === r.unit_id),
    );
    if (rows.length === 0) {
      b.setError(t('bills.noRecurring'));
      return;
    }
    await act(supabase.from('charges').insert(rows.map((r) => ({ ...r, org_id: orgId, property_id: propertyId, period, recurring: true }))));
  };

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[17px] font-semibold">{t('bills.charges')}</h2>
      {b.charges.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm">
          <span>
            {c.recurring && '↻ '}
            {c.description} · {scopeText(c)}
          </span>
          <span className="flex items-center gap-3">
            <span dir="ltr">{money(c.amount)}</span>
            <button disabled={busy} className="text-danger" onClick={() => void act(supabase.from('charges').delete().eq('id', c.id))}>
              {t('landlord.remove')}
            </button>
          </span>
        </div>
      ))}
      <button disabled={busy} className="self-start text-sm text-ink-2 underline" onClick={() => void copyRecurring()}>
        {t('bills.copyRecurring')}
      </button>
      <button type="button" onClick={() => setOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-[#a7c9c1] text-[15px] font-medium text-primary-dark">
        + {t('bills.newCharge')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={t('bills.newCharge')}>
          <div className="mx-auto flex max-h-[92dvh] min-h-[70dvh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-[28px] bg-page px-[18px] pb-6 pt-3">
            <div className="mx-auto mb-4 h-1 w-11 rounded-full bg-[#d0cdc4]" aria-hidden="true" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">{t('bills.newCharge')}</h2>
              <button type="button" aria-label={t('common.close')} onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center text-[#3e4643]">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
      <form onSubmit={add} className="flex flex-1 flex-col gap-4">
        <label className="block text-sm text-muted">
          {t('bills.chargeName')}
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('bills.chargeDescription')} className={`${input} mt-1.5 h-[50px] w-full text-base text-ink`} />
        </label>
        <label className="block text-sm text-muted">
          {t('bills.chargeAmount')}
          <input type="text" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₪" className={`${input} mt-1.5 h-[50px] w-full text-base text-ink`} />
        </label>
        <div>
          <div className="mb-1.5 text-sm text-muted">{t('bills.chargeKind')}</div>
          <div className="flex gap-1 rounded-xl bg-track p-1" role="group">
            {[false, true].map((r) => (
              <button type="button" key={String(r)} aria-pressed={recurring === r} onClick={() => setRecurring(r)} className={`h-10 flex-1 rounded-[9px] text-sm ${recurring === r ? 'bg-white font-semibold text-primary-dark shadow-sm' : 'text-[#3e4643]'}`}>
                {r ? t('bills.chargeRecurring') : t('bills.chargeOneTime')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">{t('bills.chargeTo')}</div>
          <div className="flex flex-wrap gap-2">
            {[
              ['units', t('bills.chargeUnits')],
              ...(landlordHome ? [['all', t('bills.chargeAll')]] : []),
              ...b.units.map((u) => [u.id, u.name]),
            ].map(([key, label]) => (
              <button type="button" key={key} aria-pressed={who === key} onClick={() => setWho(key!)} className={`h-10 rounded-full border px-3.5 text-sm ${who === key ? 'border-primary bg-primary-soft font-semibold text-primary-dark' : 'border-line-strong bg-white text-[#3e4643]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {agorot !== null && agorot > 0 && recipients.length > 0 && (
          <div className="rounded-[18px] border border-line bg-card p-4">
            <div className="mb-1.5 text-[15px] text-muted">{t('bills.willBeAdded', { month: monthLabel(period, i18n.language) })}</div>
            {recipients.map((name, i) => (
              <div key={name + i} className="flex items-center justify-between border-t border-line-soft py-2 first:border-t-0">
                <span>{name}</span>
                <strong dir="ltr">{money(Math.floor(agorot / recipients.length) + (i < agorot % recipients.length ? 1 : 0))}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <button disabled={busy || !agorot || !description.trim()} className="h-14 rounded-2xl bg-primary text-[17px] font-medium text-white disabled:opacity-50">
          {t('bills.addCharge')}
        </button>
      </form>
          </div>
        </div>
      )}
      <p className="text-xs text-muted">{t('bills.chargeSplitHint')}</p>
    </div>
  );
}

// In a property-tax month: the water quantity on the voucher for each rented unit (the sewage is billed on it).
export function SewageEntries({ orgId, propertyId, period, b, act, busy }: { orgId: string; propertyId: string; period: string; b: Billing; act: Act; busy: boolean }) {
  const { t } = useTranslation();
  const rented = b.units.filter((u) => u.contracts.some((c) => c.status === 'active'));
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!b.taxDue || Number(b.tariff?.sewage_rate ?? 0) <= 0 || rented.length === 0) return null;

  const save = async (unitId: string) => {
    const text = draft[unitId];
    if (text === undefined) return;
    const qty = text.trim() === '' ? 0 : Number(text.replace(',', '.'));
    if (!Number.isFinite(qty) || qty < 0) return;
    const ok = await act(
      qty === 0
        ? supabase.from('sewage_entries').delete().eq('unit_id', unitId).eq('period', period)
        : supabase.from('sewage_entries').upsert({ property_id: propertyId, org_id: orgId, unit_id: unitId, period, qty, updated_at: new Date().toISOString() }),
    );
    if (ok) setDraft(({ [unitId]: _done, ...rest }) => rest);
  };

  return (
    <div className={card}>
      <h2 className="text-xl font-semibold text-ink-2">{t('bills.sewageTitle')}</h2>
      <p className="text-xs text-muted">{t('bills.sewageHint')}</p>
      {rented.map((u) => (
        <label key={u.id} className="flex items-center justify-between gap-3 text-sm">
          {u.name}
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            disabled={busy}
            aria-label={`${t('bills.sewageQty')} ${u.name}`}
            value={draft[u.id] ?? String(b.sewage[u.id] ?? '')}
            onChange={(e) => setDraft({ ...draft, [u.id]: e.target.value })}
            onBlur={() => void save(u.id)}
            className={`${input} w-28`}
            placeholder="0"
          />
        </label>
      ))}
    </div>
  );
}
