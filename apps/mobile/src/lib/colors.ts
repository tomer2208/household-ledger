import type { ColorValue } from 'react-native';

import { darkColors, lightColors, type SemanticColors } from './tokens';

// F7: the palette is the semantic tokens (docs/design/foundations/palette.md), plus the names
// the screens used before them. Those older names map onto the tokens so every screen takes
// the new colours at once; each moves to the semantic name when its component is rebuilt (K2).
type Legacy = {
  /** @deprecated use `text` */ label: ColorValue;
  /** @deprecated use `text2` */ secondaryLabel: ColorValue;
  /** @deprecated use `text3` */ tertiaryLabel: ColorValue;
  /** @deprecated use `surface` */ background: ColorValue;
  /** @deprecated use `bg` */ groupedBackground: ColorValue;
  /** @deprecated use `surface` */ cell: ColorValue;
  /** @deprecated use `line` */ separator: ColorValue;
  /** @deprecated use `action` */ tint: ColorValue;
  /** @deprecated use `onAction` */ onTint: ColorValue;
  /** @deprecated use `actionSoft` */ tintFill: ColorValue;
  /** @deprecated use `positive` */ green: ColorValue;
  /** @deprecated use `close` */ orange: ColorValue;
  /** @deprecated use `over` */ red: ColorValue;
  /** Text on an `over` fill (the swipe Delete action). */ onRed: ColorValue;
  /** @deprecated the pace marker goes with the envelope redesign (K1) */ paceMarker: ColorValue;
};

export type Palette = { [K in keyof SemanticColors]: ColorValue } & Legacy;

function palette(t: SemanticColors, onOver: string): Palette {
  return {
    ...t,
    label: t.text,
    secondaryLabel: t.text2,
    tertiaryLabel: t.text3,
    background: t.surface,
    groupedBackground: t.bg,
    cell: t.surface,
    separator: t.line,
    tint: t.action,
    onTint: t.onAction,
    tintFill: t.actionSoft,
    green: t.positive,
    orange: t.close,
    red: t.over,
    onRed: onOver,
    paceMarker: t.text2,
  };
}

export const light: Palette = palette(lightColors, lightColors.surface);
export const dark: Palette = palette(darkColors, darkColors.bg);
