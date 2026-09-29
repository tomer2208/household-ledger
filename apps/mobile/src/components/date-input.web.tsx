import type { ChangeEvent } from 'react';

// Web: an invisible native <input type="date"> laid over the "Pick date" chip. Tapping it opens
// the system date wheel on iPhone (and the browser's calendar elsewhere), with no library.
export const hasSystemDatePicker = true;

export function DateInput({ value, max, onChange, label }: { value: string; max: string; onChange: (day: string) => void; label: string }) {
  return (
    <input
      type="date"
      value={value}
      max={max}
      aria-label={label}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        // Clearing the field (a "Reset" in some browsers) keeps the current day.
        if (e.target.value && e.target.value <= max) onChange(e.target.value);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        // 16px or larger, or iOS Safari zooms the page on focus.
        fontSize: 16,
        border: 0,
        padding: 0,
        margin: 0,
      }}
    />
  );
}
