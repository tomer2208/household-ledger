import { ColorValue, TextStyle } from 'react-native';

import { dark, light, type Palette } from './colors';
import { iosPalette } from './palette';
import { envelope, fontFamily } from './tokens';
import { useScheme } from './appearance';

export { dark, light, type Palette } from './colors';
export * as tokens from './tokens';

// Money is the most-read text in the app: Rubik with fixed-width digits, so columns align.
// F7: a bundled font on every platform. 'ui-rounded' only ever worked in Safari (D1).
export const moneyText: TextStyle = {
  fontFamily: fontFamily.money,
  fontVariant: ['tabular-nums'],
};

/** @deprecated F4 scale: `tokens.space` (1-10). Moves over component by component in K2. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** @deprecated F4 scale: `tokens.radius`. Moves over component by component in K2. */
export const radius = { row: 10, hero: 14, pill: 999 } as const;

export function useColors(): Palette {
  const scheme = useScheme();
  if (iosPalette) return iosPalette;
  return scheme === 'dark' ? dark : light;
}

// Budget state colour, shared by every screen that shows a budget. K1: the envelope's three
// states (lib/envelope): fine takes no status colour, close to the limit from 80%, over past it.
// Pace no longer colours anything; it's said in words where it matters (runsOutOn).
export function budgetTone(pct: number | null | undefined, c: Palette): ColorValue {
  if (pct == null) return c.tint;
  if (pct > 100) return c.red;
  if (pct >= envelope.closeAt) return c.orange;
  return c.text;
}
