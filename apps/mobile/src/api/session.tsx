import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';

type Ctx = { session: Session | null; loading: boolean };
const SessionContext = createContext<Ctx>({ session: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Ctx>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Another person's cached household must never flash after a sign-out.
      if (event === 'SIGNED_OUT') queryClient.clear();
      setState({ session, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
