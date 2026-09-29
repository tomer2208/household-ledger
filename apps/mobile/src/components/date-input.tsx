// Native: no system picker is bundled yet (the app ships as a PWA), so DateField falls back to
// a strip of recent days. Swap in @expo/ui's date picker when the iOS build returns.
export const hasSystemDatePicker = false;

export function DateInput(_: { value: string; max: string; onChange: (day: string) => void; label: string }) {
  return null;
}
