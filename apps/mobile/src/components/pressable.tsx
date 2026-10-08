import { Pressable as NativePressable, type PressableProps } from 'react-native';

import { pressedOpacity } from '@/lib/tokens';

// Q3: every tap shows it registered. A control that draws its own pressed state passes a style
// function and keeps it; `feedback={false}` is for surfaces that aren't controls, like a backdrop.
export function Pressable({ style, feedback = true, ...rest }: PressableProps & { feedback?: boolean }) {
  if (!feedback || typeof style === 'function') return <NativePressable style={style} {...rest} />;
  return <NativePressable style={({ pressed }) => [style, pressed && { opacity: pressedOpacity }]} {...rest} />;
}
