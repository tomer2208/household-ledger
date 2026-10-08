import { useEffect, useState } from 'react';

// T15: the Home Screen app can stay open for days on an old build. Each build stamps its id
// into the page (<meta name="app-build">) and into /version.json (scripts/build-web.sh); the
// app compares them when it opens, every half hour, and when it comes back to the front,
// and offers a refresh. It never reloads by itself: that could drop an expense mid-typing.
const EVERY_MS = 30 * 60 * 1000;

const ownBuild = () => document.querySelector('meta[name="app-build"]')?.getAttribute('content') ?? null;

// The build this page came from, as the time it was built ("08.10 11:42", local time), shown at
// the foot of Settings so it's easy to tell whether a new version has reached the phone.
export function buildLabel(): string | null {
  const b = ownBuild();
  if (!b || b === '__BUILD__') return 'dev';
  const m = b.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return b;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

async function latestBuild(): Promise<string | null> {
  try {
    // Unique URL + no-store: neither the browser nor an older service worker answers from a cache.
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const v = (await res.json()) as { build?: unknown };
    return typeof v.build === 'string' ? v.build : null;
  } catch {
    return null; // offline: try again later
  }
}

export function useUpdateAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const own = ownBuild();
    // The dev server serves the page unstamped; there is nothing to compare.
    if (!own || own === '__BUILD__') return;
    let stopped = false;
    const check = async () => {
      // Lets the browser fetch a new service worker too, so the refresh starts from the new shell.
      navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
      const latest = await latestBuild();
      if (!stopped && latest && latest !== own) setAvailable(true);
    };
    check();
    const timer = setInterval(check, EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return available;
}

// Same URL: pages are fetched network-first, so the reload loads the new build.
export function applyUpdate() {
  window.location.reload();
}
