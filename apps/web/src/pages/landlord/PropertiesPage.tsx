import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { BoltIcon, ChevronIcon, DropIcon, LinesIcon, PlusIcon } from '../../components/NavIcons';
import { AddToggle, input, useWriter } from './shared';
import { useProperty } from './PropertyContext';
import { formatMoney, rateToShekels } from '../../lib/money';

interface Tariff {
  property_id: string;
  electricity_rate: number;
  electricity_fixed: number;
  water_rate_a: number;
  water_rate_b: number;
  water_fixed: number;
  sewage_rate: number;
  property_tax_every: number;
  updated_at: string | null;
}
interface UnitRow {
  id: string;
  name: string;
  property_tax_agorot: number | null;
  community_fee_agorot: number | null;
  contracts: { id: string; status: string; end_date: string | null; contract_renters: { email: string; full_name: string | null; user_id: string | null }[] }[];
}
interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  units: UnitRow[];
}

const chevron = (
  <span className="text-muted">
    <ChevronIcon />
  </span>
);
const rowCls = 'flex min-h-[58px] w-full items-center gap-3 border-t border-line-soft bg-card px-4 py-2.5 text-start first:border-t-0';
const group = 'overflow-hidden rounded-[18px] border border-line bg-card';
const Title = ({ children, end }: { children: ReactNode; end?: ReactNode }) => (
  <div className="mx-1 mb-2 mt-1.5 flex items-center justify-between text-sm font-medium text-muted">
    <span>{children}</span>
    {end && <span className="font-normal">{end}</span>}
  </div>
);
const Square = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] ${tone}`}>{children}</span>;

// The "Property" tab, as one settings list for the property chosen in the header: units and renters, tariffs,
// extra charges and the general items.
export default function PropertiesPage({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const [orgName, setOrgName] = useState('');
  const [tariffs, setTariffs] = useState<Record<string, Tariff>>({});
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const { propertyId, reload: reloadProperties } = useProperty();

  const load = async () => {
    const [{ data: org }, { data: props }, { data: tar }] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).single(),
      supabase.from('properties').select('id,name,address,units(id,name,property_tax_agorot,community_fee_agorot,contracts(id,status,end_date,contract_renters(email,full_name,user_id)))').eq('org_id', orgId).order('created_at'),
      supabase.from('tariffs').select('property_id,electricity_rate,electricity_fixed,water_rate_a,water_rate_b,water_fixed,sewage_rate,property_tax_every,updated_at'),
    ]);
    setTariffs(Object.fromEntries(((tar ?? []) as Tariff[]).map((x) => [x.property_id, x])));
    setOrgName(org?.name ?? '');
    setRows((props as unknown as PropertyRow[]) ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const { error, run } = useWriter(async () => {
    await load();
    await reloadProperties();
  });

  if (!rows) return <p className="p-4">{t('common.loading')}</p>;
  const p = rows.find((x) => x.id === propertyId) ?? rows[0];
  const tariff = p ? tariffs[p.id] : undefined;
  const sum = (pick: (u: UnitRow) => number | null) => (p ? p.units.reduce((s, u) => s + Number(pick(u) ?? 0), 0) : 0);
  const taxTotal = sum((u) => u.property_tax_agorot);
  const feeTotal = sum((u) => u.community_fee_agorot);

  return (
    <section className="flex flex-col gap-3.5 px-[18px] pb-4 pt-1">
      {error && <p className="text-sm text-danger">{error}</p>}
      {!p && (
        <div>
          <h1 className="text-2xl font-semibold">{orgName}</h1>
          <p className="text-muted">{t('landlord.noProperties')}</p>
        </div>
      )}

      {p && (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <div className="mt-0.5 text-sm text-muted">{[p.address, t('landlord.unitsCount', { count: p.units.length })].filter(Boolean).join(' · ')}</div>
          </div>

          <div>
            <Title>{t('landlord.unitsAndRenters')}</Title>
            <div className={group}>
              {p.units.map((u) => {
                const active = u.contracts.find((c) => c.status === 'active');
                const renters = active?.contract_renters ?? [];
                const connected = renters.some((r) => r.user_id);
                return (
                  <Link key={u.id} to={`/units/${u.id}`} className={rowCls}>
                    <span className="flex-1">
                      <span className="block">{u.name}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {renters.length > 0 ? renters.map((r) => r.full_name || r.email).join(', ') : t('landlord.vacant')}
                        {active?.end_date ? ` · ${t('renterHome.contractUntil', { date: active.end_date })}` : ''}
                      </span>
                    </span>
                    {renters.length > 0 &&
                      (connected ? (
                        <span className="inline-flex h-[26px] items-center rounded-full bg-primary-soft px-2.5 text-[13px] font-medium text-primary-dark">{t('landlord.connected')}</span>
                      ) : (
                        <span className="inline-flex h-[26px] items-center rounded-full bg-warn-soft px-2.5 text-[13px] font-medium text-warn">{t('landlord.inviteSent')}</span>
                      ))}
                    {chevron}
                  </Link>
                );
              })}
              <Link to={`/properties/${p.id}`} className={rowCls}>
                <span className="text-primary-dark">
                  <PlusIcon />
                </span>
                <span className="flex-1 text-primary-dark">{t('landlord.addUnit')}</span>
              </Link>
            </div>
          </div>

          {tariff && (
            <div>
              <Title end={tariff.updated_at ? `${t('landlord.updatedOn')} ${new Date(tariff.updated_at).toLocaleDateString(i18n.language)}` : undefined}>{t('landlord.tariffs')}</Title>
              <div className={group}>
                {(
                  [
                    ['electricity', <BoltIcon />, 'bg-[#fdf3e1] text-[#9a5b00]', Number(tariff.electricity_fixed), `₪${rateToShekels(Number(tariff.electricity_rate))} ${t('landlord.perKwh')}`],
                    ['water', <DropIcon />, 'bg-[#e6f0fa] text-[#2b6cb0]', Number(tariff.water_fixed), `₪${rateToShekels(Number(tariff.water_rate_a))} · ₪${rateToShekels(Number(tariff.water_rate_b))}`],
                    ['sewage', <LinesIcon />, 'bg-[#e6f0fa] text-[#2b6cb0]', 0, `₪${rateToShekels(Number(tariff.sewage_rate))} ${t('landlord.perM3')}`],
                  ] as const
                ).map(([kind, icon, tone, fixed, value]) => (
                  <Link key={kind} to={`/properties/${p.id}`} className={rowCls}>
                    <Square tone={tone}>{icon}</Square>
                    <span className="flex-1">
                      {t(kind === 'sewage' ? 'tariff.sewageShort' : `meters.${kind}`)}
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {fixed > 0 ? t('landlord.fixedPerMonth', { amount: formatMoney(fixed) }) : kind === 'sewage' ? t('landlord.byWater') : ''}
                      </span>
                    </span>
                    <span className="text-[15px] text-[#3e4643]">{value}</span>
                    {chevron}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div>
            <Title>{t('landlord.extraCharges')}</Title>
            <div className={group}>
              {taxTotal > 0 && (
                <Link to={`/properties/${p.id}`} className={rowCls}>
                  <span className="flex-1">
                    {t('landlord.propertyTax')}
                    <span className="mt-0.5 block text-[13px] text-muted">{tariff?.property_tax_every === 2 ? t('landlord.bimonthly') : t('landlord.monthly')} · {t('landlord.allUnits')}</span>
                  </span>
                  <span className="text-[15px] text-[#3e4643]">{formatMoney(taxTotal)}</span>
                  {chevron}
                </Link>
              )}
              {feeTotal > 0 && (
                <Link to={`/properties/${p.id}`} className={rowCls}>
                  <span className="flex-1">
                    {t('landlord.communityFee')}
                    <span className="mt-0.5 block text-[13px] text-muted">{t('landlord.monthly')} · {t('landlord.allUnits')}</span>
                  </span>
                  <span className="text-[15px] text-[#3e4643]">{formatMoney(feeTotal)}</span>
                  {chevron}
                </Link>
              )}
              <Link to="/bills" className={rowCls}>
                <span className="text-primary-dark">
                  <PlusIcon />
                </span>
                <span className="flex-1 text-primary-dark">
                  {t('landlord.addCharge')}
                  <span className="mt-0.5 block text-[13px] font-normal text-muted">{t('landlord.addChargeHint')}</span>
                </span>
              </Link>
            </div>
          </div>
        </>
      )}

      <div>
        <Title>{t('landlord.general')}</Title>
        <div className={group}>
          {p && (
            <Link to={`/properties/${p.id}`} className={rowCls}>
              <span className="flex-1">{t('landlord.tariffsAndMeters')}</span>
              {chevron}
            </Link>
          )}
          <Link to="/reports" className={rowCls}>
            <span className="flex-1">
              {t('nav.reports')}
              <span className="mt-0.5 block text-[13px] text-muted">{t('landlordHome.reportsHint')}</span>
            </span>
            {chevron}
          </Link>
          <Link to="/property/new" className={rowCls}>
            <span className="text-primary-dark">
              <PlusIcon />
            </span>
            <span className="flex-1 text-primary-dark">{t('onboarding.start')}</span>
          </Link>
          <button type="button" onClick={() => void supabase.auth.signOut()} className={rowCls}>
            <span className="flex-1 text-start">{t('auth.signOut')}</span>
          </button>
        </div>
      </div>

      <AddToggle
        label={t('landlord.addProperty')}
        title={t('landlord.newProperty')}
        onSubmit={async () => {
          const ok = await run(supabase.from('properties').insert({ org_id: orgId, name: name.trim(), address: address.trim() || null }));
          if (ok) {
            setName('');
            setAddress('');
          }
          return ok;
        }}
      >
        <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('landlord.propertyName')} className={input} />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('landlord.address')} className={input} />
      </AddToggle>
    </section>
  );
}
