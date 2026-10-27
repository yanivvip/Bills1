import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface RenterContract {
  id: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'ended';
  units: { name: string; properties: { name: string; address: string | null } | null } | null;
  contract_renters: { email: string; full_name: string | null }[];
}

// Read-only: RLS already limits this to the renter's own contracts.
export default function RenterView() {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<RenterContract[] | null>(null);

  useEffect(() => {
    void supabase
      .from('contracts')
      .select('id,start_date,end_date,status,units(name,properties(name,address)),contract_renters(email,full_name)')
      .order('start_date', { ascending: false })
      .then(({ data }) => setContracts((data as unknown as RenterContract[]) ?? []));
  }, []);

  if (!contracts) return <p className="p-4">{t('common.loading')}</p>;

  return (
    <section className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">{t('renter.title')}</h2>
      {contracts.length === 0 && <p className="text-slate-400">{t('renter.none')}</p>}
      {contracts.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded-2xl bg-white/5 p-4">
          <strong>
            {c.units?.properties?.name} · {c.units?.name}
          </strong>
          {c.units?.properties?.address && <span className="text-sm text-slate-400">{c.units.properties.address}</span>}
          <span className="text-sm">
            {c.start_date} → {c.end_date ?? '…'} ({t(`landlord.status.${c.status}`)})
          </span>
          <span className="text-sm text-slate-400">
            {t('landlord.renters')}: {c.contract_renters.map((r) => r.full_name || r.email).join(', ')}
          </span>
        </div>
      ))}
    </section>
  );
}
