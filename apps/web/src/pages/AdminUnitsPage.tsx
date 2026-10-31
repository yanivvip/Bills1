import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import AdminTabs from './AdminTabs';

interface UnitRow {
  unit_id: string;
  unit_name: string;
  property_name: string;
  org_name: string;
  contract_start: string | null;
  renters: { id: string; email: string; linked: boolean }[];
}

// Super_User only: every unit of every landlord, with its active contract and renters.
export default function AdminUnitsPage() {
  const { t } = useTranslation();
  const [units, setUnits] = useState<UnitRow[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc('admin_list_units');
    if (error) setError(error.message);
    setUnits((data as UnitRow[] | null) ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  const removeRenter = async (u: UnitRow, r: UnitRow['renters'][number]) => {
    if (!window.confirm(t('admin.confirmRemoveRenter', { email: r.email, unit: u.unit_name, property: u.property_name }))) return;
    setBusy(r.id);
    setError('');
    const { error } = await supabase.rpc('admin_remove_renter', { p_renter: r.id });
    setBusy(null);
    if (error) return setError(error.message);
    await load();
  };

  if (!units) return <p className="p-4">{t('common.loading')}</p>;

  const q = filter.trim().toLowerCase();
  const shown = q
    ? units.filter((u) => [u.unit_name, u.property_name, u.org_name, ...u.renters.map((r) => r.email)].some((s) => s.toLowerCase().includes(q)))
    : units;

  return (
    <section className="flex flex-col gap-4 p-4">
      <AdminTabs />
      <div>
        <h1 className="text-2xl font-bold">{t('admin.units')}</h1>
        <p className="text-sm text-slate-400">{t('admin.unitsCount', { count: units.length })}</p>
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t('admin.searchUnits')}
        className="rounded-lg bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}

      {shown.map((u) => (
        <div key={u.unit_id} className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{u.unit_name}</strong>
            <span className="text-sm text-slate-400">
              {u.property_name} · {u.org_name}
            </span>
          </div>
          {u.contract_start ? (
            <>
              <span className="w-fit rounded-full bg-emerald-700 px-2 py-0.5 text-xs">
                {t('admin.rented')} {u.contract_start}
              </span>
              {u.renters.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span dir="ltr">
                    {r.email}
                    {!r.linked && <span className="ms-2 text-xs text-slate-400">({t('landlord.pending')})</span>}
                  </span>
                  <button disabled={busy === r.id} onClick={() => void removeRenter(u, r)} className="rounded-lg bg-red-900/60 px-3 py-1 text-xs font-semibold disabled:opacity-60">
                    {t('admin.removeRenterShort')}
                  </button>
                </div>
              ))}
            </>
          ) : (
            <span className="w-fit rounded-full bg-white/10 px-2 py-0.5 text-xs">{t('landlord.vacant')}</span>
          )}
        </div>
      ))}
      {shown.length === 0 && <p className="text-slate-400">{t('admin.noUnits')}</p>}
    </section>
  );
}
