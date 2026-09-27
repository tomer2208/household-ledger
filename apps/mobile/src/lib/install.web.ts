// Web: opened from the Home Screen (standalone) or in a browser tab?
// iOS reports it on navigator.standalone; everyone else through the display-mode query.
export const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export const isIosBrowser = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
