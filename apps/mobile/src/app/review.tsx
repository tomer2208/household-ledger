import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCategories, useHousehold, usePendingReview, useReviewTransaction } from '@/api/queries';
import type { Transaction } from '@/api/types';
import { CategoryPicker } from '@/components/category-picker';
import { Button, Empty, ErrorText, Icon, Screen } from '@/components/ui';
import { isolate } from '@/lib/bidi';
import { dayLabel } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';

// US-C2 AC4: purchases whose Shortcut menu was dismissed land here. Confirming teaches the
// merchant memory exactly like the Shortcut does (review_transaction → confirm_pending).
export default function ReviewScreen() {
  const pending = usePendingReview();
  const items = pending.data ?? [];
  return (
    <Screen onRefresh={() => pending.refetch()} refreshing={pending.isRefetching}>
      <ErrorText error={pending.error} />
      {items.length === 0 && !pending.isLoading ? (
        <Empty icon="checkmark.circle.fill" title="All caught up" message="New places you pay at will show up here if you skip the Shortcut menu." />
      ) : null}
      {items.map((tx) => (
        <ReviewCard key={tx.id} tx={tx} />
      ))}
    </Screen>
  );
}

function ReviewCard({ tx }: { tx: Transaction }) {
  const c = useColors();
  const cats = useCategories();
  const base = useHousehold().data?.household?.base_currency ?? 'ILS';
  const review = useReviewTransaction();
  const [title, setTitle] = useState(tx.title);
  const [categoryId, setCategoryId] = useState<string>(tx.category_id);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const categoryName = cats.data?.find((x) => x.id === categoryId)?.name;

  return (
    <View style={[s.card, { backgroundColor: c.cell }]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={[s.raw, { color: c.secondaryLabel }]}>{isolate(tx.raw_merchant ?? tx.title)}</Text>
          <Text style={[s.when, { color: c.secondaryLabel }]}>{dayLabel(tx.occurred_at)}</Text>
        </View>
        <Text style={[s.amount, { color: c.label }]}>{formatMoney(tx.amount_minor, tx.currency ?? base)}</Text>
      </View>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[s.title, { color: c.label, borderColor: c.separator }]}
        placeholder="Name"
        accessibilityLabel="Name"
      />
      <View style={{ marginHorizontal: -16 }}>
        <CategoryPicker
          categories={cats.data ?? []}
          value={newCategory === null ? categoryId : null}
          onChange={(id) => {
            setCategoryId(id);
            setNewCategory(null);
          }}
        />
      </View>
      {newCategory === null ? (
        <Pressable onPress={() => setNewCategory('')} style={s.newCat} accessibilityRole="button">
          <Icon name="plus" size={16} color={c.tint} />
          <Text style={{ color: c.tint, fontSize: 15 }}>New category</Text>
        </Pressable>
      ) : (
        <TextInput
          value={newCategory}
          onChangeText={setNewCategory}
          autoFocus
          maxLength={30}
          placeholder="New category name"
          style={[s.title, { color: c.label, borderColor: c.tint }]}
        />
      )}
      <ErrorText error={review.error} />
      <Button
        title={newCategory ? `Create “${newCategory.trim()}” and confirm` : `Confirm as ${categoryName ?? '…'}`}
        loading={review.isPending}
        disabled={newCategory !== null && !newCategory.trim()}
        onPress={() =>
          review.mutate(
            newCategory
              ? { id: tx.id, newCategoryName: newCategory.trim(), title: title.trim() }
              : { id: tx.id, categoryName: categoryName!, title: title.trim() },
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  raw: { fontSize: 13 },
  when: { fontSize: 13, marginTop: 2 },
  amount: { fontSize: 22, fontWeight: '700', ...moneyText },
  title: { fontSize: 17, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  newCat: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, minHeight: 44 },
});
