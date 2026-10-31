import { useTranslation } from 'react-i18next';
import type { BillLine } from '@bills/engine';
import { formatMoney } from '../../lib/money';
import { lineLabel } from '../../lib/billLabels';

// The breakdown of one bill: a line per charge and the total. Shared by the landlord's, the renter's and the printable pages.
export default function StatementView({ lines, total }: { lines: readonly BillLine[]; total: number }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-1 text-sm">
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="text-slate-300 print:text-black">{lineLabel(t, l)}</span>
          <span className="whitespace-nowrap" dir="ltr">{formatMoney(l.amount, i18n.language)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-white/10 pt-1 font-bold print:border-black">
        <span>{t('bills.total')}</span>
        <span dir="ltr">{formatMoney(total, i18n.language)}</span>
      </div>
    </div>
  );
}
