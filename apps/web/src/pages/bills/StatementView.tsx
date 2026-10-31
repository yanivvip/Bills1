import { useTranslation } from 'react-i18next';
import type { BillLine } from '@bills/engine';
import { formatMoney, rateToShekels } from '../../lib/money';

// The breakdown of one bill: a line per charge and the total. Shared by the landlord's and the renter's pages.
export default function StatementView({ lines, total }: { lines: readonly BillLine[]; total: number }) {
  const { t, i18n } = useTranslation();
  const label = (l: BillLine) => {
    switch (l.type) {
      case 'electricity':
        return `${t('bills.line.electricity')} · ${l.qty} ${t('bills.kwh')} × ₪${rateToShekels(l.rate ?? 0)}`;
      case 'waterA':
        return `${t('bills.line.waterA')} · ${l.qty} ${t('bills.m3')} × ₪${rateToShekels(l.rate ?? 0)}`;
      case 'waterB':
        return `${t('bills.line.waterB')} · ${l.qty} ${t('bills.m3')} × ₪${rateToShekels(l.rate ?? 0)}`;
      case 'charge':
        return l.description ?? t('bills.line.charge');
      default:
        return t(`bills.line.${l.type}`);
    }
  };
  return (
    <div className="flex flex-col gap-1 text-sm">
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="text-slate-300">{label(l)}</span>
          <span className="whitespace-nowrap" dir="ltr">{formatMoney(l.amount, i18n.language)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-white/10 pt-1 font-bold">
        <span>{t('bills.total')}</span>
        <span dir="ltr">{formatMoney(total, i18n.language)}</span>
      </div>
    </div>
  );
}
