import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AddToggle, card, input, useWriter } from './shared';

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  units: { id: string; contracts: { id: string; status: string }[] }[];
}

// Landlord root page: the organization and its properties. Properties are added here.
export default function PropertiesPage({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [orgName, setOrgName] = useState('');
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const load = async () => {
    const [{ data: org }, { data: props }] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).single(),
      supabase.from('properties').select('id,name,address,units(id,contracts(id,status))').eq('org_id', orgId).order('created_at'),
    ]);
    setOrgName(org?.name ?? '');
    setRows((props as unknown as PropertyRow[]) ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const { error, run } = useWriter(load);

  if (!rows) return <p className="p-4">{t('common.loading')}</p>;

  return (
    <section className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">{orgName}</h1>
        <h2 className="text-xl font-semibold text-slate-300">{t('landlord.properties')}</h2>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {rows.length === 0 && <p className="text-slate-400">{t('landlord.noProperties')}</p>}

      {rows.map((p) => {
        const rented = p.units.filter((u) => u.contracts.some((c) => c.status === 'active')).length;
        return (
          <Link key={p.id} to={`/properties/${p.id}`} className={card}>
            <strong className="text-lg">{p.name}</strong>
            {p.address && <span className="text-sm text-slate-400">{p.address}</span>}
            <span className="text-sm text-slate-400">
              {t('landlord.unitsCount', { count: p.units.length })} · {t('landlord.rentedCount', { count: rented })}
            </span>
          </Link>
        );
      })}

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
