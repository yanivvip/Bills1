import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { parseAgorot } from '../../lib/money';
import { shiftMonth } from '../../lib/period';
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
  const { t } = useTranslation();
  // 'units' / 'all' split the total; anything else is the id of the one unit that pays it all
  const [who, setWho] = useState('units');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [recurring, setRecurring] = useState(false);
  const agorot = parseAgorot(amount);
  // the landlord's own household exists when a unit is billed by subtraction and nobody rents it
  const landlordHome = b.units.some((u) => u.is_residual && !u.contracts.some((c) => c.status === 'active'));
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
      <form onSubmit={add} className="flex flex-col gap-4 rounded-[18px] border border-line bg-card p-4">
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
        <button disabled={busy || !agorot || !description.trim()} className="h-14 rounded-2xl bg-primary text-[17px] font-medium text-white disabled:opacity-50">
          {t('bills.addCharge')}
        </button>
      </form>
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
