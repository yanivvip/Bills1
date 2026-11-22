import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthStart } from '../../lib/period';
import MonthNav from '../readings/MonthNav';
import { explainLine } from '../../lib/billLabels';
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
    <section className="flex flex-col gap-3.5 px-[18px] pb-4 pt-1">
      <h1 className="text-2xl font-semibold">{t('bills.myBill')}</h1>
      {balance > 0 && (
        <div className="rounded-[18px] bg-warn-soft p-3.5 text-warn">
          {t('bills.balanceDue')}: <strong dir="ltr">{formatMoney(balance, i18n.language)}</strong>
        </div>
      )}
      <MonthNav period={period} onChange={setPeriod} />
      {!s && <p className="text-muted">{t('bills.notPublished')}</p>}
      {s && (
        <>
          <div className="flex flex-col items-center gap-2.5 rounded-[18px] border border-line bg-card px-4 py-6 text-center">
            <span className="text-[15px] text-muted">{t('bills.totalToPay')}</span>
            <span className="text-5xl font-semibold leading-none" dir="ltr">
              {formatMoney(s.total_agorot, i18n.language)}
            </span>
            {s.paid_on ? (
              <span className="inline-flex h-8 items-center rounded-full bg-primary-soft px-3.5 text-[15px] font-medium text-primary-dark">✓ {t('bills.paid')}</span>
            ) : s.paid_agorot > 0 ? (
              <span className="inline-flex h-8 items-center rounded-full bg-info-soft px-3.5 text-[15px] font-medium text-info">{t('bills.partlyPaid')}</span>
            ) : (
              <span className="inline-flex h-8 items-center rounded-full bg-warn-soft px-3.5 text-[15px] font-medium text-warn">{t('bills.unpaid')}</span>
            )}
            {s.paid_on && <p className="text-sm text-ink-2">{t('bills.paidOn', { date: s.paid_on })} · {t(`bills.method.${s.paid_method}`)}</p>}
          </div>
          <div className="rounded-[18px] border border-line bg-card px-4 py-1">
            <StatementView lines={s.lines} total={s.total_agorot} variant="sub" />
          </div>
          <details className="text-center text-[15px]">
            <summary className="mx-auto flex cursor-pointer list-none items-center justify-center gap-2 py-2 font-medium text-primary-dark">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-current text-xs font-bold" aria-hidden="true">i</span>
              {t('bills.howCalculated')}
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-start text-ink-2">
              {s.lines.map((l, i) => (
                <li key={i}>{explainLine(t, l, s.readings)}</li>
              ))}
            </ul>
          </details>
          {error && <p className="text-sm text-danger">{error}</p>}
          {!s.paid_on &&
            (s.renter_paid_notice_at ? (
              <p className="text-center text-sm text-info">✓ {t('bills.noticeSent', { date: s.renter_paid_notice_at.slice(0, 10) })}</p>
            ) : (
              <button className="h-14 rounded-2xl bg-primary text-[17px] font-medium text-white" onClick={() => void notifyPaid(s.id)}>
                {t('bills.iPaid')}
              </button>
            ))}
          <Link to={`/bill/${s.id}`} className="flex h-12 items-center justify-center rounded-xl border border-line-strong bg-white text-[15px] font-medium text-primary-dark">
            {t('bills.viewBill')}
          </Link>
        </>
      )}
    </section>
  );
}
