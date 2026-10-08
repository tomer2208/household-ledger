import { StyleSheet, TextInput, View } from 'react-native';

import { Icon } from './ui';
import type { MerchantSummary } from '@/api/types';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

// A name or any spelling it was learned under, so "PAZ YELLOW" finds "Paz".
export const matches = (m: MerchantSummary, q: string) =>
  m.display_name.toLowerCase().includes(q) || m.aliases.some((a) => a.normalized.includes(q));

export function MerchantSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={[s.search, { backgroundColor: c.fill }]}>
      <Icon name="magnifyingglass" size={16} color={c.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t.merchants.search}
        placeholderTextColor={c.secondaryLabel as string}
        inputMode="search"
        autoCorrect={false}
        style={[s.input, { color: c.label }]}
        accessibilityLabel={t.merchants.search}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.expenses.clearSearch}>
          <Icon name="xmark.circle.fill" size={16} color={c.tertiaryLabel} />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 8, borderRadius: 10, paddingHorizontal: 8, height: 36 },
  // 16px minimum, or iOS Safari zooms the page when the field is focused.
  input: { fontFamily: fontFamily.body, flex: 1, fontSize: 17, paddingVertical: 0, outlineStyle: 'none' } as any,
});
