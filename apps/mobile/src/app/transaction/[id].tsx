import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useCategories,
  useDeleteTransaction,
  useHousehold,
  useMemberNames,
  useRestoreTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/api/queries';
import type { Transaction } from '@/api/types';
import { CategoryPicker } from '@/components/category-picker';
import { Button, ErrorText, Field, Row, Screen, Section } from '@/components/ui';
import { shortDate, timeLabel } from '@/lib/dates';
import { formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { useIsOnline } from '@/lib/query';
import { confirm } from '@/lib/confirm';
import { useColors } from '@/lib/theme';

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
  return <Editor key={tx.data.id + tx.data.amount_minor + tx.data.category_id} t={tx.data} />;
}

function Editor({ t }: { t: Transaction }) {
  const c = useColors();
  const cats = useCategories();
  const base = useHousehold().data?.household?.base_currency ?? 'ILS';
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const restore = useRestoreTransaction();
  const online = useIsOnline();
  const names = useMemberNames();
  const addedBy = names && t.created_by ? names.get(t.created_by) : undefined;

  const [title, setTitle] = useState(t.title);
  const [amount, setAmount] = useState(minorToInput(t.amount_minor));
  const [note, setNote] = useState(t.note ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(t.category_id);

  const minor = parseMoneyInput(amount);
  const signedMinor = minor == null ? null : t.amount_minor < 0 ? -minor : minor;
  const dirty =
    title.trim() !== t.title || signedMinor !== t.amount_minor || (note.trim() || null) !== t.note || categoryId !== t.category_id;

  async function save() {
    if (!signedMinor || !categoryId) return;
    await update.mutateAsync({
      id: t.id,
      patch: {
        title: title.trim() || t.title,
        amount_minor: signedMinor,
        category_id: categoryId,
        note: note.trim() || null,
        // US-R1 AC4: entering the real amount of an estimate confirms it.
        ...(t.status === 'estimated' && signedMinor !== t.amount_minor ? { status: 'confirmed' as const } : {}),
        ...(t.status === 'pending_review' && categoryId !== t.category_id ? { status: 'confirmed' as const } : {}),
      },
    });
  }

  async function confirmDelete() {
    if (!(await confirm('Delete this expense?', 'Your partner will see it disappear too.', 'Delete'))) return;
    await del.mutateAsync(t.id);
    router.back();
    // US-M3 AC2: deletion is soft and undoable.
    if (Platform.OS !== 'web') {
      Alert.alert('Expense deleted', undefined, [
        { text: 'Undo', onPress: () => restore.mutate(t.id) },
        { text: 'OK', style: 'cancel' },
      ]);
    }
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={save} disabled={!dirty || !online || update.isPending} hitSlop={12}>
              <Text style={{ color: c.tint, fontSize: 17, fontWeight: '600', opacity: dirty && online ? 1 : 0.35 }}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <Section>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label={`Amount (${t.currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" last />
      </Section>
      {t.status === 'estimated' ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>This is an estimate. Enter the real amount when the bill arrives.</Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>CATEGORY</Text>
      <CategoryPicker categories={cats.data ?? []} value={categoryId} onChange={setCategoryId} />

      <Section title="Info">
        <Row title="Date" value={`${shortDate(t.occurred_at)}, ${timeLabel(t.occurred_at)}`} />
        {addedBy ? <Row title="Added by" value={addedBy} /> : null}
        {t.currency !== base ? (
          <Row title={`In ${base}`} value={`${formatMoney(t.amount_base_minor, base)} (rate ${Number(t.fx_rate).toFixed(4)})`} />
        ) : null}
        <Row title="Source" value={t.source === 'apple_pay' ? `Apple Pay${t.card_label ? ` · ${t.card_label}` : ''}` : t.source === 'recurring' ? 'Recurring' : 'Manual'} />
        {t.raw_merchant ? <Row title="As charged" value={t.raw_merchant} /> : null}
        <Row title="Category by" value={METHOD_LABEL[t.classification?.method ?? ''] ?? 'You'} last />
      </Section>

      <ErrorText error={update.error ?? del.error} />
      <View style={s.actions}>
        <Button title="Delete Expense" kind="destructive" onPress={confirmDelete} disabled={!online} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hint: { fontSize: 13, marginHorizontal: 32, marginTop: 6 },
  label: { fontSize: 13, marginLeft: 32, marginTop: 22, marginBottom: 8 },
  actions: { marginHorizontal: 16, marginTop: 24 },
});
