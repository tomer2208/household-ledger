// T15: a native build updates through the stores; only the web app checks for new builds
// (lib/app-update.web.ts).
export const useUpdateAvailable = () => false;
export function applyUpdate() {}
export const buildLabel = (): string | null => null;
