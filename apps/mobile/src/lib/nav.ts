import { router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';

// QA-2: router.back() goes wrong in two cases. A screen opened straight from a link, a
// notification or a refresh (every reload of the PWA) has nothing behind it; and a screen opened
// from another tab (Envelopes → Update budgets) sits alone in its tab's stack, where the tab
// navigator's own back picks a tab by its rules (it went to Reports). So the app keeps the
// screens it went through, and goBack returns to the previous one, or to `fallback` if none.
type Place = { pathname: string; params: Record<string, string> };
const trail: Place[] = [];

// In the root layout: records each screen the app moves to.
export function useNavigationMemory() {
  const pathname = usePathname();
  const all = useGlobalSearchParams<Record<string, string>>();
  // route segments ([id], [month]) are already in the path; keep only the query (?id=…)
  const params = Object.fromEntries(Object.entries(all).filter(([, v]) => typeof v === 'string' && !pathname.split('/').includes(v)));
  const key = pathname + JSON.stringify(params);
  useEffect(() => {
    const here = { pathname, params };
    const prev = trail[trail.length - 2];
    if (prev && prev.pathname === pathname && JSON.stringify(prev.params) === JSON.stringify(params)) trail.pop();
    else if (trail[trail.length - 1]?.pathname !== pathname || JSON.stringify(trail[trail.length - 1]?.params) !== JSON.stringify(params)) {
      trail.push(here);
      if (trail.length > 50) trail.shift();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function goBack(fallback: Href) {
  if (router.canDismiss()) return router.back();
  const prev = trail[trail.length - 2];
  if (prev) router.navigate({ pathname: prev.pathname, params: prev.params } as Href);
  else router.replace(fallback);
}
