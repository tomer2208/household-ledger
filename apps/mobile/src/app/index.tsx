import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { useHousehold } from '@/api/queries';
import { useSession } from '@/api/session';
import { readSetupPending } from '@/lib/setup';

// "/" is the one route outside every guard, so it picks the right entry itself.
export default function Index() {
  const { session } = useSession();
  const hh = useHousehold();
  // P1-7: a household created on this phone goes through setup before Overview.
  const [setupPending, setSetupPending] = useState<boolean | null>(null);
  useEffect(() => {
    readSetupPending().then(setSetupPending);
  }, []);
  if (!session) return <Redirect href="/sign-in" />;
  if (hh.isLoading || setupPending === null) return null;
  if (!hh.data?.household) return <Redirect href="/onboarding" />;
  return <Redirect href={setupPending ? '/setup' : '/overview'} />;
}
