import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useCategories,
  useHousehold,
  useMemberNames,
  useCreateInstallments,
  useMonthCloses,
  useTransaction,
  useUpdateTransaction,
} from '@/api/queries';
import type { Transaction } from '@/api/types';
import { CategoryPicker } from '@/components/category-picker';
import { DateField } from '@/components/date-field';
import { InstallmentPicker } from '@/components/installment-picker';
import { KindToggle } from '@/components/kind-toggle';
import { Button, ErrorText, Field, Row, Screen, Section } from '@/components/ui';
import { monthLabel, monthOfDay, onDay, timeLabel, ymd } from '@/lib/dates';
import { formatSigned, minorToInput, parseMoneyInput } from '@/lib/money';
import { useIsOnline } from '@/lib/query';
import { useColors } from '@/lib/theme';
import { installmentNo } from '@/lib/installments';
import { useTransactionActions } from '@/lib/transaction-actions';

const METHOD_LABEL: Record<string, string> = {
  alias: 'Known merchant',
  fuzzy: 'Matched a similar merchant',
  llm: 'AI suggestion',
  user: 'Chosen by you',
  none: 'Not classified yet',
};

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useTransaction(id);
  if (!tx.data) return <Screen><ErrorText error={tx.error} /></Screen>;
  // Keyed so a fresh row (e.g. the partner edited it) re-seeds the form.
  return <Editor key={tx.data.id + tx.data.amount_minor + tx.data.category_id + tx.data.occurred_at} t={tx.data} />;
}

function Editor({ t }: { t: Transaction }) {
  const c = useColors();
  const cats = useCategories();
  const base = useHousehold().data?.household?.base_currency ?? 'ILS';
  const update = useUpdateTransaction();
  const actions = useTransactionActions();
  // P1-2: split this expense into monthly installments, or show which payment it is.
  const createSplit = useCreateInstallments();
  const [splitCount, setSplitCount] = useState<number | null>(null);
  const installment = installmentNo(t);
  const canSplit = t.amount_minor > 0 && t.source !== 'recurring' && !t.recurring_rule_id;
  const online = useIsOnline();
  const names = useMemberNames();
  const addedBy = names && t.created_by ? names.get(t.created_by) : undefined;

  const [title, setTitle] = useState(t.title);
  const [amount, setAmount] = useState(minorToInput(t.amount_minor));
  const [note, setNote] = useState(t.note ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(t.category_id);
  // R3: the calendar day, editable; the time of day is kept.
  const [day, setDay] = useState(ymd(new Date(t.occurred_at)));
  const dayChanged = day !== ymd(new Date(t.occurred_at));
  const closes = useMonthCloses().data ?? [];
  const newMonth = monthOfDay(day);
  const movesMonth = dayChanged && newMonth !== t.budget_month;
  const touchesClosed = movesMonth && closes.some((m) => m.budget_month === newMonth || m.budget_month === t.budget_month);

  const minor = parseMoneyInput(amount);
  // R4: expense or refund (negative), switchable in case it was entered the wrong way round.
  const [refund, setRefund] = useState(t.amount_minor < 0);
  const signedMinor = minor == null ? null : refund ? -minor : minor;
  const dirty =
    title.trim() !== t.title ||
    signedMinor !== t.amount_minor ||
    (note.trim() || null) !== t.note ||
    categoryId !== t.category_id ||
    dayChanged;

  async function save() {
    if (!signedMinor || !categoryId) return;
    await update.mutateAsync({
      id: t.id,
      patch: {
        title: title.trim() || t.title,
        amount_minor: signedMinor,
        category_id: categoryId,
        note: note.trim() || null,
        ...(dayChanged ? { occurred_at: onDay(day, new Date(t.occurred_at)) } : {}),
        // US-R1 AC4: entering the real amount of an estimate confirms it.
        ...(t.status === 'estimated' && signedMinor !== t.amount_minor ? { status: 'confirmed' as const } : {}),
        ...(t.status === 'pending_review' && categoryId !== t.category_id ? { status: 'confirmed' as const } : {}),
      },
    });
  }

  // R5: deletes at once and offers Undo in a toast on every platform (the PWA had none).
  async function deleteExpense() {
    if (await actions.remove(t)) router.back();
  }


  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={save}
              disabled={!dirty || !online || update.isPending}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ disabled: !dirty || !online || update.isPending }}>
              <Text style={{ color: c.tint, fontSize: 17, fontWeight: '600', opacity: dirty && online ? 1 : 0.35 }}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <View style={s.kind}>
        <KindToggle refund={refund} onChange={setRefund} />
      </View>
      <Section>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label={`Amount (${t.currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" last />
      </Section>
      {t.status === 'estimated' ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>This is an estimate. Enter the real amount when the bill arrives.</Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>DATE</Text>
      <DateField value={day} onChange={setDay} />
      {movesMonth ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>
          Moves to {monthLabel(newMonth)}.
          {touchesClosed ? ' That touches a closed month, so savings change by the difference.' : ''}
        </Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>CATEGORY</Text>
      <CategoryPicker categories={cats.data ?? []} value={categoryId} onChange={setCategoryId} />

      <Section title="Info">
        <Row title="Time" value={timeLabel(t.occurred_at)} />
        {installment ? <Row title="Installment" value={`${installment.no} of ${installment.count}`} /> : null}
        {addedBy ? <Row title="Added by" value={addedBy} /> : null}
        {t.currency !== base ? (
          <Row title={`In ${base}`} value={`${formatSigned(t.amount_base_minor, base)} (rate ${Number(t.fx_rate).toFixed(4)})`} />
        ) : null}
        <Row title="Source" value={t.source === 'apple_pay' ? `Apple Pay${t.card_label ? ` · ${t.card_label}` : ''}` : t.source === 'recurring' ? 'Recurring' : 'Manual'} />
        {t.raw_merchant ? <Row title="As charged" value={t.raw_merchant} /> : null}
        <Row title="Category by" value={METHOD_LABEL[t.classification?.method ?? ''] ?? 'You'} last />
      </Section>

      {canSplit ? (
        <Section
          title="Installments"
          footer={
            splitCount && splitCount > 1
              ? 'This expense becomes the first payment; the rest are added on the same day each month, under Recurring.'
              : 'Paid in installments (תשלומים)? Spread it over the months it is charged.'
          }>
          {splitCount === null ? (
            <Row title="Split into Installments" onPress={() => setSplitCount(12)} chevron={false} last />
          ) : (
            <View style={s.split}>
              <InstallmentPicker value={splitCount} onChange={setSplitCount} totalMinor={t.amount_minor} currency={t.currency} />
              <View style={s.splitActions}>
                <Button
                  title={splitCount > 1 ? `Split into ${splitCount} Payments` : 'Keep as One Payment'}
                  loading={createSplit.isPending}
                  disabled={!online || dirty}
                  onPress={() =>
                    splitCount > 1
                      ? createSplit.mutate({ transactionId: t.id, count: splitCount }, { onSuccess: () => setSplitCount(null) })
                      : setSplitCount(null)
                  }
                />
                {dirty ? <Text style={[s.hint, { color: c.secondaryLabel }]}>Save your changes first.</Text> : null}
              </View>
            </View>
          )}
        </Section>
      ) : null}

      <ErrorText error={update.error ?? createSplit.error} />
      <View style={s.actions}>
        {/* P1-8: the same expense again, dated today: for repeats that aren't recurring rules. */}
        <Button
          title="Duplicate"
          kind="plain"
          onPress={() =>
            router.push({
              pathname: '/add',
              params: {
                title: t.title,
                amount: minorToInput(t.amount_minor),
                currency: t.currency,
                category: t.category_id,
                ...(t.amount_minor < 0 ? { refund: '1' } : {}),
              },
            })
          }
        />
        <Button title="Delete Expense" kind="destructive" onPress={deleteExpense} disabled={!online} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hint: { fontSize: 13, marginHorizontal: 32, marginTop: 6 },
  kind: { marginTop: 16 },
  split: { paddingVertical: 12, gap: 12 },
  splitActions: { marginHorizontal: 16, gap: 6 },
  label: { fontSize: 13, marginLeft: 32, marginTop: 22, marginBottom: 8 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
});
