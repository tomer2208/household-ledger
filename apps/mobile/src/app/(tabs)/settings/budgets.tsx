import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useCategories, useOverview, useSetBudgetsBulk } from '@/api/queries';
import { money } from '@/components/money-text';
import { useToast } from '@/components/toast';
import { Button, CategoryIcon, ErrorText, Screen } from '@/components/ui';
import { incomePlan } from '@/lib/budget';
import { isRTL, t } from '@/lib/i18n';
import { minorToInput, parseMoneyInput } from '@/lib/money';
import { tokens, useColors } from '@/lib/theme';

// P3 (D3: five budgets used to cost twenty taps and ten scrolls; D4: YNAB's assign-all): every
// envelope's budget on one screen, with the total against income as it's typed, saved in one
// all-or-nothing call (set_budgets_bulk, migration 30). Empty means no budget.
export default function BudgetsScreen() {
  const cats = useCategories();
  const overview = useOverview();
  if (!cats.data || !overview.data) return <Screen />;
  return <Editor />;
}

function Editor() {
  const c = useColors();
  const toast = useToast();
  const cats = useCategories().data ?? [];
  const o = useOverview().data!;
  const save = useSetBudgetsBulk();
  const byId = new Map(o.categories.map((x) => [x.id, x]));
  const list = cats.filter((x) => !x.archived_at && !x.hidden);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(list.map((x) => [x.id, byId.get(x.id)?.base_cap ? minorToInput(byId.get(x.id)!.base_cap!) : ''])),
  );
  const parsed = list.map((x) => ({ id: x.id, minor: values[x.id]?.trim() ? parseMoneyInput(values[x.id]) : 0 }));
  const invalid = parsed.some((p) => p.minor == null);
  const total = parsed.reduce((a, p) => a + (p.minor ?? 0), 0);
  const plan = incomePlan(o.income, total);
  const cur = o.currency;
  const changed = parsed.some((p) => (p.minor ?? 0) !== (byId.get(p.id)?.base_cap ?? 0));

  return (
    <Screen>
      <Stack.Screen options={{ title: t.budgets.title, headerLargeTitle: false }} />
      <Text style={[s.lede, { color: c.text2 }]}>{t.budgets.lede}</Text>
      <View style={[s.card, { backgroundColor: c.surface }]}>
        {list.map((cat, i) => {
          const spent = byId.get(cat.id)?.spent ?? 0;
          return (
            <View key={cat.id} style={[s.row, i < list.length - 1 && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} />
              <View style={s.body}>
                <Text style={[s.name, { color: c.text }]} numberOfLines={1}>
                  {cat.name}
                </Text>
                {spent ? <Text style={[s.meta, { color: c.text2 }]}>{t.budget.spent(money(spent, cur))}</Text> : null}
              </View>
              <TextInput
                value={values[cat.id]}
                onChangeText={(v) => setValues((all) => ({ ...all, [cat.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={c.text3 as string}
                accessibilityLabel={`${cat.name}, ${t.categories.monthlyBudget}`}
                style={[s.input, { color: c.text, backgroundColor: c.bg, textAlign: isRTL() ? 'left' : 'right' }]}
              />
            </View>
          );
        })}
      </View>
      <View style={s.foot} accessibilityLiveRegion="polite">
        <Text style={[s.total, { color: c.text }]}>{t.budgets.total(money(total, cur))}</Text>
        {plan.kind !== 'none' ? (
          <Text style={[s.meta, { color: plan.health === 'over' ? c.over : plan.health === 'thin' ? c.close : c.text2 }]}>
            {plan.kind === 'over'
              ? t.categories.planOver(money(-plan.unassigned, cur), money(plan.income, cur))
              : t.categories.planLeft(money(plan.unassigned, cur), money(plan.income, cur), plan.savingsPct)}
          </Text>
        ) : null}
      </View>
      <ErrorText error={save.error} />
      <View style={s.actions}>
        <Button
          title={t.budgets.save}
          loading={save.isPending}
          disabled={invalid || !changed}
          onPress={() =>
            save.mutate(
              {
                // Only the ones that changed: an untouched empty field writes nothing.
                budgets: parsed
                  .filter((p) => (p.minor ?? 0) !== (byId.get(p.id)?.base_cap ?? 0))
                  .map((p) => ({ categoryId: p.id, capMinor: p.minor ?? 0 })),
                income: null,
              },
              {
                onSuccess: () => {
                  toast({ message: t.budgets.saved });
                  router.back();
                },
              },
            )
          }
        />
      </View>
    </Screen>
  );
}

const { space, radius, type } = tokens;
const s = StyleSheet.create({
  lede: { ...type.secondary, marginHorizontal: space[5], marginTop: space[4] },
  card: { marginHorizontal: space[4], marginTop: space[3], borderRadius: radius.envelope, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], minHeight: 60 },
  body: { flex: 1 },
  name: { ...type.body },
  meta: { ...type.caption },
  input: { ...type.amount, fontSize: 18, width: 110, minHeight: 44, borderRadius: radius.tile, paddingHorizontal: space[3] },
  foot: { marginHorizontal: space[5], marginTop: space[4], gap: space[1] },
  total: { ...type.body, fontWeight: '700' },
  actions: { marginHorizontal: space[4], marginTop: space[5] },
});
