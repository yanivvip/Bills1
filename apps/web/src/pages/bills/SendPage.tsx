import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthLabel } from '../../lib/period';
import { billMessage, whatsappLink } from '../../lib/billLabels';
import BackButton from '../../components/BackButton';
import type { StatementRow } from './useBilling';

interface Doc extends StatementRow {
  units: { name: string; properties: { name: string } | null } | null;
}

// "Send to renter": the ready WhatsApp message in a chat bubble, editable before it is sent, with the renter's number when known.
export default function SendPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [renter, setRenter] = useState<{ name: string; phone: string | null } | null>(null);
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void supabase
      .from('statements')
      .select('id,unit_id,contract_id,period,total_agorot,lines,readings,paid_agorot,paid_on,paid_method,units(name,properties(name))')
      .eq('id', id!)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setDoc(null);
        const d = { ...(data as unknown as Doc), total_agorot: Number((data as { total_agorot: number }).total_agorot), paid_agorot: Number((data as { paid_agorot: number }).paid_agorot) };
        setDoc(d);
        const money = (a: number) => formatMoney(a, i18n.language);
        const m = billMessage(t, { property: d.units?.properties?.name ?? '', unit: d.units?.name ?? '', month: monthLabel(d.period, i18n.language), lines: d.lines, total: money(d.total_agorot), money, paidOn: d.paid_on });
        setText(m);
        setOriginal(m);
        void supabase
          .from('contract_renters')
          .select('full_name,email,phone')
          .eq('contract_id', d.contract_id)
          .order('created_at')
          .then(({ data: rs }) => {
            const list = (rs ?? []) as { full_name: string | null; email: string; phone: string | null }[];
            const withPhone = list.find((r) => r.phone) ?? list[0];
            setRenter(list.length ? { name: (withPhone?.full_name || withPhone?.email) ?? '', phone: list.find((r) => r.phone)?.phone ?? null } : null);
          });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (doc === undefined) return <p className="p-4">{t('common.loading')}</p>;
  if (!doc) return <p className="p-4">{t('landlord.notFound')}</p>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // clipboard blocked: the text can still be selected by hand
    }
  };

  return (
    <section className="flex min-h-[calc(100dvh-78px)] flex-col gap-3.5 px-[18px] pb-4 pt-4">
      <header className="flex items-center gap-1.5">
        <BackButton />
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">{t('bills.sendToRenter')}</h1>
          <div className="text-sm text-muted">{[renter?.name, doc.units?.name].filter(Boolean).join(' · ')}</div>
        </div>
      </header>
      <label htmlFor="wa-text" className="text-sm text-muted">
        {t('whatsapp.title')}:
      </label>
      <div className="flex-1 rounded-[28px] bg-[#e8e4da] p-4">
        <div className="max-w-[88%] rounded-2xl bg-white p-4 shadow-sm">
          {editing ? (
            <textarea
              id="wa-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCopied(false);
              }}
              rows={Math.min(16, text.split('\n').length + 1)}
              className="w-full resize-none text-base leading-relaxed outline-none"
            />
          ) : (
            <p id="wa-text" className="whitespace-pre-line text-base leading-[1.7]">
              {text}
            </p>
          )}
          <div dir="ltr" className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <img src="/favicon.svg" alt="" width={16} height={16} />
            BILLS-AI
          </div>
        </div>
      </div>
      <a className="flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-primary text-base font-medium text-white" href={whatsappLink(text, renter?.phone)} target="_blank" rel="noreferrer">
        {t('whatsapp.open')}
      </a>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)} className="h-[54px] rounded-2xl border border-line-strong bg-white text-base font-medium text-primary-dark">
          {t('whatsapp.edit')}
        </button>
        <button type="button" onClick={() => void copy()} className="h-[54px] rounded-2xl border border-line-strong bg-white text-base font-medium text-primary-dark">
          {copied ? `✓ ${t('whatsapp.copied')}` : t('whatsapp.copy')}
        </button>
      </div>
      <div className="flex justify-between text-sm">
        <Link to={`/bill/${doc.id}`} className="text-primary-dark underline">
          {t('bills.viewBill')}
        </Link>
        {text !== original && (
          <button type="button" onClick={() => { setText(original); setCopied(false); }} className="text-muted underline">
            {t('whatsapp.reset')}
          </button>
        )}
      </div>
    </section>
  );
}
