import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ColorValue, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';

import { Icon } from './ui';
import { isRTL, t } from '@/lib/i18n';
import { dirProps } from '@/lib/rtl';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

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

// Web: the swipe captures the pointer, so the browser's click (which fires onPress) lands on the
// swipe box instead of a button, and on touch it never reaches the buttons at all. The buttons
// listen through the gesture library instead, and a drag doesn't count as a tap on the row.
let draggedAt = 0;
const justDragged = () => Date.now() - draggedAt < 400;
// One tap can reach a button both ways (gesture and click); it acts once.
let firedAt = 0;
const once = (fn: () => void) => () => {
  if (Date.now() - firedAt < 400) return;
  firedAt = Date.now();
  fn();
};

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

  // Web: swallow the click that ends a drag, before it reaches the row's own onPress.
  const box = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = box.current as unknown as HTMLElement | null;
    const stop = (e: Event) => {
      if (!justDragged()) return;
      e.stopPropagation();
      e.preventDefault();
    };
    el?.addEventListener('click', stop, true);
    // The library always draws an actions box for both sides, the right one over the left. In
    // Hebrew the buttons are on the left, so the empty right box, invisible, took every tap.
    // The swipe box is the first one down with three children: left actions, right actions, row.
    let swipeBox = el?.firstElementChild;
    while (swipeBox && swipeBox.children.length === 1) swipeBox = swipeBox.firstElementChild;
    const right = swipeBox?.children.length === 3 ? (swipeBox.children[1] as HTMLElement) : undefined;
    if (rtl && right && !right.querySelector('[role="button"]')) right.style.pointerEvents = 'none';
    return () => el?.removeEventListener('click', stop, true);
  }, [rtl]);

  return (
    <View ref={box} {...dirProps('ltr')}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1.4}
        {...(rtl
          ? { leftThreshold: ACTION / 2, overshootLeft: true, dragOffsetFromLeftEdge: 12, renderLeftActions: actions }
          : { rightThreshold: ACTION / 2, overshootRight: true, dragOffsetFromRightEdge: 12, renderRightActions: actions })}
        containerStyle={containerStyle}
        // Opaque base: pressed tints are translucent, and the actions sit right behind the row.
        childrenContainerStyle={{ backgroundColor: c.cell }}
        onSwipeableOpenStartDrag={() => (draggedAt = Date.now())}
        onSwipeableCloseStartDrag={() => (draggedAt = Date.now())}
        onSwipeableWillOpen={() => {
          draggedAt = Date.now();
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
      <ActionButton label={t.common.edit} icon="pencil" bg={c.tint} fg={c.onTint} onPress={onEdit} />
    </Animated.View>
  );
  const del = (
    <View key="delete" style={s.slot}>
      <ActionButton label={t.common.delete} icon="trash" bg={c.red} fg={c.onRed} onPress={onDelete} />
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

// A tap through the gesture library (works under the swipe on touch screens), plus onPress for
// the keyboard and screen readers; `once` keeps a tap that arrives both ways from acting twice.
function ActionButton({ label, icon, bg, fg, onPress }: { label: string; icon: string; bg: ColorValue; fg: ColorValue; onPress: () => void }) {
  const act = once(onPress);
  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success) act();
    });
  return (
    <GestureDetector gesture={tapGesture}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={act} style={[s.button, { backgroundColor: bg }]}>
        <Icon name={icon} size={20} color={fg} />
        <Text style={[s.label, { color: fg }]}>{label}</Text>
      </Pressable>
    </GestureDetector>
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
  label: { fontFamily: fontFamily.body, fontSize: 13, fontWeight: '600' },
});
