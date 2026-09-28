import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';

import { Icon } from './ui';
import { useColors } from '@/lib/theme';

// Swipe left on a row for Edit and Delete (docs/DESIGN_PLAN.md §7). Dragging past both buttons
// arms a full-swipe delete: the strip turns red, and letting go asks to delete. Only one row is
// open at a time. The children get `open`, so a long press can reveal the same buttons without
// dragging.
const ACTION = 80;
const FULL = ACTION * 2 + 90;

let openRow: SwipeableMethods | null = null;

const tap = (kind: 'light' | 'medium') => {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
};

export function SwipeRow({
  onEdit,
  onDelete,
  children,
}: {
  onEdit: () => void;
  onDelete: () => void;
  children: (open: () => void) => ReactNode;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const armed = useRef(false);
  // Latched at release: the settle animation crosses back over FULL and would disarm it.
  const fire = useRef(false);
  // Long press asks to open; the effect does it, so render never touches the ref.
  const [openRequest, setOpenRequest] = useState(0);
  useEffect(() => {
    if (openRequest) ref.current?.openRight();
  }, [openRequest]);

  const setArmed = (v: boolean) => {
    if (v === armed.current) return;
    armed.current = v;
    if (v) tap('medium');
  };

  const run = (fn: () => void) => {
    ref.current?.close();
    fn();
  };

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.4}
      rightThreshold={ACTION / 2}
      overshootRight
      dragOffsetFromRightEdge={12}
      onSwipeableWillOpen={() => {
        if (openRow && openRow !== ref.current) openRow.close();
        openRow = ref.current;
        fire.current = armed.current;
        if (!armed.current) tap('light');
      }}
      onSwipeableOpen={() => {
        if (!fire.current) return;
        fire.current = false;
        armed.current = false;
        run(onDelete);
      }}
      onSwipeableClose={() => {
        if (openRow === ref.current) openRow = null;
        armed.current = false;
      }}
      renderRightActions={(_progress, translation) => (
        <Actions translation={translation} onArm={setArmed} onEdit={() => run(onEdit)} onDelete={() => run(onDelete)} />
      )}>
      {children(() => setOpenRequest((n) => n + 1))}
    </ReanimatedSwipeable>
  );
}

function Actions({
  translation,
  onArm,
  onEdit,
  onDelete,
}: {
  translation: SharedValue<number>;
  onArm: (armed: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = useColors();

  useAnimatedReaction(
    () => translation.value < -FULL,
    (now, before) => {
      if (now !== before) runOnJS(onArm)(now);
    },
  );
  // Red fills the gap left of the buttons as the row is pulled past them.
  const filler = useAnimatedStyle(() => ({ width: Math.max(ACTION, -translation.value) }));
  const editFade = useAnimatedStyle(() => ({ opacity: translation.value < -FULL ? 0 : 1 }));

  return (
    <View style={s.actions}>
      <Animated.View style={[s.filler, { backgroundColor: c.red }, filler]} />
      <Animated.View style={[s.slot, editFade]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit" onPress={onEdit} style={[s.button, { backgroundColor: c.tint }]}>
          <Icon name="pencil" size={20} color={c.onTint} />
          <Text style={[s.label, { color: c.onTint }]}>Edit</Text>
        </Pressable>
      </Animated.View>
      <View style={s.slot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={onDelete} style={[s.button, { backgroundColor: c.red }]}>
          <Icon name="trash" size={20} color={c.onRed} />
          <Text style={[s.label, { color: c.onRed }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: 'row', width: ACTION * 2 },
  filler: { position: 'absolute', right: 0, top: 0, bottom: 0 },
  slot: { width: ACTION },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
});
