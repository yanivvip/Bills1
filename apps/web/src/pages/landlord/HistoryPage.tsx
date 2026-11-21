import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lastMonths, monthlyUsage, summarizeUsage, type HistoryScope } from '@bills/engine';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { monthStart, shiftMonth } from '../../lib/period';
import { card, input } from './shared';

type Kind = 'electricity' | 'water' | 'cost';
interface Prop {
  id: string;
  name: string;
}
interface Data {
  units: { id: string; name: string }[];
  meters: { id: string; unitId: string | null; kind: 'electricity' | 'water'; name: string }[];
  readings: { meterId: string; period: string; value: number }[];
  statements: { unitId: string; period: string; total: number }[];
}

// Consumption and cost of the last six months for the whole property, one unit or the landlord's own house.
export default function HistoryPage() {
  const { t, i18n } = useTranslation();
  const [properties, setProperties] = useState<Prop[] | null>(null);
  const [propertyId, setPropertyId] = useState<string>();
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState<Kind>('electricity');
  const [scopeKey, setScopeKey] = useState('property'); // 'property' | 'house' | a unit id

  useEffect(() => {
    void supabase
      .from('properties')
      .select('id,name')
      .order('created_at')
      .then(({ data: list }) => {
        const props = (list as Prop[]) ?? [];
        setProperties(props);
        setPropertyId((cur) => cur ?? props[0]?.id);
      });
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    setData(null);
    setScopeKey('property');
    const from = shiftMonth(monthStart(), -8);
    void Promise.all([
      supabase.from('units').select('id,name').eq('property_id', propertyId).order('created_at'),
      supabase.from('meters').select('id,unit_id,kind,name').eq('property_id', propertyId),
      supabase.from('readings').select('meter_id,period,value,meters!inner(property_id)').eq('meters.property_id', propertyId).gte('period', from),
      supabase.from('statements').select('unit_id,period,total_agorot,units!inner(property_id)').eq('units.property_id', propertyId).gte('period', from),
    ]).then(([u, m, r, s]) => {
      setData({
        units: (u.data ?? []) as { id: string; name: string }[],
        meters: ((m.data ?? []) as { id: string; unit_id: string | null; kind: 'electricity' | 'water'; name: string }[]).map((x) => ({ id: x.id, unitId: x.unit_id, kind: x.kind, name: x.name })),
        readings: ((r.data ?? []) as { meter_id: string; period: string; value: number }[]).map((x) => ({ meterId: x.meter_id, period: x.period, value: Number(x.value) })),
        statements: ((s.data ?? []) as { unit_id: string; period: string; total_agorot: number }[]).map((x) => ({ unitId: x.unit_id, period: x.period, total: Number(x.total_agorot) })),
      });
    });
  }, [propertyId]);

  const scope: HistoryScope = scopeKey === 'property' ? { type: 'property' } : scopeKey === 'house' ? { type: 'house' } : { type: 'unit', unitId: scopeKey };

  const view = useMemo(() => {
    if (!data) return null;
    const current = monthStart();
    const seriesFor = (months: string[]): (number | undefined)[] => {
      if (kind === 'cost') {
        if (scope.type === 'house') return months.map(() => undefined);
        return months.map((p) => {
          const rows = data.statements.filter((x) => x.period === p && (scope.type === 'property' || x.unitId === scope.unitId));
          return rows.length > 0 ? rows.reduce((sum, x) => sum + x.total, 0) : undefined;
        });
      }
      return monthlyUsage({ months, kind, scope, meters: data.meters, readings: data.readings });
    };
    // end the chart at the latest month that has a value: the current month is usually still empty
    let months = lastMonths(current, 6);
    let series = seriesFor(months);
    if (series[5] === undefined) {
      const earlier = lastMonths(shiftMonth(current, -1), 6);
      const earlierSeries = seriesFor(earlier);
      if (earlierSeries[5] !== undefined) {
        months = earlier;
        series = earlierSeries;
      }
    }
    return { months, series, summary: summarizeUsage(series), hasHouse: data.meters.some((m) => m.unitId === null) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kind, scopeKey]);

  if (!properties) return <p className="p-4">{t('common.loading')}</p>;

  const lang = i18n.language;
  const unitLabel = kind === 'water' ? t('bills.m3') : t('bills.kwh');
  const show = (v: number) => (kind === 'cost' ? formatMoney(Math.round(v), lang) : `${Math.round(v * 10) / 10}`);
  const monthShort = (p: string) => new Date(`${p}T00:00:00`).toLocaleDateString(lang, { month: 'short' });
  const max = view ? Math.max(1, ...view.series.map((x) => x ?? 0)) : 1;
  const known = view ? view.series.filter((x) => x !== undefined).length : 0;
  const lastMonth = view ? view.months[5]! : '';

  const chip = (key: string, label: string) => (
    <button key={key} onClick={() => setScopeKey(key)} aria-pressed={scopeKey === key} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${scopeKey === key ? 'bg-violet-600 font-semibold' : 'bg-white/10'}`}>
      {label}
    </button>
  );
  const tab = (k: Kind, label: string) => (
    <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`flex-1 rounded-lg px-3 py-2 text-sm ${kind === k ? 'bg-violet-600 font-semibold' : 'bg-white/10'}`}>
      {label}
    </button>
  );

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('history.title')}</h1>
      {properties.length > 1 && (
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={input} aria-label={t('landlord.properties')}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {properties.length === 0 && <p className="text-slate-400">{t('bills.noProperty')}</p>}
      {propertyId && !data && <p>{t('common.loading')}</p>}

      {data && view && (
        <>
          <div className="flex gap-2">
            {tab('electricity', t('meters.electricity'))}
            {tab('water', t('meters.water'))}
            {tab('cost', t('history.cost'))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chip('property', t('history.wholeProperty'))}
            {data.units.map((u) => chip(u.id, u.name))}
            {view.hasHouse && chip('house', t('history.house'))}
          </div>

          <div className={card}>
            <h2 className="font-semibold text-slate-300">
              {t('history.last6')} · {kind === 'cost' ? '₪' : unitLabel}
            </h2>
            <div className="flex h-40 items-end gap-2" role="img" aria-label={t('history.last6')}>
              {view.months.map((p, i) => {
                const v = view.series[i];
                return (
                  <div key={p} className="flex h-full flex-1 flex-col items-center justify-end gap-1 text-xs">
                    <span dir="ltr" className={v === undefined ? 'text-slate-500' : 'text-slate-200'}>
                      {v === undefined ? '—' : show(v)}
                    </span>
                    <div className={`w-full rounded-t-md ${i === 5 ? 'bg-violet-400' : 'bg-violet-700'}`} style={{ height: `${v === undefined ? 2 : Math.max(3, (v / max) * 100)}%` }} />
                    <span className="text-slate-400">{monthShort(p)}</span>
                  </div>
                );
              })}
            </div>
            {known === 0 && <p className="text-sm text-slate-400">{t('history.noData')}</p>}
          </div>

          {known > 0 && view.summary.average !== undefined && (
            <div className="grid grid-cols-2 gap-3">
              <div className={card}>
                <span className="text-sm text-slate-400">{t('history.average')}</span>
                <strong className="text-xl" dir="ltr">
                  {show(view.summary.average)} {kind === 'cost' ? '' : unitLabel}
                </strong>
              </div>
              {kind !== 'cost' && <AverageCost data={data} scope={scope} months={view.months} />}
            </div>
          )}

          {view.summary.changePct !== undefined && Math.abs(view.summary.changePct) >= 10 && (
            <div className={card}>
              <h2 className="font-semibold text-slate-300">{t('history.insights')}</h2>
              <p className="text-sm">
                {t(view.summary.changePct > 0 ? 'history.higher' : 'history.lower', {
                  what: kind === 'cost' ? t('history.cost') : t(`meters.${kind}`),
                  month: new Date(`${lastMonth}T00:00:00`).toLocaleDateString(lang, { month: 'long' }),
                  pct: Math.round(Math.abs(view.summary.changePct)),
                })}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// The average bill total of the months shown, for the same scope (the landlord's own house is not billed).
function AverageCost({ data, scope, months }: { data: Data; scope: HistoryScope; months: string[] }) {
  const { t, i18n } = useTranslation();
  if (scope.type === 'house') return null;
  const totals = months
    .map((p) => data.statements.filter((x) => x.period === p && (scope.type === 'property' || x.unitId === scope.unitId)))
    .filter((rows) => rows.length > 0)
    .map((rows) => rows.reduce((s, x) => s + x.total, 0));
  if (totals.length === 0) return null;
  return (
    <div className={card}>
      <span className="text-sm text-slate-400">{t('history.avgCost')}</span>
      <strong className="text-xl" dir="ltr">
        {formatMoney(Math.round(totals.reduce((a, b) => a + b, 0) / totals.length), i18n.language)}
      </strong>
    </div>
  );
}
