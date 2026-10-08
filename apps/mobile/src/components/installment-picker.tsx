import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { INSTALLMENT_CHOICES, splitInstallments } from '@/lib/installments';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

// P1-2: one payment, or 3-36 monthly installments, with what each month will be charged.
export function InstallmentPicker({
  value,
  onChange,
  totalMinor,
  currency,
}: {
  value: number;
  onChange: (count: number) => void;
  totalMinor: number | null;
  currency: string;
}) {
  const c = useColors();
  const split = totalMinor && value > 1 ? splitInstallments(totalMinor, value) : null;
  return (
    <View style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} keyboardShouldPersistTaps="handled">
        {INSTALLMENT_CHOICES.map((n) => {
          const selected = n === value;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              accessibilityLabel={n === 1 ? t.installments.one : t.installments.monthly(n)}
              hitSlop={{ top: 4, bottom: 4 }}
              style={[s.chip, { backgroundColor: selected ? c.tint : c.fill }]}>
              <Text style={[s.chipText, { color: selected ? c.onTint : c.label }]}>{n === 1 ? t.installments.one : t.installments.chip(n)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {split ? (
        <Text style={[s.summary, { color: c.secondaryLabel }]} accessibilityLiveRegion="polite">
          {split.first === split.share
            ? t.installments.even(value, formatMoney(split.share, currency, { cents: split.share % 100 !== 0 }))
            : t.installments.uneven(formatMoney(split.first, currency, { cents: true }), value - 1, formatMoney(split.share, currency, { cents: true }))}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  row: { gap: 8, paddingHorizontal: 16 },
  chip: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  summary: { fontSize: 14, marginHorizontal: 32, ...moneyText },
});
