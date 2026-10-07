import { DynamicColorIOS } from 'react-native';

import { dark, light, type Palette } from './colors';

// iOS-only file: DynamicColorIOS does not exist on web, so Metro only bundles this for iOS.
// Every colour follows the system appearance without a re-render. F7: the neutrals are the
// FinPace stone scale now, not the system greys, so iPhone and the web app look the same.
export const iosPalette: Palette = Object.fromEntries(
  (Object.keys(light) as (keyof Palette)[]).map((k) => [k, DynamicColorIOS({ light: light[k] as string, dark: dark[k] as string })]),
) as Palette;
