import type { TFunction } from 'i18next';
import type { BillLine } from '@bills/engine';
import { rateToShekels } from './money';

/** Human text of one bill line, e.g. "חשמל · 250 קוט״ש × ₪0.64". */
export function lineLabel(t: TFunction, l: BillLine): string {
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
}

/** The bill as plain text for WhatsApp. */
export function billMessage(t: TFunction, opts: { property: string; unit: string; month: string; lines: readonly BillLine[]; total: string; money: (a: number) => string; paidOn: string | null }): string {
  const rows = opts.lines.map((l) => `• ${lineLabel(t, l)}: ${opts.money(l.amount)}`);
  const head = t('bills.message.head', { property: opts.property, unit: opts.unit, month: opts.month });
  const foot = opts.paidOn ? t('bills.message.paid', { total: opts.total, date: opts.paidOn }) : t('bills.message.total', { total: opts.total });
  return [head, ...rows, foot].join('\n');
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
