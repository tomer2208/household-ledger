// A Hebrew merchant name next to "₪45" inside an LTR UI can visually swallow or flip the
// amount. First-strong isolates keep each piece in its own direction (US-M3 AC3).
export const isolate = (s: string | null | undefined) => `⁨${s ?? ''}⁩`;

const RTL = /[֐-׿؀-ۿ]/;
export const isRtl = (s: string | null | undefined) => RTL.test(s ?? '');
