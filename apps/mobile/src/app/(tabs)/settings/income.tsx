import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useHousehold, useOverview, useSetIncome } from '@/api/queries';
import { IncomePlanCard } from '@/components/income-plan';
import { Button, ErrorText, Field, Screen, Section } from '@/components/ui';
import { SAVINGS_TARGET_PCT } from '@/lib/budget';
import { t } from '@/lib/i18n';
import { useIncomeActions } from '@/lib/income-actions';
import { minorToInput, parseMoneyInput } from '@/lib/money';

export default function IncomeScreen() {
  const overview = useOverview();
  if (!overview.data) return <Screen />;
  return <Editor />;
}

// The household's combined take-home pay: the pool every category budget comes out of.
function Editor() {
  const o = useOverview().data!;
  const cur = useHousehold().data?.household?.base_currency ?? o.currency;
  const setIncome = useSetIncome();
  const actions = useIncomeActions();
  const [text, setText] = useState(o.income ? minorToInput(o.income) : '');

  // Empty clears it; anything else must parse to an amount.
  const typed = text.trim() === '' ? 0 : parseMoneyInput(text);
  const changed = typed != null && typed !== (o.income ?? 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: t.settings.income, headerLargeTitle: false }} />
      {/* Live: the plan under the income being typed, before saving. */}
      <IncomePlanCard income={typed || null} budgeted={o.total_cap} currency={cur} />

      <Section
        title={t.income.section}
        footer={t.income.footer(SAVINGS_TARGET_PCT)}>
        <Field
          label={t.detail.amount(cur)}
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          placeholder={t.settings.notSet}
          autoFocus={!o.income}
          last
        />
      </Section>

      <ErrorText error={setIncome.error} />
      <View style={s.actions}>
        <Button
          title={t.common.save}
          disabled={!changed}
          loading={setIncome.isPending}
          onPress={async () => {
            await setIncome.mutateAsync(typed!);
            router.back();
          }}
        />
      </View>
      {/* Kept apart from Save so removing is never a mis-tap away. */}
      {o.income ? (
        <View style={s.danger}>
          <Button
            title={t.income.remove}
            kind="destructive"
            onPress={async () => {
              if (await actions.remove()) router.back();
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
  danger: { marginHorizontal: 16, marginTop: 32 },
});
