import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './ui';
import { incomePlan, SAVINGS_TARGET_PCT, shortOfTarget } from '@/lib/budget';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { forwardIcon } from '@/lib/rtl';
import { moneyText, radius, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// Where the month's income goes: the budgets carved out of it, and what's left unassigned
// (planned savings). Used by Settings → Monthly Income and Categories & Budgets.
export function IncomePlanCard({
  income,
  budgeted,
  currency,
  onPress,
  onLongPress,
  actions,
  flush,
}: {
  income: number | null;
  budgeted: number;
  currency: string;
  onPress?: () => void;
  onLongPress?: () => void;
  // Offered to VoiceOver/TalkBack as custom actions (the swipe actions).
  actions?: { name: string; label: string; run: () => void }[];
  // Inside a SwipeRow, which supplies the margins and corner radius.
  flush?: boolean;
}) {
  const c = useColors();
  const p = incomePlan(income, budgeted);

  if (p.kind === 'none') {
    return (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        style={({ pressed }) => [s.card, s.cta, { backgroundColor: pressed ? c.fill : c.cell }]}>
        <View style={[s.ctaIcon, { backgroundColor: c.tintFill }]}>
          <Icon name="briefcase" size={20} color={c.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.ctaTitle, { color: c.label }]}>{t.income.ctaTitle}</Text>
          <Text style={[s.meta, { color: c.secondaryLabel }]}>{t.income.ctaBody}</Text>
        </View>
        {onPress ? <Icon name={forwardIcon()} size={13} color={c.tertiaryLabel} /> : null}
      </Pressable>
    );
  }

  const over = p.kind === 'over';
  const tone = p.health === 'over' ? c.red : p.health === 'thin' ? c.orange : c.green;
  // Over-assigned: the bar is the budgets, the income line sits inside it and the rest is red.
  const budgetW = over ? (p.income * 100) / p.budgeted : p.budgetedPct;
  const restW = 100 - Math.min(100, budgetW);
  const short = shortOfTarget(p);

  const headline = over ? t.income.overAssigned : p.kind === 'balanced' ? t.income.fullyAssigned : t.income.unassigned;
  const label = over
    ? t.income.a11yOver(formatMoney(p.income, currency), formatMoney(p.budgeted, currency), formatMoney(-p.unassigned, currency))
    : t.income.a11y(formatMoney(p.income, currency), formatMoney(p.budgeted, currency), formatMoney(p.unassigned, currency));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityActions={actions?.map(({ name, label: l }) => ({ name, label: l }))}
      onAccessibilityAction={(e) => actions?.find((x) => x.name === e.nativeEvent.actionName)?.run()}
      style={({ pressed }) => [s.card, flush && s.flush, { backgroundColor: pressed ? c.fill : c.cell }]}>
      <View style={s.top}>
        <Text style={[s.label, { color: c.secondaryLabel }]}>{headline}</Text>
        {onPress ? <Icon name={forwardIcon()} size={13} color={c.tertiaryLabel} /> : null}
      </View>
      <View style={s.amountRow}>
        <Text style={[s.amount, { color: tone }]}>{formatMoney(Math.abs(p.unassigned), currency)}</Text>
        <Text style={[s.pct, { color: tone }]}>{over ? t.income.overIncome : t.income.pctOfIncome(p.savingsPct)}</Text>
      </View>

      <View style={[s.track, { backgroundColor: c.fill }]}>
        <View style={{ width: `${Math.min(100, budgetW)}%`, backgroundColor: c.tint }} />
        {restW > 0 ? <View style={{ width: `${restW}%`, backgroundColor: over ? c.red : c.green, opacity: over ? 1 : 0.45 }} /> : null}
      </View>

      <View style={s.legend}>
        <Legend color={c.tint} text={t.income.budgets(formatMoney(p.budgeted, currency))} />
        <Legend color={c.secondaryLabel} text={t.income.incomeIs(formatMoney(p.income, currency))} hollow />
      </View>

      <Text style={[s.meta, { color: over ? c.red : p.health === 'thin' ? c.orange : c.secondaryLabel }]}>
        {over
          ? t.income.overHint(formatMoney(-p.unassigned, currency))
          : short > 0
            ? t.income.trimHint(SAVINGS_TARGET_PCT, formatMoney(short, currency))
            : t.income.goodHint(SAVINGS_TARGET_PCT)}
      </Text>
    </Pressable>
  );
}

function Legend({ color, text, hollow }: { color: any; text: string; hollow?: boolean }) {
  const c = useColors();
  return (
    <View style={s.legendItem}>
      <View style={[s.dot, hollow ? { borderColor: color, borderWidth: 1.5 } : { backgroundColor: color }]} />
      <Text style={[s.meta, { color: c.secondaryLabel }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderRadius: radius.hero, padding: 16, gap: 8 },
  flush: { marginHorizontal: 0, marginTop: 0, borderRadius: 0 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontFamily: fontFamily.body, fontSize: 17, fontWeight: '600' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fontFamily.body, fontSize: 13 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  amount: { fontSize: 28, fontWeight: '700', ...moneyText },
  pct: { fontSize: 15, fontWeight: '600', ...moneyText },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: 13, lineHeight: 18, ...moneyText },
});
