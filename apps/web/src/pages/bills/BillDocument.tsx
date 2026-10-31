import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthLabel } from '../../lib/period';
import { billMessage, whatsappLink } from '../../lib/billLabels';
import StatementView from './StatementView';
import type { PaymentRow, StatementRow } from './useBilling';

interface Doc extends StatementRow {
  units: { name: string; properties: { name: string; address: string | null } | null } | null;
}

// A printable bill (or, once paid, a receipt). "Print" lets the browser save it as a PDF. Read through RLS:
// the landlord of the unit and the renters of its contract can open it.
export default function BillDocument() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    void supabase
      .from('statements')
      .select('id,unit_id,contract_id,period,total_agorot,lines,readings,paid_agorot,paid_on,paid_method,units(name,properties(name,address))')
      .eq('id', id!)
      .maybeSingle()
      .then(({ data }) => setDoc(data ? ({ ...(data as unknown as Doc), total_agorot: Number((data as { total_agorot: number }).total_agorot), paid_agorot: Number((data as { paid_agorot: number }).paid_agorot) }) : null));
    void supabase
      .from('payments')
      .select('id,statement_id,amount_agorot,paid_on,method,note')
      .eq('statement_id', id!)
      .order('paid_on')
      .then(({ data }) => setPayments(((data ?? []) as PaymentRow[]).map((x) => ({ ...x, amount_agorot: Number(x.amount_agorot) }))));
  }, [id]);

  if (doc === undefined) return <p className="p-4">{t('common.loading')}</p>;
  if (!doc) return <p className="p-4">{t('landlord.notFound')}</p>;

  const money = (a: number) => formatMoney(a, i18n.language);
  const month = monthLabel(doc.period, i18n.language);
  const property = doc.units?.properties?.name ?? '';
  const unit = doc.units?.name ?? '';
  const paid = !!doc.paid_on;
  const text = billMessage(t, { property, unit, month, lines: doc.lines, total: money(doc.total_agorot), money, paidOn: doc.paid_on });
  const reading = (kind: 'electricity' | 'water') => {
    const r = doc.readings?.[kind];
    return r ? `${t(`meters.${kind}`)}: ${r.prev} → ${r.cur} ${kind === 'electricity' ? t('bills.kwh') : t('bills.m3')}` : null;
  };

  return (
    <section className="flex flex-col gap-4 p-4 print:p-0 print:text-black">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button className="rounded-lg bg-violet-600 px-4 py-2 font-semibold" onClick={() => window.print()}>
          {t('bills.print')}
        </button>
        <a className="rounded-lg bg-white/10 px-4 py-2 font-semibold" href={whatsappLink(text)} target="_blank" rel="noreferrer">
          {t('bills.shareWhatsapp')}
        </a>
        <button className="px-2 py-2 text-slate-400 underline" onClick={() => history.back()}>
          {t('common.back')}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-white/5 p-5 print:rounded-none print:bg-white print:p-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{paid ? t('bills.receipt') : t('bills.bill')}</h1>
            <p className="text-slate-300 print:text-black">{month}</p>
          </div>
          <span className="text-end text-sm text-slate-300 print:text-black">
            {property}
            {doc.units?.properties?.address && <><br />{doc.units.properties.address}</>}
            <br />
            {unit}
          </span>
        </div>
        <StatementView lines={doc.lines} total={doc.total_agorot} />
        {(reading('electricity') || reading('water')) && (
          <div className="text-xs text-slate-400 print:text-black">
            <strong>{t('bills.readingsUsed')}</strong>
            {reading('electricity') && <div>{reading('electricity')}</div>}
            {reading('water') && <div>{reading('water')}</div>}
          </div>
        )}
        {payments.length > 0 && (
          <ul className="text-sm text-slate-300 print:text-black">
            {payments.map((p) => (
              <li key={p.id}>
                {money(p.amount_agorot)} · {p.paid_on} · {t(`bills.method.${p.method}`)}
              </li>
            ))}
          </ul>
        )}
        <p className={`font-semibold ${paid ? 'text-emerald-400 print:text-black' : 'text-amber-400 print:text-black'}`}>
          {paid
            ? `✓ ${t('bills.paidOn', { date: doc.paid_on })} · ${t(`bills.method.${doc.paid_method}`)}`
            : doc.paid_agorot > 0
              ? t('bills.partialSummary', { paid: money(doc.paid_agorot), total: money(doc.total_agorot) })
              : t('bills.unpaid')}
        </p>
      </div>
    </section>
  );
}
