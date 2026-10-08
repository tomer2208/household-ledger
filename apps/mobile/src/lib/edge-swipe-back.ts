import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isRTL } from './i18n';

// Web (installed on the home screen): iOS gives a web app no swipe-back, so the app draws its
// own. A swipe that starts at the edge the back button sits on (right in Hebrew, left in
// English) and moves inward drags the screen along, and past a third of a thumb's reach it
// goes back. It starts only at the very edge, so swiping an expense row never triggers it.
const EDGE = 24;
const TRIGGER = 90;
// The tabs' own pages have nothing to go back to.
const TAB_ROOTS = ['/', '/overview', '/transactions', '/reports', '/settings'];

export function useEdgeSwipeBack() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.getElementById('root');
    if (!root) return;
    let active = false;
    let claimed = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    // +1 when going back moves the finger right (English), −1 when it moves left (Hebrew).
    const way = () => (isRTL() ? -1 : 1);
    const settle = (to: number, after?: () => void) => {
      root.style.transition = 'transform 180ms ease-out';
      root.style.transform = to ? `translateX(${to}px)` : '';
      setTimeout(() => {
        root.style.transition = '';
        after?.();
      }, 180);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || TAB_ROOTS.includes(window.location.pathname) || !router.canGoBack()) return;
      const x = e.touches[0].clientX;
      if ((isRTL() ? window.innerWidth - x : x) > EDGE) return;
      active = true;
      claimed = false;
      dx = 0;
      startX = x;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const moved = (t.clientX - startX) * way();
      const down = t.clientY - startY;
      if (!claimed) {
        // A scroll, not a swipe: let it be.
        if (Math.abs(down) > 12 && Math.abs(down) > Math.abs(moved)) {
          active = false;
          return;
        }
        if (moved < 10) return;
        claimed = true;
      }
      e.preventDefault();
      dx = Math.max(0, moved);
      root.style.transition = '';
      root.style.transform = `translateX(${dx * way()}px)`;
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (!claimed) return;
      if (dx > TRIGGER) {
        // Off the screen, then back: the previous screen shows in its place.
        settle(window.innerWidth * way(), () => {
          router.back();
          root.style.transform = '';
        });
      } else settle(0);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);
}
