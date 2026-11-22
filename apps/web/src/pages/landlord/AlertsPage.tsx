import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import BackButton from '../../components/BackButton';
import { BoltIcon, CalendarIcon, CheckIcon, DropIcon, GaugeIcon, ReceiptIcon } from '../../components/NavIcons';
import { formatMoney } from '../../lib/money';
import { monthLabel } from '../../lib/period';
import { useAlerts, type Alert } from './useAlerts';

// The landlord's alerts centre: usage out of the ordinary, renters who have not reported, unpaid bills,
// renters who just reported and contracts about to end. New ones first, then the ones already read.
export default function AlertsPage() {
  const { t, i18n } = useTranslation();
  const { alerts, seen, unread, markAllRead } = useAlerts();

  if (!alerts) return <p className="p-4">{t('common.loading')}</p>;

  const text = (a: Alert) => {
    const p = a.params;
    switch (a.type) {
      case 'highUsage':
        return { title: t('alerts.highUsage.title', { kind: t(`meters.${p.kind}`) }), body: t('alerts.highUsage.body', { name: p.name, pct: p.pct }) };
      case 'noReport':
        return { title: t('alerts.noReport.title'), body: t('alerts.noReport.body', { unit: p.unit, kind: t(`meters.${p.kind}`) }) };
      case 'unpaid':
        return { title: t('alerts.unpaid.title'), body: t('alerts.unpaid.body', { unit: p.unit, month: monthLabel(String(p.period), i18n.language), amount: formatMoney(Number(p.total), i18n.language) }) };
      case 'renterPaid':
        return { title: t('alerts.renterPaid.title'), body: t('alerts.renterPaid.body', { unit: p.unit, month: monthLabel(String(p.period), i18n.language) }) };
      case 'reported':
        return { title: t('alerts.reported.title'), body: t('alerts.reported.body', { unit: p.unit }) };
      case 'contractEnding':
        return { title: t('alerts.contractEnding.title'), body: t('alerts.contractEnding.body', { unit: p.unit, count: Number(p.days), date: p.date }) };
    }
  };

  // the round icon of an alert: its colour says how serious it is
  const icon = (a: Alert): [ReactNode, string] => {
    switch (a.type) {
      case 'highUsage':
        return [a.params.kind === 'water' ? <DropIcon /> : <BoltIcon />, 'bg-warn-soft text-warn'];
      case 'noReport':
        return [<GaugeIcon />, 'bg-warn-soft text-warn'];
      case 'unpaid':
        return [<ReceiptIcon />, 'bg-warn-soft text-warn'];
      case 'renterPaid':
      case 'reported':
        return [<CheckIcon />, 'bg-primary-soft text-primary-dark'];
      case 'contractEnding':
        return [<CalendarIcon />, 'bg-track text-ink-2'];
    }
  };

  // the link line under an alert, as in the design
  const goLabel = (a: Alert) => {
    switch (a.type) {
      case 'highUsage':
        return t('alerts.go.history');
      case 'noReport':
      case 'reported':
        return t('alerts.go.readings');
      case 'unpaid':
      case 'renterPaid':
        return t('alerts.go.bills');
      default:
        return t('alerts.go.unit');
    }
  };

  const row = (a: Alert, isNew: boolean) => {
    const { title, body } = text(a);
    const [glyph, tone] = icon(a);
    return (
      <li key={a.key} className={`flex items-start gap-3 rounded-2xl border p-3.5 ${isNew ? 'border-[#a7c9c1] bg-[#f7fbfa]' : 'border-line bg-card'}`}>
        <span className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl ${tone}`}>{glyph}</span>
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-medium leading-snug">{title}</span>
          <span className="mt-0.5 text-sm leading-snug text-muted">{body}</span>
          {goLabel(a) && (
            <Link to={a.to} className="mt-2 text-sm font-medium text-primary-dark">
              {goLabel(a)}
            </Link>
          )}
        </span>
      </li>
    );
  };

  const fresh = alerts.filter((a) => !seen.has(a.key));
  const old = alerts.filter((a) => seen.has(a.key));

  return (
    <section className="flex flex-col gap-2.5 px-[18px] pb-4 pt-1">
      <div className="mb-1 flex items-center gap-1.5 pt-3">
        <BackButton />
        <h1 className="flex-1 text-[22px] font-semibold">{t('alerts.title')}</h1>
        {unread.length > 0 && (
          <button className="h-10 px-2.5 text-sm font-medium text-primary-dark" onClick={markAllRead}>
            {t('alerts.markAllRead')}
          </button>
        )}
      </div>
      {alerts.length === 0 && <p className="rounded-2xl bg-ok-soft p-3 text-sm text-ok">✓ {t('alerts.none')}</p>}
      {fresh.length > 0 && (
        <>
          <h2 className="mx-1 mt-1.5 text-sm font-medium text-muted">{t('alerts.new')}</h2>
          <ul className="flex flex-col gap-2.5">{fresh.map((a) => row(a, true))}</ul>
        </>
      )}
      {old.length > 0 && (
        <>
          <h2 className="mx-1 mt-1.5 text-sm font-medium text-muted">{t('alerts.earlier')}</h2>
          <ul className="flex flex-col gap-2.5">{old.map((a) => row(a, false))}</ul>
        </>
      )}
    </section>
  );
}
