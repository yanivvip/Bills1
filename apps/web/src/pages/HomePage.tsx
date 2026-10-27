import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface Org {
  id: string;
  name: string;
}

export default function HomePage() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [name, setName] = useState('');

  const load = async () => {
    const { data } = await supabase.from('organizations').select('id,name').order('created_at');
    setOrgs(data ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('create_organization', { p_name: name });
    if (!error) {
      setName('');
      await load();
    }
  };

  if (!orgs) return <p className="p-4">{t('common.loading')}</p>;

  return (
    <section className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">{t('home.welcome')}</h2>
      {orgs.length === 0 ? (
        <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4">
          <p className="text-slate-400">{t('home.noOrg')}</p>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('home.orgName')}
            className="rounded-lg bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button className="rounded-lg bg-violet-600 py-2 font-semibold">{t('home.createOrg')}</button>
        </form>
      ) : (
        <ul className="flex flex-col gap-2">
          {orgs.map((o) => (
            <li key={o.id} className="rounded-xl bg-white/5 p-3">
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
