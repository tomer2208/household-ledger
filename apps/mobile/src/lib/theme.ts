import { ColorValue, useColorScheme } from 'react-native';

import { iosPalette } from './palette';

// On iOS every color is a system semantic color, so light/dark, increased contrast and
// the grouped-list look match Settings exactly. Web/Android get close hex equivalents.
export type Palette = {
  label: ColorValue;
  secondaryLabel: ColorValue;
  tertiaryLabel: ColorValue;
  background: ColorValue;
  groupedBackground: ColorValue;
  cell: ColorValue;
  separator: ColorValue;
  fill: ColorValue;
  tint: ColorValue;
  green: ColorValue;
  orange: ColorValue;
  red: ColorValue;
};



const light: Palette = {
  label: '#000000',
  secondaryLabel: 'rgba(60,60,67,0.6)',
  tertiaryLabel: 'rgba(60,60,67,0.3)',
  background: '#ffffff',
  groupedBackground: '#f2f2f7',
  cell: '#ffffff',
  separator: 'rgba(60,60,67,0.29)',
  fill: 'rgba(118,118,128,0.12)',
  tint: '#007aff',
  green: '#34c759',
  orange: '#ff9500',
  red: '#ff3b30',
};

const dark: Palette = {
  label: '#ffffff',
  secondaryLabel: 'rgba(235,235,245,0.6)',
  tertiaryLabel: 'rgba(235,235,245,0.3)',
  background: '#000000',
  groupedBackground: '#000000',
  cell: '#1c1c1e',
  separator: 'rgba(84,84,88,0.6)',
  fill: 'rgba(118,118,128,0.24)',
  tint: '#0a84ff',
  green: '#30d158',
  orange: '#ff9f0a',
  red: '#ff453a',
};

export function useColors(): Palette {
  const scheme = useColorScheme();
  if (iosPalette) return iosPalette;
  return scheme === 'dark' ? dark : light;
}

// Budget state color, shared by Overview, category rows and alerts (90% / 100%).
export function budgetTone(pct: number | null | undefined, c: Palette): ColorValue {
  if (pct == null) return c.tint;
  if (pct >= 100) return c.red;
  if (pct >= 90) return c.orange;
  return c.green;
}
