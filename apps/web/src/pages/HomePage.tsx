import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRole } from '../auth/RoleProvider';
import { supabase } from '../lib/supabase';
import LandlordHome from './landlord/LandlordHome';
import RenterView from './RenterView';

// Root page: what you see depends on your role (landlord, renter, or brand-new user).
export default function HomePage() {
  const { t } = useTranslation();
  const { role, reload } = useRole();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.rpc('create_organization', { p_name: name });
    if (error) return setError(error.message);
    setName('');
    await reload();
  };

  if (!role) return <p className="p-4">{t('common.loading')}</p>;
  if (role.kind === 'landlord') return <LandlordHome orgId={role.orgId} />;
  if (role.kind === 'renter') return <RenterView />;

  return (
    <section className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">{t('home.welcome')}</h2>
      <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
        <p className="text-muted">{t('home.noOrg')}</p>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('home.orgName')}
          className="rounded-lg bg-field px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
        />
        <button className="rounded-lg bg-primary text-white py-2 font-semibold">{t('home.createOrg')}</button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </section>
  );
}
