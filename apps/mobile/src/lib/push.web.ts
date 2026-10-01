// Web Push for the installed web app (PWA route). Same exports as push.ts so screens
// don't branch on platform.
//
// iPhone rules (iOS 16.4+): push exists only in the app opened from the Home Screen, and
// the permission prompt must come from a tap. So nothing here asks on its own;
// enableNotifications() runs from the button in Settings.

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';
import { t } from './i18n';

export type PushState = 'unsupported' | 'install-first' | 'off' | 'on' | 'blocked';

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const isIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

function b64urlToBytes(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function save(userId: string, sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.from('web_push_subscriptions').upsert({
    endpoint: sub.endpoint,
    user_id: userId,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent.slice(0, 200),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function currentState(): Promise<PushState> {
  if (isIos() && !standalone()) return 'install-first';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return Notification.permission === 'granted' && sub ? 'on' : 'off';
}

// Must be called from a tap handler.
export async function enableNotifications(userId: string): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const { data: key, error } = await supabase.rpc('web_push_public_key');
  if (error || !key) throw error ?? new Error(t.errors.pushNotReady);
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key as string) }));
  await save(userId, sub);
  return 'on';
}

export async function disableNotifications(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return 'off';
}

export function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  const refresh = useCallback(() => {
    currentState().then(setState, () => setState('unsupported'));
  }, []);
  useEffect(refresh, [refresh]);
  return { state, setState, refresh };
}

// Keeps an existing subscription attached to whoever is signed in on this browser.
// Browsers rotate endpoints now and then; re-saving on launch picks that up. Never prompts.
export function usePushRegistration(userId: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !userId || !supported() || Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => (sub ? save(userId, sub) : undefined))
      .catch((e) => console.warn('Push refresh failed', e));
  }, [userId, enabled]);
}

// A tapped alert: the service worker focuses this window and posts the path to open.
export function useNotificationRouting() {
  useEffect(() => {
    if (!supported()) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-url' && typeof e.data.url === 'string') router.push(e.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
}
