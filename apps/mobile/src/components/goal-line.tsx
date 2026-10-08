import { StyleSheet, Text, View } from 'react-native';

import type { Goal } from '@/api/types';
import { monthLabel } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';

// "₪1,200 a month until July 2027" (rounded up to whole units: nobody plans in agorot),
// "₪400 behind plan", or "Goal reached!".
export function GoalLine({ goal, currency }: { goal: Goal; currency: string }) {
  const c = useColors();
  if (goal.done) return <Text style={[s.meta, { color: c.green }]}>{t.goals.reached}</Text>;
  return (
    <View style={{ gap: 2 }}>
      {goal.monthly_needed != null && goal.target_month ? (
        <Text style={[s.meta, { color: c.secondaryLabel }]}>{t.goals.monthly(formatMoney(Math.ceil(goal.monthly_needed / 100) * 100, currency), monthLabel(goal.target_month))}</Text>
      ) : null}
      {goal.behind_by > 0 ? <Text style={[s.meta, { color: c.orange }]}>{t.goals.behind(formatMoney(Math.ceil(goal.behind_by / 100) * 100, currency))}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({ meta: { fontSize: 14, ...moneyText } });
