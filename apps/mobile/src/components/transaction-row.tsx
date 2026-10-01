import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, CategoryIcon } from './ui';
import { useMemberNames } from '@/api/queries';
import type { Transaction } from '@/api/types';
import { isolate, isRtl } from '@/lib/bidi';
import { timeLabel } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { formatSigned } from '@/lib/money';
import { appDirText, textStart } from '@/lib/rtl';
import { moneyText, useColors } from '@/lib/theme';

export function TransactionRow({
  tx,
  baseCurrency,
  last,
  onLongPress,
  actions,
}: {
  tx: Transaction;
  baseCurrency: string;
  last?: boolean;
  // Long press reveals the swipe actions; screen readers get them as custom actions.
  onLongPress?: () => void;
  actions?: { name: string; label: string; run: () => void }[];
}) {
  const c = useColors();
  const foreign = tx.currency !== baseCurrency;
  const names = useMemberNames();
  const by = names && tx.created_by ? names.get(tx.created_by) : undefined;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: tx.id } })}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityActions={actions?.map(({ name, label }) => ({ name, label }))}
      onAccessibilityAction={(e) => actions?.find((x) => x.name === e.nativeEvent.actionName)?.run()}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fill }]}>
      <View>
        <CategoryIcon symbol={tx.categories?.sf_symbol ?? 'tag'} />
        {by ? (
          <View style={[s.who, { backgroundColor: c.tint, borderColor: c.cell }]} accessibilityLabel={t.tx.addedBy(by)}>
            <Text style={[s.whoText, { color: c.onTint }]}>{by.trim().charAt(0).toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <View style={[s.body, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[s.title, { color: c.label }, isRtl(tx.title) && { writingDirection: 'rtl', textAlign: textStart() }]}>
            {isolate(tx.title)}
          </Text>
          <View style={s.meta}>
            {/* In the app's direction: a Hebrew category name doesn't flip an English line. */}
            <Text {...appDirText()} numberOfLines={1} style={[s.sub, { color: c.secondaryLabel }]}>
              {isolate(tx.categories?.name)} · {t.tx.source[tx.source]} · {timeLabel(tx.occurred_at)}
            </Text>
            {tx.status === 'pending_review' ? <Badge text={t.tx.review} color={c.orange} /> : null}
            {tx.status === 'estimated' ? <Badge text={t.tx.estimate} color={c.secondaryLabel} /> : null}
            {tx.amount_minor < 0 ? <Badge text={t.common.refund} color={c.green} /> : null}
            {tx.installment ? <Badge text={`${tx.installment.no}/${tx.installment.count}`} color={c.secondaryLabel} /> : null}
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
  row: { flexDirection: 'row', alignItems: 'center', paddingStart: 16, gap: 12 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingEnd: 16, minHeight: 56 },
  title: { fontSize: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { fontSize: 13, fontVariant: ['tabular-nums'], flexShrink: 1 },
  amount: { fontSize: 17, ...moneyText },
  who: {
    position: 'absolute', end: -5, bottom: -5, width: 17, height: 17, borderRadius: 9, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  whoText: { fontSize: 9, fontWeight: '700' },
});
