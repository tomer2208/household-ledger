import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from './ui';
import type { Category } from '@/api/types';
import { useColors } from '@/lib/theme';

// A grid rather than a wheel: 15+ categories need to be scannable in one glance
// while standing at a register.
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const c = useColors();
  return (
    <ScrollView horizontal={false} scrollEnabled={false}>
      <View style={s.grid}>
        {categories
          .filter((cat) => !cat.archived_at)
          .map((cat) => {
            const selected = cat.id === value;
            return (
              <Pressable
                key={cat.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange(cat.id)}
                style={[
                  s.chip,
                  { backgroundColor: c.cell, borderColor: selected ? c.tint : 'transparent' },
                ]}>
                <CategoryIcon symbol={cat.sf_symbol} size={28} />
                <Text numberOfLines={1} style={[s.label, { color: selected ? c.tint : c.label }]}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: {
    width: '31.5%',
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  label: { fontSize: 13, fontWeight: '500' },
});
