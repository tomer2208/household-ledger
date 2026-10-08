import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCategories, useCreateInvite, useHousehold, useSaveCategory, useSetBudgetsBulk } from '@/api/queries';
import { Button, CategoryIcon, ErrorText, Icon, Section } from '@/components/ui';
import { SAVINGS_TARGET_PCT, suggestBudgets } from '@/lib/budget';
import { t } from '@/lib/i18n';
import { formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { forwardIcon, textEnd } from '@/lib/rtl';
import { clearSetupPending } from '@/lib/setup';
import { APP_URL } from '@/lib/supabase';
import { moneyText, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

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
  const saveCategory = useSaveCategory();
  // P6: which categories are this household's. The rest are hidden (migration 47), not deleted.
  const [off, setOff] = useState<Set<string>>(new Set());
  const cur = hh.data?.household?.base_currency ?? 'ILS';
  const [step, setStep] = useState<Step>('income');
  const [incomeText, setIncomeText] = useState('');
  const income = parseMoneyInput(incomeText);
  const categories = useMemo(() => (cats.data ?? []).filter((x) => !x.archived_at), [cats.data]);
  // One text field per category, filled from the suggestion when the step opens.
  const [caps, setCaps] = useState<Record<string, string>>({});

  const openBudgets = () => {
    const suggested = suggestBudgets(income, categories.map((x) => x.sf_symbol));
    setCaps(Object.fromEntries(categories.map((x) => [x.id, suggested[x.sf_symbol] ? minorToInput(suggested[x.sf_symbol]) : ''])));
    setStep('budgets');
  };

  const entries = categories
    .filter((x) => !off.has(x.id))
    .map((x) => ({ categoryId: x.id, capMinor: parseMoneyInput(caps[x.id] ?? '') }))
    .filter((x): x is { categoryId: string; capMinor: number } => x.capMinor != null);
  const total = entries.reduce((a, b) => a + b.capMinor, 0);
  const left = income != null ? income - total : null;

  const saveBudgets = (budgets: typeof entries) => {
    const household = hh.data?.household;
    if (household)
      categories
        .filter((x) => off.has(x.id))
        .forEach((x) => saveCategory.mutate({ id: x.id, householdId: household.id, name: x.name, sfSymbol: x.sf_symbol, hidden: true }));
    save.mutate({ budgets, income: income ?? null }, { onSuccess: () => setStep('share') });
  };

  const dots = (
    <View style={s.dots} accessibilityLabel={t.setup.stepOf(['income', 'budgets', 'share'].indexOf(step) + 1, 3)}>
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
            <Text style={[s.title, { color: c.label }]}>{t.setup.incomeTitle}</Text>
            <Text style={[s.lead, { color: c.secondaryLabel }]}>
              {t.setup.incomeLead}
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
                accessibilityLabel={t.settings.income}
              />
              <Text style={[s.hint, { color: c.secondaryLabel }]}>{t.setup.perMonth(cur)}</Text>
            </View>
            <View style={s.actions}>
              <Button title={t.setup.next} onPress={openBudgets} disabled={!income} />
              <Button title={t.setup.skipIncome} kind="plain" onPress={openBudgets} />
            </View>
          </>
        ) : step === 'budgets' ? (
          <>
            <Text style={[s.title, { color: c.label }]}>{t.setup.budgetsTitle}</Text>
            <Text style={[s.lead, { color: c.secondaryLabel }]}>
              {income ? t.setup.budgetsLead(SAVINGS_TARGET_PCT) : t.setup.budgetsLeadNoIncome}
            </Text>
            <View style={[s.summary, { backgroundColor: c.cell }]}>
              <View>
                <Text style={[s.summaryLabel, { color: c.secondaryLabel }]}>{t.setup.budgeted}</Text>
                <Text style={[s.summaryValue, { color: c.label }]}>{formatMoney(total, cur)}</Text>
              </View>
              {left != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.summaryLabel, { color: c.secondaryLabel }]}>{left >= 0 ? t.setup.leftForSavings : t.setup.overIncome}</Text>
                  <Text style={[s.summaryValue, { color: left >= 0 ? c.green : c.red }]}>{formatMoney(Math.abs(left), cur)}</Text>
                </View>
              ) : null}
            </View>
            <Section>
              {categories.map((x, i) => (
                <View
                  key={x.id}
                  style={[s.capRow, i < categories.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <Pressable
                    onPress={() => setOff((o) => { const n = new Set(o); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !off.has(x.id) }}
                    accessibilityLabel={x.name}
                    hitSlop={8}>
                    <Icon name={off.has(x.id) ? 'circle' : 'checkmark.circle.fill'} size={24} color={off.has(x.id) ? c.tertiaryLabel : c.tint} />
                  </Pressable>
                  <CategoryIcon symbol={x.sf_symbol} categoryId={x.id} />
                  <Text style={[s.capName, { color: off.has(x.id) ? c.tertiaryLabel : c.label }]} numberOfLines={1}>
                    {x.name}
                  </Text>
                  <TextInput
                    editable={!off.has(x.id)}
                    value={caps[x.id] ?? ''}
                    onChangeText={(v) => setCaps((m) => ({ ...m, [x.id]: v }))}
                    placeholder={t.overview.noBudget}
                    placeholderTextColor={c.tertiaryLabel as string}
                    keyboardType="decimal-pad"
                    style={[s.capInput, { color: c.label, textAlign: textEnd() }]}
                    accessibilityLabel={t.setup.capA11y(x.name)}
                  />
                </View>
              ))}
            </Section>
            <ErrorText error={save.error} />
            <View style={s.actions}>
              <Button title={entries.length ? t.setup.saveBudgets(entries.length) : t.settings.continue} loading={save.isPending} onPress={() => saveBudgets(entries)} />
              <Button title={t.common.back} kind="plain" onPress={() => setStep('income')} />
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
    Share.share({ message: t.household.inviteMessage(url) }).catch(() => {});
  }

  const card = (icon: string, title: string, text: string, action: string, onPress: () => void, done?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.card, { backgroundColor: pressed ? c.fill : c.cell }]}>
      <CategoryIcon symbol={icon} />
      <View style={{ flex: 1 }}>
        <Text style={[s.cardTitle, { color: c.label }]}>{title}</Text>
        <Text style={[s.cardText, { color: c.secondaryLabel }]}>{text}</Text>
      </View>
      <Text style={[s.cardAction, { color: c.tint }]}>{done ? t.devices.copied : action}</Text>
      <Icon name={forwardIcon()} size={13} color={c.tertiaryLabel} />
    </Pressable>
  );

  return (
    <>
      <Text style={[s.title, { color: c.label }]}>{t.setup.almost}</Text>
      <Text style={[s.lead, { color: c.secondaryLabel }]}>{t.setup.almostLead}</Text>
      {card('person.2', t.setup.invite, t.setup.inviteBody, t.setup.shareLink, shareInvite, !!link)}
      {card('iphone.gen3', t.setup.applePay, t.setup.applePayBody, t.setup.setUp, async () => {
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
        <Button title={t.setup.go} onPress={finish} />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 16 },
  dot: { width: 28, height: 4, borderRadius: 2 },
  title: { fontFamily: fontFamily.body, fontSize: 28, fontWeight: '700', marginHorizontal: 20, marginTop: 24 },
  lead: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 22, marginHorizontal: 20, marginTop: 8 },
  amountWrap: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  amount: { fontSize: 52, fontWeight: '700', textAlign: 'center', minWidth: 200, ...moneyText },
  hint: { fontFamily: fontFamily.body, fontSize: 13, textAlign: 'center', marginHorizontal: 32 },
  actions: { marginHorizontal: 16, marginTop: 20, gap: 8 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 14 },
  summaryLabel: { fontFamily: fontFamily.body, fontSize: 13 },
  summaryValue: { fontSize: 22, fontWeight: '700', ...moneyText },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  capName: { fontFamily: fontFamily.body, flex: 1, fontSize: 17 },
  // 16px or larger, or iOS Safari zooms the page on focus.
  capInput: { width: 120, fontSize: 17, paddingVertical: 12, outlineStyle: 'none', ...moneyText } as any,
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 14, minHeight: 64 },
  cardTitle: { fontFamily: fontFamily.body, fontSize: 17, fontWeight: '600' },
  cardText: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 2 },
  cardAction: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
});
