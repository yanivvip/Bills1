import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

// landlord = owner of an organization; renter = linked to a rental contract; none = brand-new user.
export type Role = { kind: 'landlord'; orgId: string } | { kind: 'renter' } | { kind: 'none' };

interface RoleState {
  role: Role | null; // null while loading
  reload: () => Promise<void>;
}

const RoleContext = createContext<RoleState>({ role: null, reload: async () => {} });
export const useRole = () => useContext(RoleContext);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [role, setRole] = useState<Role | null>(null);

  const reload = useCallback(async () => {
    if (!uid) return;
    // Link any renter invitations sent to this (confirmed) email before checking roles.
    await supabase.rpc('claim_renter_invites');
    const { data: m } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', uid)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    if (m) return setRole({ kind: 'landlord', orgId: m.org_id });
    const { data: r } = await supabase.from('contract_renters').select('id').eq('user_id', uid).limit(1).maybeSingle();
    setRole(r ? { kind: 'renter' } : { kind: 'none' });
  }, [uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <RoleContext.Provider value={{ role, reload }}>{children}</RoleContext.Provider>;
}
