import { StyleSheet, Text, type TextStyle } from 'react-native';

import type { Fund } from '@/api/types';
import { monthLabel } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { appDirText, textEnd } from '@/lib/rtl';
import { moneyText, useColors } from '@/lib/theme';

// How a month's budget adds up when it isn't just the budget that was set: what carried in from
// last month (P1-14) and what spread payments set aside or release (P1-16), then a line per fund.
// Nothing when there's nothing to explain. Used under the bar on Overview, Categories and a
// category's screen.
export function BudgetBreakdown({
  base,
  carry,
  reserve,
  funds,
  currency,
  align = 'end',
}: {
  base: number;
  carry: number;
  reserve: number;
  funds: Fund[];
  currency: string;
  align?: 'start' | 'end';
}) {
  const c = useColors();
  const money = (x: number) => formatMoney(Math.abs(x), currency);
  const parts = [
    carry > 0 ? t.budget.carryIn(money(carry)) : carry < 0 ? t.budget.carryOver(money(carry)) : null,
    reserve < 0 ? t.budget.setAside(money(reserve)) : reserve > 0 ? t.budget.savedUp(money(reserve)) : null,
  ].filter(Boolean);
  // The lines keep the app's direction, and the payment's name is isolated, so a Hebrew name
  // doesn't turn an English line around (and the other way).
  const name = (title: string) => `\u2068${title}\u2069`;
  const lines = funds
    .filter((f) => f.target != null && f.due_month)
    .map((f) =>
      f.due_now
        ? t.budget.fundDue(name(f.title), money(f.balance))
        : // what the fund will hold once this month's share is set aside
          t.budget.fund(name(f.title), money(f.balance - f.reserve), money(f.target!), monthLabel(f.due_month!)),
    );
  if (!parts.length && !lines.length) return null;
  const style: TextStyle[] = [s.small, { color: c.secondaryLabel, textAlign: align === 'end' ? textEnd() : undefined }];
  return (
    <>
      {parts.length ? (
        <Text {...appDirText()} style={style}>
          {`${money(base)} ${parts.join(' ')}`}
        </Text>
      ) : null}
      {lines.map((line) => (
        <Text key={line} {...appDirText()} style={style}>
          {line}
        </Text>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  small: { fontSize: 13, ...moneyText },
});
