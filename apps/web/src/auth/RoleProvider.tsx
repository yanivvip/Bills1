import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

// landlord = owner of an organization; renter = linked to a rental contract; none = brand-new user.
export interface Impersonation {
  sessionId: string;
  mode: 'read_only' | 'full';
  orgName: string;
}
export type Role = { kind: 'landlord'; orgId: string; impersonation?: Impersonation } | { kind: 'renter' } | { kind: 'none' };

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
    // a platform admin who is working inside a landlord's organization (a live "work as" session) acts as that landlord
    const { data: imp } = await supabase
      .from('impersonation_sessions')
      .select('id,org_id,mode,organizations(name)')
      .is('ended_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (imp) {
      const o = (imp as unknown as { organizations: { name: string } | null }).organizations;
      return setRole({ kind: 'landlord', orgId: imp.org_id, impersonation: { sessionId: imp.id, mode: imp.mode as Impersonation['mode'], orgName: o?.name ?? '' } });
    }
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
