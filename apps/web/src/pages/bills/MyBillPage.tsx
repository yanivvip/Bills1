import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthStart } from '../../lib/period';
import MonthNav from '../readings/MonthNav';
import { card } from '../landlord/shared';
import StatementView from './StatementView';
import type { StatementRow } from './useBilling';

// Renter: the bill of the chosen month (RLS only returns the renter's own contracts' statements).
export default function MyBillPage() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState(monthStart());
  const [statements, setStatements] = useState<StatementRow[] | null>(null);

  useEffect(() => {
    void supabase
      .from('statements')
      .select('id,unit_id,contract_id,period,total_agorot,lines,paid_agorot,paid_on,paid_method')
      .order('period', { ascending: false })
      .then(({ data }) => setStatements(((data ?? []) as StatementRow[]).map((x) => ({ ...x, total_agorot: Number(x.total_agorot), paid_agorot: Number(x.paid_agorot) }))));
  }, []);

  if (!statements) return <p className="p-4">{t('common.loading')}</p>;
  const s = statements.find((x) => x.period === period);
  const balance = statements.reduce((sum, x) => sum + (x.total_agorot - x.paid_agorot), 0);

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('bills.myBill')}</h1>
      {balance > 0 && (
        <div className="rounded-2xl bg-amber-900/30 p-3 text-amber-200">
          {t('bills.balanceDue')}: <strong dir="ltr">{formatMoney(balance, i18n.language)}</strong>
        </div>
      )}
      <MonthNav period={period} onChange={setPeriod} />
      {!s && <p className="text-slate-400">{t('bills.notPublished')}</p>}
      {s && (
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-3xl font-bold" dir="ltr">{formatMoney(s.total_agorot, i18n.language)}</span>
            {s.paid_on ? (
              <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs">✓ {t('bills.paid')}</span>
            ) : s.paid_agorot > 0 ? (
              <span className="rounded-full bg-sky-700 px-2 py-0.5 text-xs">{t('bills.partlyPaid')}</span>
            ) : (
              <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs">{t('bills.unpaid')}</span>
            )}
          </div>
          {s.paid_on && <p className="text-sm text-slate-300">{t('bills.paidOn', { date: s.paid_on })} · {t(`bills.method.${s.paid_method}`)}</p>}
          <StatementView lines={s.lines} total={s.total_agorot} />
          <Link to={`/bill/${s.id}`} className="self-start text-sm underline">
            {t('bills.viewBill')}
          </Link>
        </div>
      )}
    </section>
  );
}
