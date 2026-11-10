import { Platform } from 'react-native';

// iOS opens the keyboard only for a focus that happens inside the tap itself, and the Add
// screen mounts a moment after it. So the tap focuses a hidden number field at once; when the
// field it opens on mounts and takes the focus, the keyboard that's already up stays. The Add
// screen opens on the name (text); with the name already filled in, on the amount (decimal).
export function primeKeyboard(mode: 'text' | 'decimal' = 'text') {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = document.createElement('input');
  el.setAttribute('inputmode', mode);
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  // 16px keeps iOS from zooming in on focus.
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px';
  document.body.appendChild(el);
  el.focus();
  const remove = () => el.remove();
  el.addEventListener('blur', remove, { once: true });
  setTimeout(remove, 3000);
}
