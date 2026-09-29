import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/lib/theme';

// R4: an expense takes money out, a refund puts it back (stored as a negative amount, H5).
export function KindToggle({ refund, onChange }: { refund: boolean; onChange: (refund: boolean) => void }) {
  const c = useColors();
  return (
    <View style={[s.segment, { backgroundColor: c.fill }]} accessibilityRole="radiogroup">
      {([false, true] as const).map((isRefund) => {
        const selected = refund === isRefund;
        return (
          <Pressable
            key={String(isRefund)}
            onPress={() => onChange(isRefund)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            style={[s.item, selected && { backgroundColor: c.cell }]}>
            <Text style={[s.text, { color: selected ? (isRefund ? c.green : c.label) : c.secondaryLabel }]}>
              {isRefund ? 'Refund' : 'Expense'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: 9, padding: 2, alignSelf: 'center', width: 220 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7, minHeight: 36 },
  text: { fontSize: 15, fontWeight: '600' },
});
