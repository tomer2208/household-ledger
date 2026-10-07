import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { useToast } from '@/components/toast';
import { DetailSkeleton } from '@/components/skeleton';
import { money } from '@/components/money-text';
import { Button, CategoryIcon, ErrorText, Field, LoadingState, Row, Screen, Section } from '@/components/ui';
import { dayLabel, monthLabel, monthOfDay, onDay, timeLabel, ymd } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatSigned, minorToInput, parseMoneyInput } from '@/lib/money';
import { t } from '@/lib/i18n';
import { useIsOnline } from '@/lib/query';
import { tokens, useColors } from '@/lib/theme';
import { installmentNo } from '@/lib/installments';
import { useTransactionActions } from '@/lib/transaction-actions';
import { fontFamily } from '@/lib/tokens';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useTransaction(id);
  // P1-12: its shape while it loads; a retry if it couldn't (a deleted expense says so).
  if (!query.data)
    return (
      <Screen>
        <LoadingState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} skeleton={<DetailSkeleton />} />
      </Screen>
    );
  // Keyed so a fresh row (e.g. the partner edited it) re-seeds the form.
  const tx = query.data;
  return <Editor key={tx.id + tx.amount_minor + tx.category_id + tx.occurred_at} tx={tx} />;
}

function Editor({ tx }: { tx: Transaction }) {
  const c = useColors();
  const cats = useCategories();
  const base = useHousehold().data?.household?.base_currency ?? 'ILS';
  const update = useUpdateTransaction();
  const toast = useToast();
  const actions = useTransactionActions();
  // P1-2: split this expense into monthly installments, or show which payment it is.
  const createSplit = useCreateInstallments();
  const [splitCount, setSplitCount] = useState<number | null>(null);
  const installment = installmentNo(tx);
  const canSplit = tx.amount_minor > 0 && tx.source !== 'recurring' && !tx.recurring_rule_id;
  const online = useIsOnline();
  const names = useMemberNames();
  const addedBy = names && tx.created_by ? names.get(tx.created_by) : undefined;

  const [title, setTitle] = useState(tx.title);
  const [amount, setAmount] = useState(minorToInput(tx.amount_minor));
  const [note, setNote] = useState(tx.note ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(tx.category_id);
  // R3: the calendar day, editable; the time of day is kept.
  const [day, setDay] = useState(ymd(new Date(tx.occurred_at)));
  const dayChanged = day !== ymd(new Date(tx.occurred_at));
  const closes = useMonthCloses().data ?? [];
  const newMonth = monthOfDay(day);
  const movesMonth = dayChanged && newMonth !== tx.budget_month;
  const touchesClosed = movesMonth && closes.some((m) => m.budget_month === newMonth || m.budget_month === tx.budget_month);

  const minor = parseMoneyInput(amount);
  // R4: expense or refund (negative), switchable in case it was entered the wrong way round.
  const [refund, setRefund] = useState(tx.amount_minor < 0);
  const signedMinor = minor == null ? null : refund ? -minor : minor;
  const dirty =
    title.trim() !== tx.title ||
    signedMinor !== tx.amount_minor ||
    (note.trim() || null) !== tx.note ||
    categoryId !== tx.category_id ||
    dayChanged;

  // T7: the change shows at once (this editor re-opens on the edited expense). If the server
  // refuses, the expense goes back to what it was and a toast says why: this editor is gone by then.
  // S2 (D1: the expense opened as a form): a view first; Edit opens the form, Save sits at the bottom.
  const [editing, setEditing] = useState(false);
  const cat = cats.data?.find((x) => x.id === tx.category_id);

  async function save() {
    if (!signedMinor || !categoryId) return;
    setEditing(false);
    await update.mutateAsync({
      id: tx.id,
      patch: {
        title: title.trim() || tx.title,
        amount_minor: signedMinor,
        category_id: categoryId,
        note: note.trim() || null,
        ...(dayChanged ? { occurred_at: onDay(day, new Date(tx.occurred_at)) } : {}),
        // US-R1 AC4: entering the real amount of an estimate confirms it.
        ...(tx.status === 'estimated' && signedMinor !== tx.amount_minor ? { status: 'confirmed' as const } : {}),
        // D3: saving an expense that waits for review confirms it, also when the guess was right.
        ...(tx.status === 'pending_review' ? { status: 'confirmed' as const } : {}),
      },
    }).catch((e) => toast({ message: errorMessage(e) }));
  }

  // R5: deletes at once and offers Undo in a toast on every platform (the PWA had none).
  async function deleteExpense() {
    if (await actions.remove(tx)) router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: undefined }} />
      {!editing ? (
        <>
          <View style={[s.card, { backgroundColor: c.surface }]}>
            <View style={s.cardTop}>
              {cat ? <CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} size={44} /> : null}
              <View style={s.cardBody}>
                <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={2}>
                  {tx.title}
                </Text>
                <Text style={[s.cardMeta, { color: c.text2 }]}>{cat?.name ?? ''}</Text>
              </View>
            </View>
            <Text style={[s.cardAmount, { color: tx.amount_minor < 0 ? c.positive : c.text }]}>
              {tx.amount_minor < 0 ? `+${money(-tx.amount_minor, tx.currency, true)}` : money(tx.amount_minor, tx.currency, true)}
            </Text>
            <Text style={[s.cardMeta, { color: c.text2 }]}>
              {[dayLabel(tx.occurred_at), timeLabel(tx.occurred_at), addedBy].filter(Boolean).join(' · ')}
            </Text>
            {tx.note ? <Text style={[s.cardNote, { color: c.text }]}>{tx.note}</Text> : null}
          </View>
          <View style={s.actions}>
            <Button title={t.common.edit} onPress={() => setEditing(true)} disabled={!online} />
          </View>
        </>
      ) : null}
      {editing ? (
      <>
      <View style={s.kind}>
        <KindToggle refund={refund} onChange={setRefund} />
      </View>
      <Section>
        <Field label={t.add.titleLabel} value={title} onChangeText={setTitle} />
        <Field label={t.detail.amount(tx.currency)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Field label={t.add.note} value={note} onChangeText={setNote} placeholder={t.common.optional} last />
      </Section>
      {tx.status === 'estimated' ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>{t.detail.estimateHint}</Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.detail.date}</Text>
      <DateField value={day} onChange={setDay} />
      {movesMonth ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>
          {t.detail.movesTo(monthLabel(newMonth))}
          {touchesClosed ? ` ${t.detail.touchesClosed}` : ''}
        </Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.add.category}</Text>
      <CategoryPicker categories={cats.data ?? []} value={categoryId} onChange={setCategoryId} />
      <View style={s.actions}>
        <Button title={t.common.save} onPress={save} loading={update.isPending} disabled={!dirty || !online} />
        <Button title={t.common.cancel} kind="plain" onPress={() => setEditing(false)} />
      </View>
      </>
      ) : null}

      <Section title={t.detail.info}>
        {installment ? <Row title={t.detail.installment} value={t.detail.installmentOf(installment.no, installment.count)} /> : null}
        {tx.currency !== base ? (
          <Row title={t.detail.inBase(base)} value={t.detail.rate(formatSigned(tx.amount_base_minor, base), Number(tx.fx_rate).toFixed(4))} />
        ) : null}
        <Row title={t.detail.source} value={tx.source === 'apple_pay' && tx.card_label ? `${t.tx.source.apple_pay} · ${tx.card_label}` : t.tx.source[tx.source]} />
        {tx.raw_merchant ? <Row title={t.detail.asCharged} value={tx.raw_merchant} /> : null}
        <Row title={t.detail.categoryBy} value={t.detail.method[tx.classification?.method ?? ''] ?? t.detail.you} last />
      </Section>

      {canSplit ? (
        <Section
          title={t.detail.installments}
          footer={
            splitCount && splitCount > 1
              ? t.detail.splitFooter
              : t.detail.splitPrompt
          }>
          {splitCount === null ? (
            <Row title={t.detail.splitRow} onPress={() => setSplitCount(12)} chevron={false} last />
          ) : (
            <View style={s.split}>
              <InstallmentPicker value={splitCount} onChange={setSplitCount} totalMinor={tx.amount_minor} currency={tx.currency} />
              <View style={s.splitActions}>
                <Button
                  title={splitCount > 1 ? t.detail.splitInto(splitCount) : t.detail.keepOne}
                  loading={createSplit.isPending}
                  disabled={!online || dirty}
                  onPress={() =>
                    splitCount > 1
                      ? createSplit.mutate({ transactionId: tx.id, count: splitCount }, { onSuccess: () => setSplitCount(null) })
                      : setSplitCount(null)
                  }
                />
                {dirty ? <Text style={[s.hint, { color: c.secondaryLabel }]}>{t.detail.saveFirst}</Text> : null}
              </View>
            </View>
          )}
        </Section>
      ) : null}

      <ErrorText error={createSplit.error} />
      <View style={s.actions}>
        {/* P1-8: the same expense again, dated today: for repeats that aren't recurring rules. */}
        <Button
          title={t.detail.duplicate}
          kind="plain"
          onPress={() =>
            router.push({
              pathname: '/add',
              params: {
                title: tx.title,
                amount: minorToInput(tx.amount_minor),
                currency: tx.currency,
                category: tx.category_id,
                ...(tx.amount_minor < 0 ? { refund: '1' } : {}),
              },
            })
          }
        />
        <Button title={t.detail.deleteExpense} kind="destructive" onPress={deleteExpense} disabled={!online} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hint: { fontFamily: fontFamily.body, fontSize: 13, marginHorizontal: 32, marginTop: 6 },
  kind: { marginTop: 16 },
  split: { paddingVertical: 12, gap: 12 },
  splitActions: { marginHorizontal: 16, gap: 6 },
  label: { fontFamily: fontFamily.body, fontSize: 13, marginStart: 32, marginTop: 24, marginBottom: 8 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
  card: { marginHorizontal: tokens.space[4], marginTop: tokens.space[4], borderRadius: tokens.radius.card, padding: tokens.space[5], gap: tokens.space[2] },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] },
  cardBody: { flex: 1 },
  cardTitle: { ...tokens.type.label },
  cardMeta: { ...tokens.type.secondary },
  cardAmount: { ...tokens.type.display, fontSize: 40, lineHeight: 46, marginTop: tokens.space[2] },
  cardNote: { ...tokens.type.body },
});
