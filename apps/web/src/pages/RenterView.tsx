import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { monthlyUsage, summarizeUsage } from '@bills/engine';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatMoney } from '../lib/money';
import { BoltIcon, CalendarIcon, ChevronIcon, DropIcon, GaugeIcon } from '../components/NavIcons';
import { monthLabel, monthStart, shiftMonth } from '../lib/period';

interface RenterContract {
  id: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'ended';
  units: { id: string; name: string; properties: { name: string; address: string | null } | null } | null;
  contract_renters: { email: string; full_name: string | null }[];
}
interface Meter {
  id: string;
  unit_id: string | null;
  kind: 'electricity' | 'water';
  name: string;
}
interface Reading {
  meter_id: string;
  period: string;
  value: number;
}
interface LastBill {
  id: string;
  period: string;
  total_agorot: number;
  paid_agorot: number;
}

// The renter's home page: a prompt to report the meters, the latest bill, how much they used and their contract.
// RLS already limits everything here to the renter's own contracts, unit meters and bills.
export default function RenterView() {
  const { t, i18n } = useTranslation();
  const [contracts, setContracts] = useState<RenterContract[] | null>(null);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [bill, setBill] = useState<LastBill | null>(null);
  const { session } = useAuth();
  const email = session?.user.email;
  const period = monthStart();

  useEffect(() => {
    void Promise.all([
      supabase.from('contracts').select('id,start_date,end_date,status,units(id,name,properties(name,address)),contract_renters(email,full_name)').order('start_date', { ascending: false }),
      supabase.from('meters').select('id,unit_id,kind,name'),
      supabase.from('readings').select('meter_id,period,value').gte('period', shiftMonth(period, -5)),
      supabase.from('statements').select('id,period,total_agorot,paid_agorot').order('period', { ascending: false }).limit(1),
    ]).then(([c, m, r, s]) => {
      setContracts((c.data as unknown as RenterContract[]) ?? []);
      setMeters((m.data as Meter[]) ?? []);
      setReadings(((r.data ?? []) as Reading[]).map((x) => ({ ...x, value: Number(x.value) })));
      const last = ((s.data ?? []) as LastBill[])[0];
      setBill(last ? { ...last, total_agorot: Number(last.total_agorot), paid_agorot: Number(last.paid_agorot) } : null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!contracts) return <p className="p-4">{t('common.loading')}</p>;

  const active = contracts.find((c) => c.status === 'active');
  const money = (a: number) => formatMoney(a, i18n.language);
  const attention = meters.map((x) => ({ id: x.id, unitId: x.unit_id, kind: x.kind, name: x.name }));
  const feed = readings.map((x) => ({ meterId: x.meter_id, period: x.period, value: x.value }));
  const missing = meters.filter((m) => !readings.some((r) => r.meter_id === m.id && r.period === period));

  // the last month that has a usage figure, and how it compares with the three months before it
  const usageTile = (kind: 'electricity' | 'water') => {
    if (!meters.some((m) => m.kind === kind)) return null;
    const months = [-5, -4, -3, -2, -1, 0].map((d) => shiftMonth(period, d));
    let series = monthlyUsage({ months, kind, scope: { type: 'property' }, meters: attention, readings: feed });
    let end = months;
    if (series[5] === undefined) {
      end = months.map((p) => shiftMonth(p, -1));
      series = monthlyUsage({ months: end, kind, scope: { type: 'property' }, meters: attention, readings: feed });
    }
    const last = series[5];
    if (last === undefined) return null;
    const pct = summarizeUsage(series).changePct;
    return (
      <div key={kind} className="flex flex-1 flex-col gap-1 rounded-[14px] border border-line bg-card p-3">
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <span className={kind === 'water' ? 'text-info' : 'text-warn'}>{kind === 'water' ? <DropIcon /> : <BoltIcon />}</span>
          {t(`meters.${kind}`)} · {new Date(`${end[5]}T00:00:00`).toLocaleDateString(i18n.language, { month: 'long' })}
        </span>
        <strong className="text-[19px] font-semibold" dir="ltr">
          {Math.round(last * 10) / 10} {kind === 'water' ? t('bills.m3') : t('bills.kwh')}
        </strong>
        {pct !== undefined && Math.abs(pct) >= 5 && (
          <span className={`text-xs ${pct > 0 ? 'text-warn' : 'text-ok'}`}>
            {pct > 0 ? '↑' : '↓'} {t('renterHome.vsBefore', { pct: Math.round(Math.abs(pct)) })}
          </span>
        )}
      </div>
    );
  };

  const owed = bill ? bill.total_agorot - bill.paid_agorot : 0;
  const me = (email ?? '').toLowerCase();
  const mine = active?.contract_renters.find((r) => r.email.toLowerCase() === me);
  const myName = mine?.full_name || (email ?? '').split('@')[0] || '';

  return (
    <section className="flex flex-col gap-3.5 px-[18px] pb-4 pt-2.5">
      <header className="flex items-start justify-between gap-3">
        <div>
          {active && (
            <div className="text-[15px] text-muted">
              {active.units?.name} · {active.units?.properties?.name}
            </div>
          )}
          <h1 className="mt-0.5 text-[28px] font-semibold leading-tight">{active ? t('renterHome.hello', { name: myName }) : t('renter.title')}</h1>
        </div>
        <img src="/favicon.svg" alt="" width={48} height={48} className="flex-none" />
      </header>
      {contracts.length === 0 && <p className="text-muted">{t('renter.none')}</p>}

      {active && meters.length > 0 &&
        (missing.length > 0 ? (
          <section className="flex flex-col gap-3.5 rounded-[22px] bg-primary p-5 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                <GaugeIcon />
              </span>
              <span className="text-sm opacity-90">{new Date(`${period}T00:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' })}</span>
            </div>
            <h2 className="text-[22px] font-semibold leading-tight">{t('renterHome.timeToReport')}</h2>
            <p className="text-[15px] leading-normal opacity-90">{t('renterHome.timeToReportBody', { count: missing.length })}</p>
            <Link to="/report" className="flex h-[52px] items-center justify-center rounded-[14px] bg-white text-[17px] font-semibold text-primary-dark">
              {t('renterHome.reportNow')}
            </Link>
          </section>
        ) : (
          <p className="rounded-[18px] bg-primary-soft p-3.5 text-[15px] text-primary-dark">✓ {t('renterHome.reported', { month: monthLabel(period, i18n.language) })}</p>
        ))}

      {bill && (
        <Link to="/my-bill" className="flex items-center justify-between gap-3 rounded-[18px] border border-line bg-card p-4">
          <span className="flex flex-col">
            <span className="text-sm text-muted">
              {t('renterHome.lastBill')} · {monthLabel(bill.period, i18n.language)}
            </span>
            <strong className="mt-0.5 text-[28px] font-semibold" dir="ltr">
              {money(bill.total_agorot)}
            </strong>
            <span className={`mt-0.5 text-[13px] ${owed <= 0 ? 'text-primary-dark' : bill.paid_agorot > 0 ? 'text-info' : 'text-warn'}`}>
              {owed <= 0 ? `✓ ${t('bills.paid')}` : bill.paid_agorot > 0 ? t('bills.partlyPaid') : t('bills.unpaid')}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[15px] font-medium text-primary-dark">
            {t('renterHome.toDetails')}
            <ChevronIcon />
          </span>
        </Link>
      )}

      {(usageTile('electricity') || usageTile('water')) && (
        <div className="flex gap-3">
          {usageTile('electricity')}
          {usageTile('water')}
        </div>
      )}

      {active && (
        <p className="flex items-center gap-3 rounded-[18px] border border-line bg-card px-4 py-3.5 text-[15px]">
          <span className="text-muted">
            <CalendarIcon />
          </span>
          <span>
          {active.end_date ? t('renterHome.contractUntil', { date: active.end_date }) : t('renterHome.contractOpen', { date: active.start_date })}
          {' · '}
          {t('landlord.renters')}: {active.contract_renters.map((r) => r.full_name || r.email).join(', ')}
          </span>
        </p>
      )}

      <button type="button" className="mt-2 self-center rounded-xl px-4 py-2 text-sm text-muted" onClick={() => void supabase.auth.signOut()}>
        {t('auth.signOut')}
      </button>

      {contracts.filter((c) => c.status === 'ended').length > 0 && (
        <details className="text-sm text-muted">
          <summary>{t('renterHome.earlierContracts')}</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {contracts
              .filter((c) => c.status === 'ended')
              .map((c) => (
                <li key={c.id}>
                  {c.units?.properties?.name} · {c.units?.name} · {c.start_date} → {c.end_date ?? '…'}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
