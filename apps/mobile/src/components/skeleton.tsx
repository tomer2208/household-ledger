import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';

import { t } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';

// P1-12: the shape of a screen while its data loads, so nothing jumps when it arrives.
// Shown only when there is nothing to show yet: cached data (persisted on the phone) renders
// at once instead. Blocks pulse gently, or stay still under Reduce Motion.

function usePulse() {
  const [value] = useState(() => new Animated.Value(1));
  const [still, setStill] = useState(false);
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) return setStill(true);
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(value, { toValue: 0.45, duration: 700, useNativeDriver: true }),
            Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [value]);
  return still ? 1 : value;
}

export function Bone({ width = '100%', height = 14, round, style }: { width?: DimensionValue; height?: number; round?: boolean; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[{ width, height, borderRadius: round ? height / 2 : 6, backgroundColor: c.fill }, style]} />;
}

// A grey stand-in for whatever loads; screen readers hear "Loading" once.
function Skeleton({ children }: { children: React.ReactNode }) {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }} accessible accessibilityLabel={t.common.loading} accessibilityRole="progressbar">
      {children}
    </Animated.View>
  );
}

function RowBone({ last, money = true }: { last?: boolean; money?: boolean }) {
  const c = useColors();
  return (
    <View style={[s.row, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Bone width={30} height={30} />
      <View style={s.rowText}>
        <Bone width="55%" height={14} />
        <Bone width="35%" height={11} />
      </View>
      {money ? <Bone width={56} height={14} /> : null}
    </View>
  );
}

// A grouped list: a section of rows, as on Expenses, Recurring and Savings.
export function ListSkeleton({ rows = 6, sections = 1 }: { rows?: number; sections?: number }) {
  const c = useColors();
  return (
    <Skeleton>
      {Array.from({ length: sections }, (_, k) => (
        <View key={k} style={s.section}>
          <Bone width={90} height={11} style={s.sectionTitle} />
          <View style={[s.card, { backgroundColor: c.cell }]}>
            {Array.from({ length: rows }, (_, i) => (
              <RowBone key={i} last={i === rows - 1} />
            ))}
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

// Overview: the month, the hero with what's left, then budget rows with their bars.
export function OverviewSkeleton() {
  const c = useColors();
  return (
    <Skeleton>
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Bone width={110} height={13} />
        <Bone width={170} height={38} />
        <Bone height={8} round />
        <Bone width="60%" height={12} />
      </View>
      <View style={s.section}>
        <Bone width={70} height={11} style={s.sectionTitle} />
        <View style={[s.card, { backgroundColor: c.cell }]}>
          {Array.from({ length: 4 }, (_, i) => (
            <View key={i} style={[s.row, i < 3 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Bone width={30} height={30} />
              <View style={s.rowText}>
                <View style={s.split}>
                  <Bone width="40%" height={14} />
                  <Bone width={70} height={16} />
                </View>
                <Bone height={8} round />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Skeleton>
  );
}

// A report or an expense's details: a hero card and a block of text.
export function DetailSkeleton() {
  const c = useColors();
  return (
    <Skeleton>
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Bone width={120} height={13} />
        <Bone width={150} height={34} />
        <Bone width="70%" height={12} />
      </View>
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Bone width="80%" height={18} />
        <Bone height={12} />
        <Bone height={12} />
        <Bone width="65%" height={12} />
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 22, marginHorizontal: 16 },
  sectionTitle: { marginHorizontal: 16, marginBottom: 8 },
  card: { borderRadius: radius.row, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56, paddingVertical: 10 },
  rowText: { flex: 1, gap: 7 },
  split: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: radius.hero, padding: 18, gap: 10 },
});
