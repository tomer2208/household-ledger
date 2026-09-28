import { ColorValue, Platform, TextStyle, useColorScheme } from 'react-native';

import { dark, light, type Palette } from './colors';
import { iosPalette } from './palette';

export { dark, light, type Palette } from './colors';

// Money is the most-read text in the app: rounded numerals, fixed-width digits so columns align.
// iOS maps 'ui-rounded' to SF Pro Rounded; Safari (the PWA) supports it as a CSS generic.
export const moneyText: TextStyle = {
  fontFamily: Platform.select({ ios: 'ui-rounded', web: 'ui-rounded, system-ui, sans-serif', default: undefined }),
  fontVariant: ['tabular-nums'],
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { row: 10, hero: 14, pill: 999 } as const;

export function useColors(): Palette {
  const scheme = useColorScheme();
  if (iosPalette) return iosPalette;
  return scheme === 'dark' ? dark : light;
}

// Budget state color, shared by Overview, category rows and alerts (90% / 100%).
// With `pace` (how far through the month we are, 0-100), running 15+ points ahead of it
// turns the bar orange before the 90% line: you're on course to overspend.
export function budgetTone(pct: number | null | undefined, c: Palette, pace?: number): ColorValue {
  if (pct == null) return c.tint;
  if (pct >= 100) return c.red;
  if (pct >= 90) return c.orange;
  if (pace != null && pct - pace >= 15) return c.orange;
  return c.green;
}
