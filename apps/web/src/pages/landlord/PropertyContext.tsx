import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export interface PropertyOption {
  id: string;
  name: string;
}
interface PropertyState {
  /** null while loading */
  properties: PropertyOption[] | null;
  /** the property chosen in the header: every landlord screen shows this one */
  propertyId: string | undefined;
  select: (id: string) => void;
  reload: () => Promise<void>;
}

const KEY = 'bills.property';
const PropertyContext = createContext<PropertyState>({ properties: null, propertyId: undefined, select: () => {}, reload: async () => {} });
export const useProperty = () => useContext(PropertyContext);

const remembered = () => {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

// The landlord's properties and the one currently chosen (remembered in the browser). Reloaded when the page changes,
// so a property added in the wizard shows up in the header at once.
export function PropertyProvider({ enabled, orgId, children }: { enabled: boolean; orgId?: string; children: ReactNode }) {
  const [properties, setProperties] = useState<PropertyOption[] | null>(null);
  const [chosen, setChosen] = useState<string | undefined>(remembered());
  const { pathname } = useLocation();

  const load = useCallback(async () => {
    // only the landlord's own organization (a platform admin can read the others, but not write to them)
    let q = supabase.from('properties').select('id,name').order('created_at');
    if (orgId) q = q.eq('org_id', orgId);
    const { data } = await q;
    setProperties((data as PropertyOption[]) ?? []);
  }, [orgId]);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load, pathname]);

  const select = (id: string) => {
    setChosen(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // private window: the choice only lasts until the page is closed
    }
  };

  const propertyId = properties?.find((p) => p.id === chosen)?.id ?? properties?.[0]?.id;
  return <PropertyContext.Provider value={{ properties, propertyId, select, reload: load }}>{children}</PropertyContext.Provider>;
}

// The property switcher of the header: a button with the property name; with several properties it opens the list.
const NEW = '__new';

export function PropertySwitcher({ label }: { label: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { properties, propertyId, select } = useProperty();
  if (!properties || properties.length === 0) return <span />;
  return (
    <label className="relative flex h-11 items-center gap-1.5 rounded-xl border border-line bg-card ps-3 pe-2 font-semibold">
      <span className="max-w-[10rem] truncate">{properties.find((p) => p.id === propertyId)?.name}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      <select aria-label={label} value={propertyId} onChange={(e) => (e.target.value === NEW ? navigate('/property/new') : select(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW}>+ {t('landlord.newProperty')}</option>
        </select>
    </label>
  );
}
