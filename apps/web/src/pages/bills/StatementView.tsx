import { useTranslation } from 'react-i18next';
import type { BillLine } from '@bills/engine';
import { formatMoney } from '../../lib/money';
import { lineLabel } from '../../lib/billLabels';

// The breakdown of one bill: a line per charge and the total. Shared by the landlord's, the renter's and the printable pages.
export default function StatementView({ lines, total }: { lines: readonly BillLine[]; total: number }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col text-[15px]">
      {lines.map((l, i) => (
        <div key={i} className="flex items-center justify-between gap-3 border-t border-line-soft py-2">
          <span className="text-[#3e4643] print:text-black">{lineLabel(t, l)}</span>
          <span className="whitespace-nowrap" dir="ltr">{formatMoney(l.amount, i18n.language)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-line pt-2.5 text-base font-semibold print:border-black">
        <span>{t('bills.total')}</span>
        <span dir="ltr">{formatMoney(total, i18n.language)}</span>
      </div>
    </div>
  );
}
