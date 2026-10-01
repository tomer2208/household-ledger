import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, CategoryIcon, Icon, ProgressBar } from './ui';
import { budgetStatus } from '@/lib/budget';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { textEnd } from '@/lib/rtl';
import { budgetTone, moneyText, useColors } from '@/lib/theme';

// One category's month at a glance: what's left (or over) first, then the bar with the pace
// marker, then spent of cap. Used by Overview and Settings → Categories.
export function BudgetRow({
  name,
  symbol,
  cap,
  spent,
  noBudget,
  currency,
  pace,
  onPress,
  onLongPress,
  actions,
  last,
}: {
  name: string;
  symbol: string;
  cap: number | null;
  spent: number;
  noBudget?: boolean;
  currency: string;
  pace?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  // Offered to VoiceOver/TalkBack as custom actions, so swipe-only actions stay reachable.
  actions?: { name: string; label: string; run: () => void }[];
  last?: boolean;
}) {
  const c = useColors();
  const st = budgetStatus(cap, spent);
  const tone = st.kind === 'none' ? c.secondaryLabel : budgetTone(st.pct, c, pace);
  const ahead = st.kind === 'left' && pace != null && st.pct - pace >= 15;

  const label =
    st.kind === 'none'
      ? t.budget.a11yNone(name, formatMoney(spent, currency))
      : t.budget.a11y(name, formatMoney(st.amount, currency), st.kind, formatMoney(st.cap, currency)) +
        (st.kind === 'left' && pace != null ? (ahead ? t.budget.aheadOfPace : t.budget.onPace) : '');

  // Opaque base: the pressed tint is translucent, and swipe actions sit right behind the row.
  return (
    <View style={{ backgroundColor: c.cell }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        disabled={!onPress && !onLongPress}
        accessibilityActions={actions?.map(({ name, label }) => ({ name, label }))}
        onAccessibilityAction={(e) => actions?.find((x) => x.name === e.nativeEvent.actionName)?.run()}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={label}
        style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fill }]}>
        <CategoryIcon symbol={symbol} />
        <View style={[s.body, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={s.top}>
            <Text numberOfLines={1} style={[s.name, { color: c.label }]}>
              {name}
            </Text>
            {st.kind === 'none' ? (
              <Text style={[s.small, { color: c.secondaryLabel }]}>{t.budget.spent(formatMoney(spent, currency))}</Text>
            ) : (
              <View style={s.status}>
                {st.kind === 'over' ? <Icon name="exclamationmark.triangle.fill" size={15} color={tone} /> : null}
                <Text style={[s.amount, { color: tone }]}>
                  {st.kind === 'left' ? t.budget.left(formatMoney(st.amount, currency)) : t.budget.over(formatMoney(st.amount, currency))}
                </Text>
              </View>
            )}
          </View>
          {st.kind === 'none' ? (
            noBudget ? (
              <View style={s.badgeRow}>
                <Badge text={t.overview.noBudget} color={c.orange} />
              </View>
            ) : (
              <Text style={[s.small, { color: c.secondaryLabel }]}>{t.overview.noBudget}</Text>
            )
          ) : (
            <>
              <ProgressBar pct={st.pct} color={tone} pace={pace} />
              <Text style={[s.small, { color: c.secondaryLabel, textAlign: textEnd() }]}>
                {t.common.of(formatMoney(st.spent, currency), formatMoney(st.cap, currency))}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingStart: 16, gap: 12 },
  body: { flex: 1, paddingVertical: 12, paddingEnd: 16, gap: 6, minHeight: 56 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amount: { fontSize: 20, fontWeight: '600', ...moneyText },
  small: { fontSize: 13, ...moneyText },
  badgeRow: { flexDirection: 'row' },
});
