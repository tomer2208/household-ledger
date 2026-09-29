import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, CategoryIcon } from './ui';
import { useMemberNames } from '@/api/queries';
import type { Transaction } from '@/api/types';
import { isolate, isRtl } from '@/lib/bidi';
import { timeLabel } from '@/lib/dates';
import { formatSigned } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';

const SOURCE_LABEL = { apple_pay: 'Apple Pay', manual: 'Manual', recurring: 'Recurring' } as const;

export function TransactionRow({ tx, baseCurrency, last }: { tx: Transaction; baseCurrency: string; last?: boolean }) {
  const c = useColors();
  const foreign = tx.currency !== baseCurrency;
  const names = useMemberNames();
  const by = names && tx.created_by ? names.get(tx.created_by) : undefined;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: tx.id } })}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fill }]}>
      <View>
        <CategoryIcon symbol={tx.categories?.sf_symbol ?? 'tag'} />
        {by ? (
          <View style={[s.who, { backgroundColor: c.tint, borderColor: c.cell }]} accessibilityLabel={`Added by ${by}`}>
            <Text style={[s.whoText, { color: c.onTint }]}>{by.trim().charAt(0).toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <View style={[s.body, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[s.title, { color: c.label }, isRtl(tx.title) && { writingDirection: 'rtl', textAlign: 'left' }]}>
            {isolate(tx.title)}
          </Text>
          <View style={s.meta}>
            <Text numberOfLines={1} style={[s.sub, { color: c.secondaryLabel }]}>
              {tx.categories?.name} · {SOURCE_LABEL[tx.source]} · {timeLabel(tx.occurred_at)}
            </Text>
            {tx.status === 'pending_review' ? <Badge text="Review" color={c.orange} /> : null}
            {tx.status === 'estimated' ? <Badge text="Estimate" color={c.secondaryLabel} /> : null}
            {tx.amount_minor < 0 ? <Badge text="Refund" color={c.green} /> : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.amount, { color: tx.amount_minor < 0 ? c.green : c.label }]}>
            {formatSigned(tx.amount_minor, tx.currency)}
          </Text>
          {foreign ? (
            <Text style={[s.sub, { color: c.secondaryLabel }]}>{formatSigned(tx.amount_base_minor, baseCurrency)}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingRight: 16, minHeight: 56 },
  title: { fontSize: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { fontSize: 13, fontVariant: ['tabular-nums'], flexShrink: 1 },
  amount: { fontSize: 17, ...moneyText },
  who: {
    position: 'absolute', right: -5, bottom: -5, width: 17, height: 17, borderRadius: 9, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  whoText: { fontSize: 9, fontWeight: '700' },
});
