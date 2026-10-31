import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney, parseAgorot } from '../../lib/money';
import { monthStart, today } from '../../lib/period';
import MonthNav from '../readings/MonthNav';
import { card, input, primary } from '../landlord/shared';
import StatementView from './StatementView';
import MonthStrip from './MonthStrip';
import { reconcile } from '@bills/engine';
import { useBilling, type PaymentRow, type StatementRow, type SupplierAmounts } from './useBilling';

interface Prop {
  id: string;
  name: string;
}
const METHODS = ['bit', 'transfer', 'cash', 'other'] as const;

// Landlord: preview the month's bills, add one-off charges, approve, then track payments.
export default function BillsPage({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const [properties, setProperties] = useState<Prop[] | null>(null);
  const [propertyId, setPropertyId] = useState<string>();
  const [period, setPeriod] = useState(monthStart());
  const b = useBilling(propertyId, period);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from('properties')
      .select('id,name')
      .order('created_at')
      .then(({ data }) => {
        const list = (data as Prop[]) ?? [];
        setProperties(list);
        setPropertyId((cur) => cur ?? list[0]?.id);
      });
  }, []);

  if (!properties) return <p className="p-4">{t('common.loading')}</p>;

  const unitName = (id: string | null) => (id ? b.units.find((u) => u.id === id)?.name ?? '' : t('bills.mainMeters'));
  const money = (a: number) => formatMoney(a, i18n.language);

  const act = async (op: PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    const { error } = await op;
    setBusy(false);
    b.setError(error?.message ?? '');
    if (!error) await b.reload();
    return !error;
  };

  const approve = async () => {
    if (!b.result || !b.input || !propertyId) return;
    if (!window.confirm(t('bills.confirmApprove'))) return;
    const statements = b.result.bills.map((x) => ({ unit_id: x.unitId, total: x.total, lines: x.lines, readings: x.readings }));
    const snapshot = {
      ...b.input.tariff,
      units: b.input.units.filter((u) => u.billed).map((u) => ({ id: u.id, communityFee: u.communityFee, waterQuota: u.waterQuota, residual: u.residual })),
    };
    await act(supabase.rpc('approve_month', { p_property: propertyId, p_period: period, p_statements: statements, p_tariff: snapshot }));
  };

  const reopen = async () => {
    if (!b.billing || !window.confirm(t('bills.confirmReopen'))) return;
    await act(supabase.rpc('reopen_month', { p_billing: b.billing.id }));
  };

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('bills.title')}</h1>
      {properties.length > 1 && (
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={input} aria-label={t('landlord.properties')}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <MonthNav period={period} onChange={setPeriod} />
      {propertyId && <MonthStrip propertyId={propertyId} period={period} onChange={setPeriod} version={b.statements} />}
      {b.error && <p className="text-sm text-red-400">{b.error}</p>}

      {properties.length === 0 && <p className="text-slate-400">{t('bills.noProperty')}</p>}
      {propertyId && !b.loaded && <p>{t('common.loading')}</p>}

      {b.loaded && !b.tariff && (
        <p className="text-amber-400">
          {t('bills.noTariff')} <Link to={`/properties/${propertyId}`} className="underline">{t('bills.toProperty')}</Link>
        </p>
      )}

      {/* ── approved month ── */}
      {b.loaded && b.billing && (
        <>
          <p className="text-sm text-emerald-400">✓ {t('bills.approved')}</p>
          {b.statements.map((s) => (
            <StatementCard key={s.id} s={s} unit={unitName(s.unit_id)} payments={b.payments.filter((p) => p.statement_id === s.id)} busy={busy} act={act} />
          ))}
          <SupplierCard orgId={orgId} propertyId={propertyId!} period={period} supplier={b.supplier} lines={b.statements.map((s) => s.lines)} act={act} busy={busy} />
          <button className="self-start text-sm text-slate-400 underline" onClick={() => void reopen()}>
            {t('bills.reopen')}
          </button>
        </>
      )}

      {/* ── preview of a month not yet approved ── */}
      {b.loaded && b.tariff && !b.billing && b.result && (
        <>
          {b.result.problems.length > 0 && (
            <div className="rounded-xl bg-amber-900/30 p-3 text-sm">
              <strong>{t('bills.missingTitle')}</strong>
              <ul className="mt-1 list-disc ps-5">
                {b.result.problems.map((p, i) => (
                  <li key={i}>
                    {unitName(p.unitId)} · {t(`meters.${p.kind}`)} · {t(`bills.problem.${p.reason}`)}
                  </li>
                ))}
              </ul>
              <Link to="/readings" className="mt-2 inline-block underline">{t('nav.readings')}</Link>
            </div>
          )}
          {b.result.bills.map((x) => (
            <div key={x.unitId} className={card}>
              <strong className="text-lg">{unitName(x.unitId)}</strong>
              <StatementView lines={x.lines} total={x.total} />
            </div>
          ))}
          {b.result.bills.length === 0 && b.result.problems.length === 0 && <p className="text-slate-400">{t('bills.nothingToBill')}</p>}

          <Charges orgId={orgId} propertyId={propertyId!} period={period} b={b} unitName={unitName} act={act} busy={busy} money={money} />

          <button
            disabled={busy || b.result.problems.length > 0 || b.result.bills.length === 0}
            onClick={() => void approve()}
            className={`${primary} disabled:opacity-50`}
          >
            {t('bills.approve')}
          </button>
          {b.result.problems.length > 0 && <p className="text-xs text-slate-400">{t('bills.approveBlocked')}</p>}
        </>
      )}
    </section>
  );
}

function StatementCard({ s, unit, payments, busy, act }: { s: StatementRow; unit: string; payments: PaymentRow[]; busy: boolean; act: (op: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean> }) {
  const { t, i18n } = useTranslation();
  const remaining = s.total_agorot - s.paid_agorot;
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<(typeof METHODS)[number]>('bit');
  const [amount, setAmount] = useState('');
  const typed = amount.trim() === '' ? remaining : parseAgorot(amount);
  const valid = typed !== null && typed > 0 && typed <= remaining && !!date;
  const money = (a: number) => formatMoney(a, i18n.language);
  const full = remaining <= 0;
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-lg">{unit}</strong>
        {full ? (
          <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs">{t('bills.paid')}</span>
        ) : s.paid_agorot > 0 ? (
          <span className="rounded-full bg-sky-700 px-2 py-0.5 text-xs">{t('bills.partlyPaid')}</span>
        ) : (
          <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs">{t('bills.unpaid')}</span>
        )}
      </div>
      <StatementView lines={s.lines} total={s.total_agorot} />
      <Link to={`/bill/${s.id}`} className="self-start text-sm underline">
        {t('bills.viewBill')}
      </Link>
      {full && s.paid_on && (
        <p className="text-sm text-slate-300">
          {t('bills.paidOn', { date: s.paid_on })} · {t(`bills.method.${s.paid_method}`)}
        </p>
      )}
      {payments.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-slate-300">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>
                <span dir="ltr">{money(p.amount_agorot)}</span> · {p.paid_on} · {t(`bills.method.${p.method}`)}
              </span>
              <button disabled={busy} className="text-slate-400 underline" onClick={() => void act(supabase.rpc('delete_payment', { p_payment: p.id }))}>
                {t('bills.removePayment')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <>
          {s.paid_agorot > 0 && <p className="text-sm text-amber-300">{t('bills.remaining', { amount: money(remaining) })}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`${t('bills.paymentAmount')} (${money(remaining)})`} className={`${input} w-40`} aria-label={t('bills.paymentAmount')} />
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={input} aria-label={t('bills.paymentDate')} />
            <select value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])} className={input} aria-label={t('bills.paymentMethod')}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`bills.method.${m}`)}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !valid}
              className={`${primary} disabled:opacity-50`}
              onClick={() => {
                const paying = typed;
                setAmount(''); // clear at once so a second click cannot pay the same amount again
                void act(supabase.rpc('add_payment', { p_statement: s.id, p_amount: paying, p_paid_on: date, p_method: method }));
              }}
            >
              {t('bills.markPaid')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SupplierCard({ orgId, propertyId, period, supplier, lines, act, busy }: { orgId: string; propertyId: string; period: string; supplier: SupplierAmounts; lines: StatementRow['lines'][]; act: (op: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState({ electricity: '', water: '' });
  useEffect(() => {
    setText({ electricity: supplier.electricity != null ? String(supplier.electricity / 100) : '', water: supplier.water != null ? String(supplier.water / 100) : '' });
  }, [supplier.electricity, supplier.water, period]);
  const r = reconcile(lines, supplier);
  const money = (a: number) => formatMoney(a, i18n.language);
  const save = async (kind: 'electricity' | 'water') => {
    const a = parseAgorot(text[kind]);
    if (a === null || a < 0) return;
    await act(supabase.from('supplier_bills').upsert({ org_id: orgId, property_id: propertyId, period, kind, amount_agorot: a, updated_at: new Date().toISOString() }, { onConflict: 'property_id,period,kind' }));
  };
  return (
    <div className={card}>
      <h2 className="text-xl font-semibold text-slate-300">{t('bills.supplierTitle')}</h2>
      <p className="text-xs text-slate-400">{t('bills.supplierHint')}</p>
      {(['electricity', 'water'] as const).map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm">{t(`meters.${k}`)}</span>
            <input type="text" inputMode="decimal" dir="ltr" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} placeholder={t('bills.supplierAmount')} className={`${input} w-32`} aria-label={`${t('bills.supplierAmount')} ${t(`meters.${k}`)}`} />
            <button disabled={busy || parseAgorot(text[k]) === null} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void save(k)}>
              {t('common.save')}
            </button>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-300">
            <span>{t('bills.collectedFromRenters', { amount: money(r[k].collected) })}</span>
            {r[k].difference !== null && (
              <span className={r[k].difference > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                {r[k].difference > 0 ? t('bills.landlordCovered', { amount: money(r[k].difference) }) : r[k].difference < 0 ? t('bills.collectedExtra', { amount: money(-r[k].difference) }) : t('bills.balanced')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Charges({
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
  b: ReturnType<typeof useBilling>;
  unitName: (id: string | null) => string;
  act: (op: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
  busy: boolean;
  money: (a: number) => string;
}) {
  const { t } = useTranslation();
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const agorot = parseAgorot(amount);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (agorot === null || agorot === 0 || !description.trim()) return;
    const ok = await act(
      supabase.from('charges').insert({ org_id: orgId, property_id: propertyId, unit_id: unit || null, period, description: description.trim(), amount: agorot }),
    );
    if (ok) {
      setDescription('');
      setAmount('');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold text-slate-300">{t('bills.charges')}</h2>
      {b.charges.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
          <span>
            {c.description} · {c.unit_id ? unitName(c.unit_id) : t('bills.allUnits')}
          </span>
          <span className="flex items-center gap-3">
            <span dir="ltr">{money(c.amount)}</span>
            <button disabled={busy} className="text-red-400" onClick={() => void act(supabase.from('charges').delete().eq('id', c.id))}>
              {t('landlord.remove')}
            </button>
          </span>
        </div>
      ))}
      <form onSubmit={add} className={`${card} flex-row flex-wrap items-center`}>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={input} aria-label={t('bills.chargeTo')}>
          <option value="">{t('bills.allUnits')}</option>
          {b.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('bills.chargeDescription')} className={`${input} min-w-0 flex-1`} />
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₪" className={`${input} w-24`} aria-label={t('bills.chargeAmount')} />
        <button disabled={busy || !agorot || !description.trim()} className={`${primary} disabled:opacity-50`}>
          {t('bills.addCharge')}
        </button>
      </form>
    </div>
  );
}
