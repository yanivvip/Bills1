import type { TFunction } from 'i18next';
import type { MonthSummary, UnitYear } from '@bills/engine';

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
  /** row indexes that are headings (bold) and the money rows (2 decimals) */
  sections: Set<number>;
  money: Set<number>;
}

interface Spec {
  key?: keyof MonthSummary;
  /** a meter reading row (previous/current) instead of a summary value */
  read?: 'electricity' | 'water';
  side?: 'prev' | 'cur';
  label: string;
  kind: 'section' | 'qty' | 'money' | 'total';
}

const shekels = (agorot: number) => agorot / 100;

// Layout follows the annual template from the product manager: a sheet per unit, a column per month, and a summary sheet.
function unitSpecs(t: TFunction): Spec[] {
  return [
    { label: `⚡ ${t('report.electricity')}`, kind: 'section' },
    { read: 'electricity', side: 'prev', label: t('report.prevReading'), kind: 'qty' },
    { read: 'electricity', side: 'cur', label: t('report.curReading'), kind: 'qty' },
    { key: 'kwh', label: t('report.kwh'), kind: 'qty' },
    { key: 'electricityCost', label: t('report.electricityCost'), kind: 'money' },
    { key: 'electricityFixed', label: t('report.electricityFixed'), kind: 'money' },
    { key: 'electricityTotal', label: t('report.electricityTotal'), kind: 'total' },
    { label: `💧 ${t('report.water')}`, kind: 'section' },
    { read: 'water', side: 'prev', label: t('report.prevReadingWater'), kind: 'qty' },
    { read: 'water', side: 'cur', label: t('report.curReadingWater'), kind: 'qty' },
    { key: 'waterM3', label: t('report.waterM3'), kind: 'qty' },
    { key: 'waterAM3', label: t('report.waterAM3'), kind: 'qty' },
    { key: 'waterACost', label: t('report.waterACost'), kind: 'money' },
    { key: 'waterBM3', label: t('report.waterBM3'), kind: 'qty' },
    { key: 'waterBCost', label: t('report.waterBCost'), kind: 'money' },
    { key: 'waterTotal', label: t('report.waterTotal'), kind: 'total' },
    { label: `🏘️ ${t('report.charges')}`, kind: 'section' },
    { key: 'community', label: t('report.community'), kind: 'money' },
    { key: 'charges', label: t('report.oneOff'), kind: 'money' },
    { key: 'total', label: `💳 ${t('report.total')}`, kind: 'total' },
  ];
}

const monthNames = (year: number, lang: string) =>
  Array.from({ length: 12 }, (_, m) => `${new Date(year, m, 1).toLocaleDateString(lang, { month: 'long' })} ${year}`);

export function buildSheets(opts: { year: number; propertyName: string; units: { id: string; name: string }[]; data: UnitYear[]; t: TFunction; lang: string }): Sheet[] {
  const { year, propertyName, units, data, t, lang } = opts;
  const months = monthNames(year, lang);
  const sheets: Sheet[] = [];

  for (const u of units) {
    const y = data.find((x) => x.unitId === u.id);
    if (!y) continue;
    const rows: Cell[][] = [[`${u.name} – ${propertyName} – ${year}`], [t('report.category'), ...months, t('report.yearTotal')]];
    const sections = new Set<number>([0, 1]);
    const money = new Set<number>();
    for (const spec of unitSpecs(t)) {
      const r = rows.length;
      if (spec.kind === 'section') {
        sections.add(r);
        rows.push([spec.label]);
        continue;
      }
      if (spec.read) {
        const pick = (i: number) => y.readings[i]?.[spec.read!]?.[spec.side!] ?? null;
        const first = y.months.findIndex((m) => m);
        const last = y.months.length - 1 - [...y.months].reverse().findIndex((m) => m);
        // the year column: opening reading of the first month and closing reading of the last
        const yearCol = first >= 0 ? (spec.side === 'prev' ? pick(first) : pick(last)) : null;
        rows.push([spec.label, ...y.months.map((m, i) => (m ? pick(i) : null)), yearCol]);
        continue;
      }
      const conv = (v: number) => (spec.kind === 'qty' ? v : shekels(v));
      const key = spec.key!;
      rows.push([spec.label, ...y.months.map((m) => (m ? conv(m[key]) : null)), conv(y.yearTotal[key])]);
      if (spec.kind !== 'qty') money.add(r);
      if (spec.kind === 'total') sections.add(r);
    }
    sections.add(rows.length);
    rows.push([`✓ ${t('report.paid')}`, ...y.months.map((m, i) => (m ? (y.paid[i] ?? t('report.unpaid')) : null)), null]);
    sheets.push({ name: u.name, rows, sections, money });
  }

  // summary across units
  const present = units.map((u) => ({ u, y: data.find((x) => x.unitId === u.id) })).filter((x): x is { u: { id: string; name: string }; y: UnitYear } => !!x.y);
  const rows: Cell[][] = [[`${t('report.summary')} – ${propertyName} – ${year}`], [t('report.category'), ...present.map((x) => x.u.name), t('report.allUnits')]];
  const sections = new Set<number>([0, 1]);
  const money = new Set<number>();
  const summaryKeys: { key: keyof MonthSummary; label: string; qty?: boolean }[] = [
    { key: 'kwh', label: t('report.kwh'), qty: true },
    { key: 'electricityTotal', label: t('report.electricityTotal') },
    { key: 'waterM3', label: t('report.waterM3'), qty: true },
    { key: 'waterTotal', label: t('report.waterTotal') },
    { key: 'community', label: t('report.community') },
    { key: 'charges', label: t('report.oneOff') },
    { key: 'total', label: `💳 ${t('report.total')}` },
  ];
  for (const k of summaryKeys) {
    const r = rows.length;
    const conv = (v: number) => (k.qty ? v : shekels(v));
    const vals = present.map((x) => x.y.yearTotal[k.key]);
    rows.push([k.label, ...vals.map(conv), conv(vals.reduce((a, b) => a + b, 0))]);
    if (!k.qty) money.add(r);
    if (k.key === 'total') sections.add(r);
  }
  sheets.push({ name: t('report.summary'), rows, sections, money });
  return sheets;
}

const csvCell = (c: Cell) => {
  const s = c === null ? '' : String(c);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** All sheets in one CSV, separated by a blank line. A BOM makes Excel read the Hebrew correctly. */
export const toCsv = (sheets: Sheet[]) => '﻿' + sheets.map((s) => s.rows.map((r) => r.map(csvCell).join(',')).join('\r\n')).join('\r\n\r\n');

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadCsv = (sheets: Sheet[], filename: string) => download(new Blob([toCsv(sheets)], { type: 'text/csv;charset=utf-8' }), filename);

export async function downloadXlsx(sheets: Sheet[], filename: string) {
  const { default: ExcelJS } = await import('exceljs'); // loaded only when someone exports
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const s of sheets) {
    let name = s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${name.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', xSplit: 1, ySplit: 2 }] });
    s.rows.forEach((cells, i) => {
      const row = ws.addRow(cells);
      if (s.sections.has(i)) row.font = { bold: true };
      if (i === 1) {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } };
      }
      if (s.money.has(i)) {
        row.eachCell((c, col) => {
          if (col > 1 && typeof c.value === 'number') c.numFmt = '#,##0.00';
        });
      }
    });
    ws.getColumn(1).width = 34;
    for (let c = 2; c <= (s.rows[1]?.length ?? 2); c++) ws.getColumn(c).width = 16;
  }
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
