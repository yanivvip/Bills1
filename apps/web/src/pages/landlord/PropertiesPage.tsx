import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { ChevronIcon, PlusIcon } from '../../components/NavIcons';
import { AddToggle, input, useWriter } from './shared';
import { useProperty } from './PropertyContext';

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  units: { id: string; name: string; contracts: { id: string; status: string; end_date: string | null; contract_renters: { email: string; full_name: string | null; user_id: string | null }[] }[] }[];
}

// The "Property" tab: the organization and its properties (added here), and the reports. Settings live on each property.
export default function PropertiesPage({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [orgName, setOrgName] = useState('');
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const load = async () => {
    const [{ data: org }, { data: props }] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).single(),
      supabase.from('properties').select('id,name,address,units(id,name,contracts(id,status,end_date,contract_renters(email,full_name,user_id)))').eq('org_id', orgId).order('created_at'),
    ]);
    setOrgName(org?.name ?? '');
    setRows((props as unknown as PropertyRow[]) ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const { reload: reloadProperties } = useProperty();
  const { error, run } = useWriter(async () => {
    await load();
    await reloadProperties();
  });

  if (!rows) return <p className="p-4">{t('common.loading')}</p>;

  const chevron = (
    <span className="text-muted rtl:rotate-0">
      <ChevronIcon />
    </span>
  );
  const rowCls = 'flex min-h-[58px] w-full items-center gap-3 border-t border-line-soft bg-card px-4 py-2.5 text-start first:border-t-0';
  const Title = ({ children }: { children: ReactNode }) => <div className="mx-1 mb-2 mt-1.5 text-sm font-medium text-muted">{children}</div>;
  const group = 'overflow-hidden rounded-[18px] border border-line bg-card';

  return (
    <section className="flex flex-col gap-3.5 px-[18px] pb-4 pt-1">
      {error && <p className="text-sm text-danger">{error}</p>}
      {rows.length === 0 && (
        <div>
          <h1 className="text-2xl font-semibold">{orgName}</h1>
          <p className="text-muted">{t('landlord.noProperties')}</p>
        </div>
      )}

      {rows.map((p) => {
        const meta = [p.units.length > 0 ? t('landlord.unitsCount', { count: p.units.length }) : null, p.address].filter(Boolean).join(' · ');
        return (
          <div key={p.id} className="flex flex-col gap-3.5">
            <div>
              <h1 className="text-2xl font-semibold">{p.name}</h1>
              {meta && <div className="mt-0.5 text-sm text-muted">{meta}</div>}
            </div>

            <div>
              <Title>{t('landlord.units')}</Title>
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
                  <span className="flex-1">{t('landlord.addUnit')}</span>
                </Link>
              </div>
            </div>

            <div>
              <Title>{t('landlord.settingsTitle')}</Title>
              <div className={group}>
                <Link to={`/properties/${p.id}`} className={rowCls}>
                  <span className="flex-1">
                    {t('landlord.tariffsAndMeters')}
                    <span className="mt-0.5 block text-[13px] text-muted">{t('landlord.tariffsAndMetersHint')}</span>
                  </span>
                  {chevron}
                </Link>
                <Link to="/bills" className={rowCls}>
                  <span className="flex-1">
                    {t('landlord.extraCharges')}
                    <span className="mt-0.5 block text-[13px] text-muted">{t('landlord.extraChargesHint')}</span>
                  </span>
                  {chevron}
                </Link>
              </div>
            </div>
          </div>
        );
      })}

      <div>
        <Title>{t('landlord.general')}</Title>
        <div className={group}>
          <Link to="/reports" className={rowCls}>
            <span className="flex-1">
              {t('nav.reports')}
              <span className="mt-0.5 block text-[13px] text-muted">{t('landlordHome.reportsHint')}</span>
            </span>
            {chevron}
          </Link>
          <button type="button" onClick={() => void supabase.auth.signOut()} className={rowCls}>
            <span className="flex-1 text-start">{t('auth.signOut')}</span>
          </button>
          <Link to="/property/new" className={rowCls}>
            <span className="text-primary-dark">
              <PlusIcon />
            </span>
            <span className="flex-1">{t('onboarding.start')}</span>
          </Link>
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
