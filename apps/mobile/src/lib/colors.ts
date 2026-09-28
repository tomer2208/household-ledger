import type { ColorValue } from 'react-native';

// FinPace palette (docs/DESIGN_PLAN.md §3.1): Pace Teal on cool ink/gray. Status colors are
// a shade darker than iOS's so "₪120 left" passes 4.5:1 on white. On iOS the neutrals stay
// system semantic colors (palette.ios.ts); tint and status use these same hex values.
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
  // Text/icons drawn on a tint background (white on teal, dark ink on the bright dark-mode teal).
  onTint: ColorValue;
  // Soft teal wash behind category icons.
  tintFill: ColorValue;
  green: ColorValue;
  orange: ColorValue;
  red: ColorValue;
  // Where spending "should" be today, drawn across budget bars.
  paceMarker: ColorValue;
};

export const light: Palette = {
  label: '#0F1B24',
  secondaryLabel: 'rgba(15,27,36,0.62)',
  tertiaryLabel: 'rgba(15,27,36,0.32)',
  background: '#FFFFFF',
  groupedBackground: '#F2F5F4',
  cell: '#FFFFFF',
  separator: 'rgba(15,27,36,0.16)',
  fill: 'rgba(15,27,36,0.07)',
  tint: '#0F766E',
  onTint: '#FFFFFF',
  tintFill: 'rgba(15,118,110,0.12)',
  green: '#15803D',
  orange: '#B45309',
  red: '#DC2626',
  paceMarker: 'rgba(15,27,36,0.55)',
};

export const dark: Palette = {
  label: '#F1F5F4',
  secondaryLabel: 'rgba(241,245,244,0.62)',
  tertiaryLabel: 'rgba(241,245,244,0.32)',
  background: '#0A1113',
  groupedBackground: '#0A1113',
  cell: '#141D20',
  separator: 'rgba(241,245,244,0.14)',
  fill: 'rgba(241,245,244,0.10)',
  tint: '#2DD4BF',
  onTint: '#04201D',
  tintFill: 'rgba(45,212,191,0.16)',
  green: '#4ADE80',
  orange: '#FBBF24',
  red: '#F87171',
  paceMarker: 'rgba(241,245,244,0.55)',
};
