import { DynamicColorIOS, PlatformColor } from 'react-native';

import { dark, light, type Palette } from './colors';

// iOS-only file: PlatformColor does not exist on web, so the semantic palette lives here
// and Metro only bundles it for iOS. Neutrals follow the system (increased contrast, grouped
// lists); the brand and status colors come from theme.ts in both appearances.
const brand = (k: keyof Palette) => DynamicColorIOS({ light: light[k] as string, dark: dark[k] as string });

export const iosPalette: Palette | null = {
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  background: PlatformColor('systemBackground'),
  groupedBackground: PlatformColor('systemGroupedBackground'),
  cell: PlatformColor('secondarySystemGroupedBackground'),
  separator: PlatformColor('separator'),
  fill: PlatformColor('tertiarySystemFill'),
  tint: brand('tint'),
  onTint: brand('onTint'),
  tintFill: brand('tintFill'),
  green: brand('green'),
  orange: brand('orange'),
  red: brand('red'),
  onRed: brand('onRed'),
  paceMarker: brand('paceMarker'),
};
