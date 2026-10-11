import * as Haptics from 'expo-haptics';
import { ReactNode } from 'react';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from './ui';
import { useColors } from '@/lib/theme';

// P2: reorder a list by dragging. A finger on a row's ≡ handle picks it up at once; the row
// follows the finger and the others slide aside to make room. Only the handle drags, so a
// swipe anywhere else on the row still scrolls the page (on an iPhone web app, a long press
// on the whole row would lose to the browser's scrolling). Rows keep their own arrow buttons,
// so ordering never needs dragging (WCAG 2.5.7). Rows are assumed to be the same height.

const clamp = (v: number, lo: number, hi: number) => {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
};

const pickUp = () => {
  if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

export function DragList<T>({
  items,
  keyOf,
  onMove,
  liftColor,
  renderItem,
}: {
  items: T[];
  keyOf: (item: T) => string;
  onMove: (from: number, to: number) => void;
  // The dragged row's background, so it covers the rows it passes over.
  liftColor: ColorValue;
  // `handle` is the ≡ grip to place in the row. Screen readers skip it and use the arrows.
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
}) {
  const rowH = useSharedValue(0);
  const from = useSharedValue(-1);
  const dy = useSharedValue(0);
  return (
    <View>
      {items.map((item, i) => (
        <DragRow key={keyOf(item)} index={i} count={items.length} rowH={rowH} from={from} dy={dy} onMove={onMove} liftColor={liftColor}>
          {(handle) => renderItem(item, i, handle)}
        </DragRow>
      ))}
    </View>
  );
}

function DragRow({
  index,
  count,
  rowH,
  from,
  dy,
  onMove,
  liftColor,
  children,
}: {
  index: number;
  count: number;
  rowH: SharedValue<number>;
  from: SharedValue<number>;
  dy: SharedValue<number>;
  onMove: (from: number, to: number) => void;
  liftColor: ColorValue;
  children: (handle: ReactNode) => ReactNode;
}) {
  const c = useColors();
  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      from.set(index);
      dy.set(0);
      runOnJS(pickUp)();
    })
    .onUpdate((e) => {
      // Not past the first or last row.
      dy.set(clamp(e.translationY, -index * rowH.value, (count - 1 - index) * rowH.value));
    })
    .onEnd(() => {
      const to = rowH.value ? clamp(Math.round(index + dy.value / rowH.value), 0, count - 1) : index;
      if (to !== index) runOnJS(onMove)(index, to);
    })
    .onFinalize(() => {
      from.set(-1);
      dy.set(0);
    });

  const style = useAnimatedStyle(() => {
    const f = from.value;
    if (f < 0 || !rowH.value) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, backgroundColor: 'transparent' };
    if (f === index) return { transform: [{ translateY: dy.value }, { scale: 1.02 }], zIndex: 10, backgroundColor: liftColor as string };
    const to = clamp(Math.round(f + dy.value / rowH.value), 0, count - 1);
    const shift = f < index && index <= to ? -rowH.value : to <= index && index < f ? rowH.value : 0;
    return { transform: [{ translateY: withTiming(shift, { duration: 150 }) }, { scale: 1 }], zIndex: 0, backgroundColor: 'transparent' };
  });

  const handle = (
    <GestureDetector gesture={pan}>
      <View style={s.handle} aria-hidden>
        <Icon name="line.3.horizontal" size={20} color={c.text2} />
      </View>
    </GestureDetector>
  );

  return (
    <Animated.View
      style={[s.row, style]}
      onLayout={(e) => {
        if (!rowH.value) rowH.set(e.nativeEvent.layout.height);
      }}>
      {children(handle)}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  row: { position: 'relative' },
  // 44 points to touch; the grip itself is the only drag target.
  handle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', cursor: 'grab' as 'pointer' },
});
