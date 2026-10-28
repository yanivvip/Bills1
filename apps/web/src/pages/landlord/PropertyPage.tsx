import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import MetersSection from './MetersSection';
import { AddToggle, BackLink, card, input, useWriter } from './shared';

interface UnitRow {
  id: string;
  name: string;
  contracts: { id: string; status: string; contract_renters: { email: string; full_name: string | null }[] }[];
}
interface PropertyInfo {
  id: string;
  name: string;
  address: string | null;
}

// One property: its units. Units are added here.
export default function PropertyPage({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const { propertyId } = useParams();
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [units, setUnits] = useState<UnitRow[] | null>(null);
  const [name, setName] = useState('');

  const load = async () => {
    const [{ data: p }, { data: u }] = await Promise.all([
      supabase.from('properties').select('id,name,address').eq('id', propertyId!).maybeSingle(),
      supabase.from('units').select('id,name,contracts(id,status,contract_renters(email,full_name))').eq('property_id', propertyId!).order('created_at'),
    ]);
    setProperty(p);
    setUnits((u as unknown as UnitRow[]) ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const { error, run } = useWriter(load);

  if (!units) return <p className="p-4">{t('common.loading')}</p>;
  if (!property) return <p className="p-4">{t('landlord.notFound')}</p>;

  return (
    <section className="flex flex-col gap-4 p-4">
      <BackLink to="/">{t('landlord.properties')}</BackLink>
      <div>
        <h1 className="text-2xl font-bold">{property.name}</h1>
        {property.address && <div className="text-slate-400">{property.address}</div>}
      </div>
      <h2 className="text-xl font-semibold text-slate-300">{t('landlord.units')}</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {units.length === 0 && <p className="text-slate-400">{t('landlord.noUnits')}</p>}

      {units.map((u) => {
        const active = u.contracts.find((c) => c.status === 'active');
        return (
          <Link key={u.id} to={`/units/${u.id}`} className={card}>
            <strong className="text-lg">{u.name}</strong>
            <span className="text-sm text-slate-400">
              {active
                ? `${t('landlord.rentedBy')}: ${active.contract_renters.map((r) => r.full_name || r.email).join(', ')}`
                : t('landlord.vacant')}
            </span>
          </Link>
        );
      })}

      <AddToggle
        label={t('landlord.addUnit')}
        title={t('landlord.newUnit')}
        onSubmit={async () => {
          const ok = await run(supabase.from('units').insert({ org_id: orgId, property_id: propertyId!, name: name.trim() }));
          if (ok) setName('');
          return ok;
        }}
      >
        <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('landlord.unitName')} className={input} />
      </AddToggle>

      <MetersSection orgId={orgId} propertyId={propertyId!} unitId={null} />
    </section>
  );
}
