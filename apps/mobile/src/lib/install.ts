// Native builds are always "installed"; install.web.ts answers for the browser.
export const isInstalled = () => true;
export const isIosBrowser = () => false;
