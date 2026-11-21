import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthStart } from '../../lib/period';
import MonthNav from '../readings/MonthNav';
import { explainLine } from '../../lib/billLabels';
import { card } from '../landlord/shared';
import StatementView from './StatementView';
import type { StatementRow } from './useBilling';

// Renter: the bill of the chosen month (RLS only returns the renter's own contracts' statements).
export default function MyBillPage() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState(monthStart());
  const [statements, setStatements] = useState<StatementRow[] | null>(null);
  const [error, setError] = useState('');

  const load = () =>
    supabase
      .from('statements')
      .select('id,unit_id,contract_id,period,total_agorot,lines,readings,paid_agorot,paid_on,paid_method,renter_paid_notice_at')
      .order('period', { ascending: false })
      .then(({ data }) => setStatements(((data ?? []) as StatementRow[]).map((x) => ({ ...x, total_agorot: Number(x.total_agorot), paid_agorot: Number(x.paid_agorot) }))));
  useEffect(() => {
    void load();
  }, []);

  const notifyPaid = async (id: string) => {
    const { error } = await supabase.rpc('notify_paid', { p_statement: id });
    setError(error?.message ?? '');
    if (!error) await load();
  };

  if (!statements) return <p className="p-4">{t('common.loading')}</p>;
  const s = statements.find((x) => x.period === period);
  const balance = statements.reduce((sum, x) => sum + (x.total_agorot - x.paid_agorot), 0);

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('bills.myBill')}</h1>
      {balance > 0 && (
        <div className="rounded-2xl bg-warn-soft p-3 text-warn">
          {t('bills.balanceDue')}: <strong dir="ltr">{formatMoney(balance, i18n.language)}</strong>
        </div>
      )}
      <MonthNav period={period} onChange={setPeriod} />
      {!s && <p className="text-muted">{t('bills.notPublished')}</p>}
      {s && (
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-3xl font-bold" dir="ltr">{formatMoney(s.total_agorot, i18n.language)}</span>
            {s.paid_on ? (
              <span className="rounded-full bg-ok-soft text-ok px-2 py-0.5 text-xs">✓ {t('bills.paid')}</span>
            ) : s.paid_agorot > 0 ? (
              <span className="rounded-full bg-info-soft text-info px-2 py-0.5 text-xs">{t('bills.partlyPaid')}</span>
            ) : (
              <span className="rounded-full bg-warn-soft text-warn px-2 py-0.5 text-xs">{t('bills.unpaid')}</span>
            )}
          </div>
          {s.paid_on && <p className="text-sm text-ink-2">{t('bills.paidOn', { date: s.paid_on })} · {t(`bills.method.${s.paid_method}`)}</p>}
          <StatementView lines={s.lines} total={s.total_agorot} />
          <details className="text-sm">
            <summary className="cursor-pointer underline">{t('bills.howCalculated')}</summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-ink-2">
              {s.lines.map((l, i) => (
                <li key={i}>{explainLine(t, l, s.readings)}</li>
              ))}
            </ul>
          </details>
          {error && <p className="text-sm text-danger">{error}</p>}
          {!s.paid_on &&
            (s.renter_paid_notice_at ? (
              <p className="text-sm text-info">✓ {t('bills.noticeSent', { date: s.renter_paid_notice_at.slice(0, 10) })}</p>
            ) : (
              <button className="self-start rounded-lg bg-primary text-white px-4 py-2 font-semibold" onClick={() => void notifyPaid(s.id)}>
                {t('bills.iPaid')}
              </button>
            ))}
          <Link to={`/bill/${s.id}`} className="self-start text-sm underline">
            {t('bills.viewBill')}
          </Link>
        </div>
      )}
    </section>
  );
}
