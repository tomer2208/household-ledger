import { Redirect } from 'expo-router';

import { useHousehold } from '@/api/queries';
import { useSession } from '@/api/session';

// "/" is the one route outside every guard, so it picks the right entry itself.
export default function Index() {
  const { session } = useSession();
  const hh = useHousehold();
  if (!session) return <Redirect href="/sign-in" />;
  if (hh.isLoading) return null;
  return <Redirect href={hh.data?.household ? '/overview' : '/onboarding'} />;
}
