import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useCategories, useHousehold, usePendingReview, useReviewTransaction } from '@/api/queries';
import type { Transaction } from '@/api/types';
import { CategoryPicker } from '@/components/category-picker';
import { DetailSkeleton } from '@/components/skeleton';
import { Button, CategoryIcon, Empty, ErrorText, Icon, LoadingState, Screen } from '@/components/ui';
import { isolate } from '@/lib/bidi';
import { dayLabel } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

// US-C2 AC4: purchases whose Shortcut menu was dismissed land here. Confirming teaches the
// merchant memory exactly like the Shortcut does (review_transaction → confirm_pending).
export default function ReviewScreen() {
  const pending = usePendingReview();
  const items = pending.data ?? [];
  return (
    <Screen onRefresh={() => pending.refetch()} refreshing={pending.isRefetching}>
      {!pending.data ? (
        <LoadingState error={pending.error} onRetry={() => pending.refetch()} retrying={pending.isFetching} skeleton={<DetailSkeleton />} />
      ) : items.length === 0 ? (
        <Empty icon="checkmark.circle.fill" title={t.review.emptyTitle} message={t.review.emptyMessage} />
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
  // S3 (D3): closed by default: the guess, and one tap to confirm. The full grid only on Change.
  const [changing, setChanging] = useState(false);
  const chosen = cats.data?.find((x) => x.id === categoryId);
  const categoryName = chosen?.name;

  return (
    <View style={[s.card, { backgroundColor: c.cell }]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={[s.raw, { color: c.secondaryLabel }]}>{isolate(tx.raw_merchant ?? tx.title)}</Text>
          <Text style={[s.when, { color: c.secondaryLabel }]}>{dayLabel(tx.occurred_at)}</Text>
        </View>
        <Text style={[s.amount, { color: c.label }]}>{formatMoney(tx.amount_minor, tx.currency ?? base)}</Text>
      </View>
      {!changing ? (
        <View style={s.guess}>
          {chosen ? <CategoryIcon symbol={chosen.sf_symbol} categoryId={chosen.id} /> : null}
          <Text style={[s.guessName, { color: c.text }]} numberOfLines={1}>
            {categoryName ?? '…'}
          </Text>
          <Pressable onPress={() => setChanging(true)} accessibilityRole="button" hitSlop={8} style={s.change}>
            <Text style={{ fontFamily: fontFamily.body, color: c.action, fontSize: 16, fontWeight: '600' }}>{t.review.change}</Text>
          </Pressable>
        </View>
      ) : null}
      {changing ? (
      <>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[s.title, { color: c.label, borderColor: c.separator }]}
        placeholder={t.review.name}
        accessibilityLabel={t.review.name}
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
          <Text style={{ fontFamily: fontFamily.body, color: c.tint, fontSize: 15 }}>{t.review.newCategory}</Text>
        </Pressable>
      ) : (
        <TextInput
          value={newCategory}
          onChangeText={setNewCategory}
          autoFocus
          maxLength={30}
          placeholder={t.review.newCategoryName}
          style={[s.title, { color: c.label, borderColor: c.tint }]}
        />
      )}
      </>
      ) : null}
      <ErrorText error={review.error} />
      <Button
        title={newCategory ? t.review.createAndConfirm(newCategory.trim()) : t.review.confirmAs(categoryName ?? '…')}
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
  raw: { fontFamily: fontFamily.body, fontSize: 13 },
  when: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 2 },
  amount: { fontSize: 22, fontWeight: '700', ...moneyText },
  title: { fontFamily: fontFamily.body, fontSize: 17, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  guess: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  guessName: { fontFamily: fontFamily.body, fontSize: 17, fontWeight: '600', flex: 1 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  newCat: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, minHeight: 44 },
});
