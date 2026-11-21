import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Tab bar shared by the Super_User management pages.
export default function AdminTabs() {
  const { t } = useTranslation();
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-4 py-1.5 text-sm font-semibold ${isActive ? 'bg-primary text-white' : 'bg-field'}`;
  return (
    <div className="flex gap-2">
      <NavLink to="/admin" end className={tab}>
        {t('admin.users')}
      </NavLink>
      <NavLink to="/admin/units" className={tab}>
        {t('admin.units')}
      </NavLink>
    </div>
  );
}
