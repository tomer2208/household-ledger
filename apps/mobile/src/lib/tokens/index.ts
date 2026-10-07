import type { TextStyle } from 'react-native';

import { categoryColors, scales, semantic } from './palette.gen';

// The design tokens (F7, design-system/finpace/MASTER.md), in three layers:
// 1. primitive: the scales. Nothing on screen reads these directly.
// 2. semantic: what a value is for ("close to the limit", "a card"). Screens read these.
// 3. component: one component's own numbers, built from the two above.
// Colours come from palette.gen.ts, which docs/design/foundations/palette.py writes.

// ───────── 1. primitive ─────────

export { categoryColors, scales };

// F4: base 4. Named by use, so nobody picks 14 because it looked right.
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;

export const radius = { chip: 8, tile: 12, envelope: 16, card: 20, pill: 999 } as const;

// F4: exits are faster than entrances. All of them drop to 0 with Reduce Motion.
export const duration = { press: 100, fast: 150, base: 250, enter: 340, exit: 220, emphasis: 600 } as const;
export const easing = {
  standard: [0.2, 0, 0, 1],
  enter: [0.2, 0.8, 0.2, 1],
  exit: [0.4, 0, 1, 1],
} as const;

// F3: one family per job. The names are what app.json registers on iOS and Android and what
// public/index.html declares with @font-face on the web, so fontWeight picks the file.
export const fontFamily = {
  display: 'Secular One',
  money: 'Rubik',
  body: 'Assistant',
} as const;

// ───────── 2. semantic ─────────

export type SemanticColors = { [K in keyof (typeof semantic)['light']]: string };
export const lightColors: SemanticColors = semantic.light;
export const darkColors: SemanticColors = semantic.dark;

// F3: eight styles instead of sixteen hard-coded sizes. Money is always Rubik with tabular
// digits; Secular One has one weight, so it is never bolded.
const money: TextStyle = { fontFamily: fontFamily.money, fontVariant: ['tabular-nums'] };
export const type = {
  display: { ...money, fontSize: 46, lineHeight: 50, fontWeight: '600' },
  title: { fontFamily: fontFamily.display, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fontFamily.display, fontSize: 19, lineHeight: 25 },
  amount: { ...money, fontSize: 20, lineHeight: 24, fontWeight: '600' },
  body: { fontFamily: fontFamily.body, fontSize: 17, lineHeight: 25 },
  label: { fontFamily: fontFamily.body, fontSize: 17, lineHeight: 20, fontWeight: '700' },
  secondary: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

// F4: a shadow in light; in dark, height is a lighter surface (`raised`) and a hairline.
export const elevation = {
  light: {
    floating: { shadowColor: '#141A17', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    sheet: { shadowColor: '#141A17', shadowOpacity: 0.16, shadowRadius: 15, shadowOffset: { width: 0, height: -8 }, elevation: 8 },
  },
  dark: {
    floating: { borderWidth: 1, borderColor: darkColors.line },
    sheet: { borderTopWidth: 1, borderColor: darkColors.line },
  },
} as const;

// ───────── 3. component ─────────

// The envelope (direction D): a card with a coloured flap, the amount left in words, a bar.
export const envelope = {
  padding: space[3],
  flapHeight: 16,
  radius: radius.envelope,
  gap: space[3],
  barHeight: 8,
  iconBox: 30,
  iconSize: 18,
  // F1: from 80% of the budget an envelope is "close to the limit"; over 100% it is over.
  closeAt: 80,
  // F4: how long the bar takes to grow after a save (`duration.emphasis`).
  emphasis: 600,
} as const;

export const sheet = { radius: radius.card, padding: space[4] } as const;
export const fab = { height: 56, radius: radius.pill } as const;
export const minTouch = 44;
