import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

  const row = (a: Alert, isNew: boolean) => {
    const { title, body } = text(a);
    return (
      <li key={a.key}>
        <Link to={a.to} className={`flex flex-col gap-0.5 rounded-xl px-3 py-2 ${isNew ? 'bg-warn-soft' : 'border border-line bg-card'}`}>
          <span className="flex items-center gap-2 font-semibold">
            {isNew && <span aria-hidden className="h-2 w-2 rounded-full bg-warn-strong" />}
            {title}
          </span>
          <span className="text-sm text-ink-2">{body}</span>
        </Link>
      </li>
    );
  };

  const fresh = alerts.filter((a) => !seen.has(a.key));
  const old = alerts.filter((a) => seen.has(a.key));

  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('alerts.title')}</h1>
        {unread.length > 0 && (
          <button className="text-sm text-ink-2 underline" onClick={markAllRead}>
            {t('alerts.markAllRead')}
          </button>
        )}
      </div>
      {alerts.length === 0 && <p className="rounded-2xl bg-ok-soft p-3 text-sm text-ok">✓ {t('alerts.none')}</p>}
      {fresh.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted">{t('alerts.new')}</h2>
          <ul className="flex flex-col gap-2">{fresh.map((a) => row(a, true))}</ul>
        </>
      )}
      {old.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted">{t('alerts.earlier')}</h2>
          <ul className="flex flex-col gap-2">{old.map((a) => row(a, false))}</ul>
        </>
      )}
    </section>
  );
}
