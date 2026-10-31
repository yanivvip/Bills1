import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

interface UserRow {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  is_super_user: boolean;
  org_name: string | null;
  renter_contracts: number;
  renter_units: RenterUnit[];
}

interface RenterUnit {
  id: string;
  unit: string;
  property: string;
  org: string;
}

const badge = 'rounded-full px-2 py-0.5 text-xs';

// Super_User only (route-guarded, and every RPC re-checks on the server).
export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id;
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) setError(error.message);
    setUsers((data as UserRow[] | null) ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  const toggle = async (u: UserRow) => {
    const next = !u.is_super_user;
    if (!window.confirm(t(next ? 'admin.confirmGrant' : 'admin.confirmRevoke', { email: u.email }))) return;
    setBusyId(u.user_id);
    setError('');
    const { error } = await supabase.rpc('admin_set_super_user', { p_user: u.user_id, p_value: next });
    setBusyId(null);
    if (error) return setError(error.message);
    await load();
  };

  const removeRenter = async (u: UserRow, r: RenterUnit) => {
    if (!window.confirm(t('admin.confirmRemoveRenter', { email: u.email, unit: r.unit, property: r.property }))) return;
    setBusyId(u.user_id);
    setError('');
    const { error } = await supabase.rpc('admin_remove_renter', { p_renter: r.id });
    setBusyId(null);
    if (error) return setError(error.message);
    await load();
  };

  if (!users) return <p className="p-4">{t('common.loading')}</p>;

  const q = filter.trim().toLowerCase();
  const shown = q ? users.filter((u) => u.email.toLowerCase().includes(q)) : users;
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language) : '—');

  return (
    <section className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">{t('admin.users')}</h1>
        <p className="text-sm text-slate-400">{t('admin.usersCount', { count: users.length })}</p>
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t('admin.search')}
        className="rounded-lg bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}

      {shown.map((u) => (
        <div key={u.user_id} className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong dir="ltr">{u.email}</strong>
            {u.user_id === me && <span className={`${badge} bg-white/10`}>{t('admin.you')}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {u.is_super_user && <span className={`${badge} bg-violet-600`}>Super_User</span>}
            {u.org_name && <span className={`${badge} bg-emerald-700`}>{t('admin.landlord')}: {u.org_name}</span>}
            {u.renter_contracts > 0 && <span className={`${badge} bg-sky-700`}>{t('admin.renter')}</span>}
            {!u.email_confirmed && <span className={`${badge} bg-amber-700`}>{t('admin.unconfirmed')}</span>}
          </div>
          <div className="text-xs text-slate-400">
            {t('admin.created')}: {fmt(u.created_at)} · {t('admin.lastSignIn')}: {fmt(u.last_sign_in_at)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busyId === u.user_id}
              onClick={() => void toggle(u)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${u.is_super_user ? 'bg-white/10' : 'bg-violet-600'}`}
            >
              {u.is_super_user ? t('admin.removeSuper') : t('admin.makeSuper')}
            </button>
            {u.renter_units.map((r) => (
              <button
                key={r.id}
                disabled={busyId === u.user_id}
                onClick={() => void removeRenter(u, r)}
                className="rounded-lg bg-red-900/60 px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
              >
                {t('admin.removeRenter', { unit: r.unit, property: r.property })}
              </button>
            ))}
          </div>
        </div>
      ))}
      {shown.length === 0 && <p className="text-slate-400">{t('admin.noUsers')}</p>}
    </section>
  );
}
