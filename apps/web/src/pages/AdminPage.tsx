import { useTranslation } from 'react-i18next';

export default function AdminPage() {
  const { t } = useTranslation();
  return (
    <section className="p-4">
      <h2 className="text-xl font-semibold">{t('admin.title')}</h2>
      <p className="text-slate-400">{t('admin.soon')}</p>
    </section>
  );
}
