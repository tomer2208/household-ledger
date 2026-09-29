import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateInput, hasSystemDatePicker } from './date-input';
import { dayChipLabel, todayYmd, yesterdayYmd } from '@/lib/dates';
import { useColors } from '@/lib/theme';

// When an expense happened: Today and Yesterday are one tap, anything older opens the system
// date picker. Future days can't be picked; a budget month is only ever in the past or now.
export function DateField({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const c = useColors();
  const today = todayYmd();
  const yesterday = yesterdayYmd();
  const [strip, setStrip] = useState(false);
  const other = value !== today && value !== yesterday;

  const chip = (label: string, selected: boolean, onPress?: () => void, a11y?: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[s.chip, { backgroundColor: selected ? c.tint : c.fill }]}>
      <Text style={[s.chipText, { color: selected ? c.onTint : c.label }]}>{label}</Text>
    </Pressable>
  );

  // Native fallback: the last two weeks, newest first.
  const recent = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {chip('Today', value === today, () => onChange(today))}
        {chip('Yesterday', value === yesterday, () => onChange(yesterday))}
        <View>
          {chip(
            other ? dayChipLabel(value) : 'Pick date…',
            other,
            hasSystemDatePicker ? undefined : () => setStrip((x) => !x),
            other ? `Date: ${dayChipLabel(value)}. Change date` : 'Pick another date',
          )}
          {hasSystemDatePicker ? <DateInput value={value} max={today} onChange={onChange} label="Pick another date" /> : null}
        </View>
      </View>
      {strip ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          {recent.map((d) => (
            <View key={d}>
              {chip(dayChipLabel(d), d === value, () => {
                onChange(d);
                setStrip(false);
              })}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  strip: { gap: 8, paddingHorizontal: 16 },
  // 36 tall plus 4 of hitSlop each side = a 44pt target, like the currency chips.
  chip: { paddingHorizontal: 14, borderRadius: 18, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontWeight: '600', fontSize: 15 },
});
