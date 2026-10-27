import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  isPlatformAdmin: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, isPlatformAdmin: false });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsPlatformAdmin(false);
      return;
    }
    // RLS only returns your own row, so a hit means you are a super admin.
    void supabase
      .from('platform_admins')
      .select('user_id')
      .maybeSingle()
      .then(({ data }) => setIsPlatformAdmin(!!data));
  }, [session]);

  return <AuthContext.Provider value={{ session, loading, isPlatformAdmin }}>{children}</AuthContext.Provider>;
}
