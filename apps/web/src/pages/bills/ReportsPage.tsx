import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildYear, collections as buildCollections, reconcile, type ReportStatement } from '@bills/engine';
import { monthLabel, monthStart } from '../../lib/period';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { buildSheets, downloadCsv, downloadXlsx } from '../../lib/exportReport';
import { card, input, primary } from '../landlord/shared';
import type { StatementRow } from './useBilling';

interface Prop {
  id: string;
  name: string;
}
interface Row extends StatementRow {
  units: { name: string; property_id: string };
}

// Landlord: the annual report per property (a sheet per unit plus a summary), on screen and as Excel or CSV.
export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const [properties, setProperties] = useState<Prop[] | null>(null);
  const [propertyId, setPropertyId] = useState<string>();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [supplierRows, setSupplierRows] = useState<{ period: string; kind: 'electricity' | 'water'; amount_agorot: number }[]>([]);

  useEffect(() => {
    void supabase
      .from('properties')
      .select('id,name')
      .order('created_at')
      .then(({ data }) => {
        const list = (data as Prop[]) ?? [];
        setProperties(list);
        setPropertyId((cur) => cur ?? list[0]?.id);
      });
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    setRows(null);
    void Promise.all([
      supabase
        .from('statements')
        .select('id,unit_id,contract_id,period,total_agorot,lines,readings,paid_agorot,paid_on,paid_method,units!inner(name,property_id)')
        .eq('units.property_id', propertyId)
        .gte('period', `${year}-01-01`)
        .lte('period', `${year}-12-01`),
      supabase.from('units').select('id,name').eq('property_id', propertyId).order('created_at'),
      supabase.from('supplier_bills').select('period,kind,amount_agorot').eq('property_id', propertyId).gte('period', `${year}-01-01`).lte('period', `${year}-12-01`),
    ]).then(([s, u, sb]) => {
      setSupplierRows(((sb.data ?? []) as { period: string; kind: 'electricity' | 'water'; amount_agorot: number }[]).map((x) => ({ ...x, amount_agorot: Number(x.amount_agorot) })));
      setError(s.error?.message ?? u.error?.message ?? '');
      setRows(((s.data ?? []) as unknown as Row[]).map((x) => ({ ...x, total_agorot: Number(x.total_agorot), paid_agorot: Number(x.paid_agorot) })));
      setUnits((u.data as { id: string; name: string }[]) ?? []);
    });
  }, [propertyId, year]);

  const data = useMemo(() => {
    const st: ReportStatement[] = (rows ?? []).map((r) => ({ unitId: r.unit_id, period: r.period, lines: r.lines, paidOn: r.paid_on, readings: r.readings }));
    // only units that have at least one approved month this year
    const ids = units.filter((u) => st.some((x) => x.unitId === u.id)).map((u) => u.id);
    const coll = buildCollections((rows ?? []).map((r) => ({ unitId: r.unit_id, period: r.period, total: r.total_agorot, paidAmount: r.paid_agorot })), monthStart());
    // supplier reconciliation per month of the year (only months with an approved bill)
    const recon = Array.from({ length: 12 }, (_, m) => {
      const p = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const of = (rows ?? []).filter((r) => r.period === p);
      if (of.length === 0) return undefined;
      const sup = (k: 'electricity' | 'water') => supplierRows.find((x) => x.period === p && x.kind === k)?.amount_agorot;
      return reconcile(of.map((r) => r.lines), { electricity: sup('electricity'), water: sup('water') });
    });
    return { years: buildYear(year, ids, st), ids, coll, recon };
  }, [rows, units, year, supplierRows]);

  if (!properties) return <p className="p-4">{t('common.loading')}</p>;

  const property = properties.find((p) => p.id === propertyId)?.name ?? '';
  const reportUnits = units.filter((u) => data.ids.includes(u.id));
  const sheets = () => buildSheets({ year, propertyName: property, units: reportUnits, data: data.years, t, lang: i18n.language, collections: data.coll, reconciliation: data.recon });
  const file = `bills-${property.replace(/[^\p{L}\p{N}]+/gu, '-')}-${year}`;
  const grand = data.years.reduce((s, y) => s + y.yearTotal.total, 0);
  const money = (a: number) => formatMoney(a, i18n.language);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      await downloadXlsx(sheets(), `${file}.xlsx`);
    } finally {
      setBusy(false);
    }
  };

  const line = (label: string, value: string) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-300">{label}</span>
      <span dir="ltr">{value}</span>
    </div>
  );

  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('report.title')}</h1>
      {properties.length > 1 && (
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={input} aria-label={t('landlord.properties')}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center justify-between gap-2">
        <button className="rounded-lg bg-white/10 px-3 py-1.5" onClick={() => setYear(year - 1)} aria-label="previous year">
          <span className="inline-block rtl:rotate-180">←</span>
        </button>
        <strong className="text-lg">{year}</strong>
        <button className="rounded-lg bg-white/10 px-3 py-1.5 disabled:opacity-40" disabled={year >= new Date().getFullYear()} onClick={() => setYear(year + 1)} aria-label="next year">
          <span className="inline-block rtl:rotate-180">→</span>
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!rows && propertyId && <p>{t('common.loading')}</p>}
      {rows && reportUnits.length === 0 && <p className="text-slate-400">{t('report.empty')}</p>}

      {reportUnits.map((u) => {
        const y = data.years.find((x) => x.unitId === u.id)!;
        const t12 = y.yearTotal;
        return (
          <div key={u.id} className={card}>
            <div className="flex items-center justify-between gap-2">
              <strong className="text-lg">{u.name}</strong>
              <span className="text-sm text-slate-400">{t('report.months', { count: y.months.filter(Boolean).length })}</span>
            </div>
            {line(`${t('report.electricityTotal')} (${t12.kwh} ${t('bills.kwh')})`, money(t12.electricityTotal))}
            {line(`${t('report.waterTotal')} (${t12.waterM3} ${t('bills.m3')})`, money(t12.waterTotal))}
            {line(t('report.community'), money(t12.community))}
            {line(t('report.oneOff'), money(t12.charges))}
            <div className="flex justify-between border-t border-white/10 pt-1 font-bold">
              <span>{t('report.total')}</span>
              <span dir="ltr">{money(t12.total)}</span>
            </div>
          </div>
        );
      })}
      {reportUnits.length > 0 && (
        <div className={card}>
          <h2 className="text-xl font-semibold text-slate-300">{t('report.collections')}</h2>
          {line(t('report.billed'), money(data.coll.billed))}
          {line(t('report.collected'), money(data.coll.paid))}
          {line(t('report.open'), money(data.coll.open))}
          {data.coll.debts.map((d, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm text-amber-300">
              <span>
                {units.find((u) => u.id === d.unitId)?.name} · {monthLabel(d.period, i18n.language)} · {t('report.ageMonths', { count: d.ageMonths })}
              </span>
              <span dir="ltr">{money(d.total)}</span>
            </div>
          ))}
        </div>
      )}
      {reportUnits.length > 0 && (
        <>
          <div className="flex justify-between text-lg font-bold">
            <span>{t('report.allUnits')}</span>
            <span dir="ltr">{money(grand)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void exportXlsx()} className={`${primary} disabled:opacity-60`}>
              {t('report.exportExcel')}
            </button>
            <button disabled={busy} onClick={() => downloadCsv(sheets(), `${file}.csv`)} className="rounded-lg bg-white/10 px-4 py-2 font-semibold disabled:opacity-60">
              {t('report.exportCsv')}
            </button>
          </div>
          <p className="text-xs text-slate-400">{t('report.hint')}</p>
        </>
      )}
    </section>
  );
}
