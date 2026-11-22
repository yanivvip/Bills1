import { useTranslation } from 'react-i18next';
import type { BillLine } from '@bills/engine';
import { formatMoney } from '../../lib/money';
import { lineLabel, lineParts } from '../../lib/billLabels';

const DOT: Record<string, string> = { electricity: '#b7791f', electricityFixed: '#b7791f', waterA: '#2b6cb0', waterB: '#2b6cb0', waterFixed: '#2b6cb0', sewage: '#2b6cb0' };

// The breakdown of one bill: a line per charge and the total. Shared by the landlord's, the renter's and the printable pages.
export default function StatementView({ lines, total, variant = 'dots' }: { lines: readonly BillLine[]; total: number; variant?: 'dots' | 'sub' }) {
  const { t, i18n } = useTranslation();
  if (variant === 'sub')
    return (
      <div className="flex flex-col">
        {lines.map((l, i) => {
          const p = lineParts(t, l);
          return (
            <div key={i} className="flex items-center justify-between gap-3 border-t border-line-soft py-3 first:border-t-0">
              <span>
                <span className="block text-base">{p.title}</span>
                {p.sub && <span className="mt-0.5 block text-[13px] text-muted">{p.sub}</span>}
              </span>
              <span className="whitespace-nowrap text-base" dir="ltr">{formatMoney(l.amount, i18n.language)}</span>
            </div>
          );
        })}
      </div>
    );
  return (
    <div className="flex flex-col text-[15px]">
      {lines.map((l, i) => (
        <div key={i} className="flex items-center justify-between gap-3 border-t border-line-soft py-2">
          <span className="flex items-center gap-2 text-ink-2 print:text-black">
            <span aria-hidden className="h-2 w-2 flex-none rounded-full print:hidden" style={{ background: DOT[l.type] ?? '#8a918e' }} />
            {lineLabel(t, l)}
          </span>
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
