import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCategories, useCreateInvite, useHousehold, useSetBudgetsBulk } from '@/api/queries';
import { Button, CategoryIcon, ErrorText, Icon, Section } from '@/components/ui';
import { SAVINGS_TARGET_PCT, suggestBudgets } from '@/lib/budget';
import { formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { clearSetupPending } from '@/lib/setup';
import { APP_URL } from '@/lib/supabase';
import { moneyText, useColors } from '@/lib/theme';

// P1-7: from a new household to a working budget in about two minutes. Three steps, each one
// skippable: monthly income → suggested budgets (edit or blank any line) → invite a partner and
// set up Apple Pay logging. Budgets and income are saved together, all or nothing.
type Step = 'income' | 'budgets' | 'share';

const finish = async () => {
  await clearSetupPending();
  router.replace('/overview');
};

export default function Setup() {
  const c = useColors();
  const hh = useHousehold();
  const cats = useCategories();
  const save = useSetBudgetsBulk();
  const cur = hh.data?.household?.base_currency ?? 'ILS';
  const [step, setStep] = useState<Step>('income');
  const [incomeText, setIncomeText] = useState('');
  const income = parseMoneyInput(incomeText);
  const categories = useMemo(() => (cats.data ?? []).filter((x) => !x.archived_at), [cats.data]);
  // One text field per category, filled from the suggestion when the step opens.
  const [caps, setCaps] = useState<Record<string, string>>({});

  const openBudgets = () => {
    const suggested = suggestBudgets(income, categories.map((x) => x.name));
    setCaps(Object.fromEntries(categories.map((x) => [x.id, suggested[x.name] ? minorToInput(suggested[x.name]) : ''])));
    setStep('budgets');
  };

  const entries = categories
    .map((x) => ({ categoryId: x.id, capMinor: parseMoneyInput(caps[x.id] ?? '') }))
    .filter((x): x is { categoryId: string; capMinor: number } => x.capMinor != null);
  const total = entries.reduce((a, b) => a + b.capMinor, 0);
  const left = income != null ? income - total : null;

  const saveBudgets = (budgets: typeof entries) =>
    save.mutate({ budgets, income: income ?? null }, { onSuccess: () => setStep('share') });

  const dots = (
    <View style={s.dots} accessibilityLabel={`Step ${['income', 'budgets', 'share'].indexOf(step) + 1} of 3`}>
      {(['income', 'budgets', 'share'] as Step[]).map((x) => (
        <View key={x} style={[s.dot, { backgroundColor: x === step ? c.tint : c.fill }]} />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.groupedBackground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
        {dots}
        {step === 'income' ? (
          <>
            <Text style={[s.title, { color: c.label }]}>What comes in each month?</Text>
            <Text style={[s.lead, { color: c.secondaryLabel }]}>
              Your household’s combined take-home pay. Budgets are carved out of it, and what’s left over is your savings.
            </Text>
            <View style={s.amountWrap}>
              <TextInput
                value={incomeText}
                onChangeText={setIncomeText}
                placeholder="0"
                placeholderTextColor={c.tertiaryLabel as string}
                keyboardType="decimal-pad"
                autoFocus
                style={[s.amount, { color: c.label }]}
                accessibilityLabel="Monthly income"
              />
              <Text style={[s.hint, { color: c.secondaryLabel }]}>{cur} a month</Text>
            </View>
            <View style={s.actions}>
              <Button title="Next" onPress={openBudgets} disabled={!income} />
              <Button title="Skip, I’ll budget without it" kind="plain" onPress={openBudgets} />
            </View>
          </>
        ) : step === 'budgets' ? (
          <>
            <Text style={[s.title, { color: c.label }]}>Your monthly budgets</Text>
            <Text style={[s.lead, { color: c.secondaryLabel }]}>
              {income
                ? `A starting point that keeps ${SAVINGS_TARGET_PCT}% for savings. Change any amount, or clear it for no budget.`
                : 'Give each category a monthly amount, or leave it empty for no budget.'}
            </Text>
            <View style={[s.summary, { backgroundColor: c.cell }]}>
              <View>
                <Text style={[s.summaryLabel, { color: c.secondaryLabel }]}>Budgeted</Text>
                <Text style={[s.summaryValue, { color: c.label }]}>{formatMoney(total, cur)}</Text>
              </View>
              {left != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.summaryLabel, { color: c.secondaryLabel }]}>{left >= 0 ? 'Left for savings' : 'Over income'}</Text>
                  <Text style={[s.summaryValue, { color: left >= 0 ? c.green : c.red }]}>{formatMoney(Math.abs(left), cur)}</Text>
                </View>
              ) : null}
            </View>
            <Section>
              {categories.map((x, i) => (
                <View
                  key={x.id}
                  style={[s.capRow, i < categories.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <CategoryIcon symbol={x.sf_symbol} />
                  <Text style={[s.capName, { color: c.label }]} numberOfLines={1}>
                    {x.name}
                  </Text>
                  <TextInput
                    value={caps[x.id] ?? ''}
                    onChangeText={(v) => setCaps((m) => ({ ...m, [x.id]: v }))}
                    placeholder="No budget"
                    placeholderTextColor={c.tertiaryLabel as string}
                    keyboardType="decimal-pad"
                    style={[s.capInput, { color: c.label }]}
                    accessibilityLabel={`${x.name} monthly budget`}
                  />
                </View>
              ))}
            </Section>
            <ErrorText error={save.error} />
            <View style={s.actions}>
              <Button title={entries.length ? `Save ${entries.length} Budgets` : 'Continue'} loading={save.isPending} onPress={() => saveBudgets(entries)} />
              <Button title="Back" kind="plain" onPress={() => setStep('income')} />
            </View>
          </>
        ) : (
          <ShareStep />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShareStep() {
  const c = useColors();
  const invite = useCreateInvite();
  const [link, setLink] = useState<string | null>(null);

  async function shareInvite() {
    const url = link ?? `${APP_URL}/join/${await invite.mutateAsync()}`;
    setLink(url);
    // The link is also shown on screen, so a refused clipboard (some browsers) isn't fatal.
    await Clipboard.setStringAsync(url).catch(() => {});
    Share.share({ message: `Join our household in FinPace: ${url}` }).catch(() => {});
  }

  const card = (icon: string, title: string, text: string, action: string, onPress: () => void, done?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.card, { backgroundColor: pressed ? c.fill : c.cell }]}>
      <CategoryIcon symbol={icon} />
      <View style={{ flex: 1 }}>
        <Text style={[s.cardTitle, { color: c.label }]}>{title}</Text>
        <Text style={[s.cardText, { color: c.secondaryLabel }]}>{text}</Text>
      </View>
      <Text style={[s.cardAction, { color: c.tint }]}>{done ? 'Copied ✓' : action}</Text>
      <Icon name="chevron.right" size={13} color={c.tertiaryLabel} />
    </Pressable>
  );

  return (
    <>
      <Text style={[s.title, { color: c.label }]}>Almost there</Text>
      <Text style={[s.lead, { color: c.secondaryLabel }]}>Two things that make FinPace work on its own. Both can wait.</Text>
      {card('person.2', 'Invite your partner', 'You both see every expense, live.', 'Share link', shareInvite, !!link)}
      {card('iphone.gen3', 'Log Apple Pay automatically', 'A Shortcut records each purchase as you pay.', 'Set up', async () => {
        await clearSetupPending();
        router.replace('/overview');
        router.push('/settings/devices');
      })}
      {link ? (
        <Text selectable style={[s.hint, { color: c.secondaryLabel, marginTop: 8 }]}>
          {link}
        </Text>
      ) : null}
      <ErrorText error={invite.error} />
      <View style={s.actions}>
        <Button title="Go to My Budget" onPress={finish} />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 16 },
  dot: { width: 28, height: 4, borderRadius: 2 },
  title: { fontSize: 28, fontWeight: '700', marginHorizontal: 20, marginTop: 24 },
  lead: { fontSize: 16, lineHeight: 22, marginHorizontal: 20, marginTop: 8 },
  amountWrap: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  amount: { fontSize: 52, fontWeight: '700', textAlign: 'center', minWidth: 200, ...moneyText },
  hint: { fontSize: 13, textAlign: 'center', marginHorizontal: 32 },
  actions: { marginHorizontal: 16, marginTop: 20, gap: 8 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 14 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 22, fontWeight: '700', ...moneyText },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  capName: { flex: 1, fontSize: 17 },
  // 16px or larger, or iOS Safari zooms the page on focus.
  capInput: { width: 120, fontSize: 17, textAlign: 'right', paddingVertical: 10, outlineStyle: 'none', ...moneyText } as any,
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, minHeight: 64 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardText: { fontSize: 13, marginTop: 2 },
  cardAction: { fontSize: 15, fontWeight: '600' },
});
