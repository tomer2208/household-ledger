import { PlatformColor } from 'react-native';

import type { Palette } from './theme';

// iOS-only file: PlatformColor does not exist on web, so the semantic palette lives here
// and Metro only bundles it for iOS.
export const iosPalette: Palette | null = {
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  background: PlatformColor('systemBackground'),
  groupedBackground: PlatformColor('systemGroupedBackground'),
  cell: PlatformColor('secondarySystemGroupedBackground'),
  separator: PlatformColor('separator'),
  fill: PlatformColor('tertiarySystemFill'),
  tint: PlatformColor('systemBlue'),
  green: PlatformColor('systemGreen'),
  orange: PlatformColor('systemOrange'),
  red: PlatformColor('systemRed'),
};
