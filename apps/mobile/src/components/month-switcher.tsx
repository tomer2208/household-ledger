import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './ui';
import { addMonths, monthLabel } from '@/lib/dates';
import { useColors } from '@/lib/theme';

// P1-5: ‹ September 2026 › above Overview. Back as far as the household's first month, never
// past the current one; "This month" jumps home from anywhere in the past.
export function MonthSwitcher({
  month,
  first,
  current,
  onChange,
}: {
  month: string; // 'YYYY-MM-01'
  first: string;
  current: string;
  onChange: (month: string) => void;
}) {
  const c = useColors();
  const canBack = month > first;
  const canForward = month < current;
  const arrow = (dir: -1 | 1, enabled: boolean) => (
    <Pressable
      onPress={() => enabled && onChange(addMonths(month, dir))}
      disabled={!enabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? `Previous month, ${monthLabel(addMonths(month, -1))}` : `Next month, ${monthLabel(addMonths(month, 1))}`}
      accessibilityState={{ disabled: !enabled }}
      style={s.arrow}>
      <Icon name={dir < 0 ? 'chevron.left' : 'chevron.right'} size={18} color={enabled ? c.tint : c.tertiaryLabel} />
    </Pressable>
  );
  return (
    <View style={s.row}>
      {arrow(-1, canBack)}
      <Text style={[s.label, { color: c.label }]} accessibilityRole="header">
        {monthLabel(month)}
      </Text>
      {arrow(1, canForward)}
      {canForward ? (
        <Pressable
          onPress={() => onChange(current)}
          hitSlop={8}
          accessibilityRole="button"
          style={[s.today, { backgroundColor: c.tintFill }]}>
          <Text style={[s.todayText, { color: c.tint }]}>This month</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 12, marginTop: 8 },
  // 44pt targets for the arrows.
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 20, fontWeight: '700', minWidth: 150, textAlign: 'center' },
  today: { marginLeft: 'auto', minHeight: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center' },
  todayText: { fontSize: 15, fontWeight: '600' },
});
