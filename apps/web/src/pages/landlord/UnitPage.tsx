import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { BackLink, ContractCard, ContractForm, useWriter, type Contract } from './shared';

interface UnitInfo {
  id: string;
  name: string;
  property_id: string;
  properties: { name: string } | null;
  contracts: Contract[];
}

// One unit: its active rental contract and renters, plus past contracts.
export default function UnitPage({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const { unitId } = useParams();
  const [unit, setUnit] = useState<UnitInfo | null | undefined>(undefined);

  const load = async () => {
    const { data } = await supabase
      .from('units')
      .select('id,name,property_id,properties(name),contracts(id,start_date,end_date,status,rent_agorot,contract_renters(id,email,full_name,user_id,invited_at,invite_channel))')
      .eq('id', unitId!)
      .maybeSingle();
    setUnit(data as unknown as UnitInfo | null);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const { error, run } = useWriter(load);

  if (unit === undefined) return <p className="p-4">{t('common.loading')}</p>;
  if (!unit) return <p className="p-4">{t('landlord.notFound')}</p>;

  const active = unit.contracts.find((c) => c.status === 'active');
  const past = unit.contracts.filter((c) => c.status === 'ended').sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <section className="flex flex-col gap-4 p-4">
      <BackLink to={`/properties/${unit.property_id}`}>{unit.properties?.name}</BackLink>
      <h1 className="text-2xl font-bold">{unit.name}</h1>
      <h2 className="text-xl font-semibold text-slate-300">{t('landlord.contract')}</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {active ? <ContractCard orgId={orgId} contract={active} run={run} invite={{ property: unit.properties?.name ?? '', unit: unit.name }} /> : <ContractForm orgId={orgId} unitId={unit.id} run={run} />}

      {past.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-slate-300">{t('landlord.history')}</h2>
          {past.map((c) => (
            <div key={c.id} className="rounded-xl bg-white/5 p-3 text-sm text-slate-400">
              {c.start_date} → {c.end_date ?? '…'} · {c.contract_renters.map((r) => r.full_name || r.email).join(', ')}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
