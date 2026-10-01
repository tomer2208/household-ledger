import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';

import { Icon } from './ui';
import { isRTL, t } from '@/lib/i18n';
import { dirProps } from '@/lib/rtl';
import { useColors } from '@/lib/theme';

// Swipe toward the start of a row for Edit and Delete (docs/DESIGN_PLAN.md §7): left in English,
// right in Hebrew. Dragging past both buttons arms a full-swipe delete: the strip turns red, and
// letting go asks to delete. Only one row is open at a time. The children get `open`, so a long
// press can reveal the same buttons without dragging.
//
// P1-6: the swipe itself is laid out left to right in both languages (the gesture library places
// its actions by physical side), and Hebrew uses the left-side actions; the row inside keeps the
// language's direction.
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
  containerStyle,
  children,
}: {
  onEdit: () => void;
  onDelete: () => void;
  // For a standalone card: its margins and corner radius, so the actions are clipped to it.
  containerStyle?: StyleProp<ViewStyle>;
  children: (open: () => void) => ReactNode;
}) {
  const c = useColors();
  const ref = useRef<SwipeableMethods>(null);
  const rtl = isRTL();
  const armed = useRef(false);
  // Latched at release: the settle animation crosses back over FULL and would disarm it.
  const fire = useRef(false);
  // Long press asks to open; the effect does it, so render never touches the ref.
  const [openRequest, setOpenRequest] = useState(0);
  useEffect(() => {
    if (!openRequest) return;
    if (rtl) ref.current?.openLeft();
    else ref.current?.openRight();
  }, [openRequest, rtl]);

  const setArmed = (v: boolean) => {
    if (v === armed.current) return;
    armed.current = v;
    if (v) tap('medium');
  };

  const run = (fn: () => void) => {
    ref.current?.close();
    fn();
  };

  const actions = (_progress: SharedValue<number>, translation: SharedValue<number>) => (
    <Actions translation={translation} rtl={rtl} onArm={setArmed} onEdit={() => run(onEdit)} onDelete={() => run(onDelete)} />
  );

  return (
    <View {...dirProps('ltr')}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1.4}
        {...(rtl
          ? { leftThreshold: ACTION / 2, overshootLeft: true, dragOffsetFromLeftEdge: 12, renderLeftActions: actions }
          : { rightThreshold: ACTION / 2, overshootRight: true, dragOffsetFromRightEdge: 12, renderRightActions: actions })}
        containerStyle={containerStyle}
        // Opaque base: pressed tints are translucent, and the actions sit right behind the row.
        childrenContainerStyle={{ backgroundColor: c.cell }}
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
        }}>
        <View {...dirProps(rtl ? 'rtl' : 'ltr')}>{children(() => setOpenRequest((n) => n + 1))}</View>
      </ReanimatedSwipeable>
    </View>
  );
}

function Actions({
  translation,
  rtl,
  onArm,
  onEdit,
  onDelete,
}: {
  translation: SharedValue<number>;
  rtl: boolean;
  onArm: (armed: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = useColors();

  // How far the row has been pulled open, whichever side the actions are on.
  useAnimatedReaction(
    () => (rtl ? translation.value : -translation.value) > FULL,
    (now, before) => {
      if (now !== before) runOnJS(onArm)(now);
    },
  );
  // Red fills the gap between the row and the buttons as it is pulled past them.
  const filler = useAnimatedStyle(() => ({ width: Math.max(ACTION, rtl ? translation.value : -translation.value) }));
  const editFade = useAnimatedStyle(() => ({ opacity: (rtl ? translation.value : -translation.value) > FULL ? 0 : 1 }));

  const edit = (
    <Animated.View key="edit" style={[s.slot, editFade]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.common.edit} onPress={onEdit} style={[s.button, { backgroundColor: c.tint }]}>
        <Icon name="pencil" size={20} color={c.onTint} />
        <Text style={[s.label, { color: c.onTint }]}>{t.common.edit}</Text>
      </Pressable>
    </Animated.View>
  );
  const del = (
    <View key="delete" style={s.slot}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.common.delete} onPress={onDelete} style={[s.button, { backgroundColor: c.red }]}>
        <Icon name="trash" size={20} color={c.onRed} />
        <Text style={[s.label, { color: c.onRed }]}>{t.common.delete}</Text>
      </Pressable>
    </View>
  );

  // Delete is always the outer button, at the edge the row was pulled from.
  return (
    <View style={s.actions}>
      <Animated.View style={[s.filler, rtl ? s.fillerStart : s.fillerEnd, { backgroundColor: c.red }, filler]} />
      {rtl ? [del, edit] : [edit, del]}
    </View>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: 'row', width: ACTION * 2 },
  // Physical sides on purpose: this strip lives in the left-to-right swipe box.
  filler: { position: 'absolute', top: 0, bottom: 0 },
  fillerStart: { left: 0 },
  fillerEnd: { right: 0 },
  slot: { width: ACTION },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
});
