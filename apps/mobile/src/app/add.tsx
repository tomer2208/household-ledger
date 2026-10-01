import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAddTransaction, useCategories, useExpenseTemplates, useHousehold, useSuggestedCategory } from '@/api/queries';
import { CategoryPicker } from '@/components/category-picker';
import { DateField } from '@/components/date-field';
import { KindToggle } from '@/components/kind-toggle';
import { ErrorText, Field, Section } from '@/components/ui';
import { onDay, todayYmd, ymd } from '@/lib/dates';
import { CURRENCIES, formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { useIsOnline } from '@/lib/query';
import { moneyText, useColors } from '@/lib/theme';

const DRAFT_KEY = 'hl-add-draft';

// Opened cold from the Shortcut's deep link there is nothing to go back to.
const close = () => (router.canGoBack() ? router.back() : router.replace('/overview'));

// US-M4: amount → category → Save. Also the target of finpace://add?... from the
// Shortcut's failure path (US-C3), so it keeps a local draft while offline.
export default function AddExpense() {
  const c = useColors();
  // P1-8: `title`, `category` and `refund` come from Duplicate on an expense's details.
  const params = useLocalSearchParams<{
    amount?: string;
    currency?: string;
    merchant?: string;
    occurred_at?: string;
    title?: string;
    category?: string;
    refund?: string;
  }>();
  const hh = useHousehold();
  const cats = useCategories();
  const add = useAddTransaction();
  const online = useIsOnline();
  const base = hh.data?.household?.base_currency ?? 'ILS';

  const [amount, setAmount] = useState(params.amount ?? '');
  const [currency, setCurrency] = useState(params.currency?.toUpperCase() ?? base);
  const [title, setTitle] = useState(params.title ?? params.merchant ?? '');
  const [note, setNote] = useState('');
  // The category someone picked. Until they do, a suggestion from the title stands in (P1-8).
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  // R4: a refund is saved as a negative amount and lowers the category's spend.
  const [refund, setRefund] = useState(params.refund === '1');
  // R3: the calendar day it happened. A deep link brings its own; otherwise today.
  const linked = params.occurred_at && !isNaN(new Date(params.occurred_at).getTime()) ? new Date(params.occurred_at) : null;
  const [day, setDay] = useState(linked ? ymd(linked) : todayYmd());

  // Restore a draft saved while offline, unless the deep link brought fresh data.
  useEffect(() => {
    if (params.amount || params.merchant || params.title) return;
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      const d = JSON.parse(raw);
      setAmount(d.amount ?? '');
      setTitle(d.title ?? '');
      setCurrency(d.currency ?? base);
      setCategoryId(d.categoryId ?? null);
      if (d.day && d.day <= todayYmd()) setDay(d.day);
      setRefund(!!d.refund);
    });
  }, [params.amount, params.merchant, params.title, base]);

  // P1-8: repeat expenses one tap away, and a category picked from the title.
  const templates = useExpenseTemplates();
  // Ask once typing pauses, not on every keystroke.
  const [typedTitle, setTypedTitle] = useState(title);
  useEffect(() => {
    const t = setTimeout(() => setTypedTitle(title), 300);
    return () => clearTimeout(t);
  }, [title]);
  const suggestion = useSuggestedCategory(categoryId ? '' : typedTitle).data;
  const suggestedId =
    suggestion && cats.data?.some((x) => x.id === suggestion.category_id && !x.archived_at) ? suggestion.category_id : null;
  const selectedCategory = categoryId ?? suggestedId;
  const autoPicked = !categoryId && !!suggestedId;
  const applyTemplate = (t: { title: string; category_id: string; amount_minor: number; currency: string }) => {
    setTitle(t.title);
    setCategoryId(t.category_id);
    setAmount(minorToInput(t.amount_minor));
    setCurrency(t.currency);
  };

  const minor = parseMoneyInput(amount);
  const canSave = !!minor && !!selectedCategory && online && !add.isPending;
  const categoryName = cats.data?.find((x) => x.id === selectedCategory)?.name;

  async function save() {
    if (!minor || !selectedCategory || !hh.data?.household || !hh.data.me) return;
    await add.mutateAsync({
      householdId: hh.data.household.id,
      userId: hh.data.me.user_id,
      title: title.trim() || (refund ? `${categoryName ?? 'Refund'} refund` : categoryName) || 'Expense',
      amountMinor: refund ? -minor : minor,
      currency,
      categoryId: selectedCategory,
      // Today: the moment of saving. Another day keeps the time of day (the deep link's, or now).
      occurredAt: linked && ymd(linked) === day ? linked.toISOString() : day === todayYmd() ? undefined : onDay(day, linked ?? new Date()),
      note: note.trim() || null,
      rawMerchant: params.merchant ?? null,
    });
    await AsyncStorage.removeItem(DRAFT_KEY);
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
  }

  async function saveDraft() {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ amount, title, currency, categoryId: selectedCategory, day, refund }));
    close();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.groupedBackground }}>
      <View style={s.nav}>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={[s.navButton, { color: c.tint }]}>Cancel</Text>
        </Pressable>
        <Text style={[s.navTitle, { color: c.label }]}>{refund ? 'New Refund' : 'New Expense'}</Text>
        <Pressable
          onPress={online ? save : saveDraft}
          disabled={online ? !canSave : !minor}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityState={{ disabled: online ? !canSave : !minor }}>
          <Text style={[s.navButton, { color: c.tint, fontWeight: '600', opacity: (online ? canSave : !!minor) ? 1 : 0.35 }]}>
            {online ? (refund ? 'Save Refund' : 'Save') : 'Save Draft'}
          </Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.amountWrap}>
          <KindToggle refund={refund} onChange={setRefund} />
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={c.tertiaryLabel as string}
            keyboardType="decimal-pad"
            autoFocus={!params.amount}
            style={[s.amount, { color: refund ? c.green : c.label }]}
            accessibilityLabel={refund ? 'Refund amount' : 'Amount'}
          />
          <View style={s.currencies}>
            {CURRENCIES.map((cur) => (
              <Pressable
                key={cur}
                onPress={() => setCurrency(cur)}
                hitSlop={{ top: 4, bottom: 4 }}
                accessibilityRole="button"
                accessibilityState={{ selected: currency === cur }}
                style={[s.cur, { backgroundColor: currency === cur ? c.tint : c.fill }]}>
                <Text style={{ color: currency === cur ? c.onTint : c.label, fontWeight: '600', fontSize: 15 }}>{cur}</Text>
              </Pressable>
            ))}
          </View>
          <DateField value={day} onChange={setDay} />
          {currency !== base ? (
            <Text style={[s.hint, { color: c.secondaryLabel }]}>Converted to {base} at the day’s rate.</Text>
          ) : null}
        </View>

        {!title.trim() && (templates.data ?? []).length > 0 ? (
          <>
            <Text style={[s.label, { color: c.secondaryLabel }]}>RECENT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recents} keyboardShouldPersistTaps="handled">
              {(templates.data ?? []).map((t) => (
                <Pressable
                  key={t.title}
                  onPress={() => applyTemplate(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`Fill in ${t.title}, ${formatMoney(t.amount_minor, t.currency)}`}
                  style={[s.recent, { backgroundColor: c.cell }]}>
                  <Text style={[s.recentTitle, { color: c.label }]} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={[s.recentMeta, { color: c.secondaryLabel }]}>{formatMoney(t.amount_minor, t.currency)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={[s.label, { color: c.secondaryLabel }]}>CATEGORY</Text>
        <CategoryPicker categories={cats.data ?? []} value={selectedCategory} onChange={setCategoryId} />
        {autoPicked ? <Text style={[s.hint, s.picked, { color: c.secondaryLabel }]}>Picked from past expenses. Tap another to change it.</Text> : null}

        <Section title="Details">
          <Field label="Title" value={title} onChangeText={setTitle} placeholder={categoryName ?? 'Optional'} />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" last />
        </Section>
        {!online ? (
          <Text style={[s.hint, { color: c.secondaryLabel, marginTop: 12 }]}>
            You’re offline. The draft stays on this phone until you save it.
          </Text>
        ) : null}
        <ErrorText error={add.error} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  navButton: { fontSize: 17 },
  navTitle: { fontSize: 17, fontWeight: '600' },
  amountWrap: { alignItems: 'center', paddingVertical: 16, gap: 10 },
  amount: { fontSize: 52, fontWeight: '700', textAlign: 'center', minWidth: 160, ...moneyText },
  currencies: { flexDirection: 'row', gap: 8 },
  // 36 tall plus 4 of hitSlop each side = a 44pt target; 8 apart so neighbours aren't mis-tapped.
  cur: { paddingHorizontal: 14, borderRadius: 18, minHeight: 36, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, textAlign: 'center', marginHorizontal: 32 },
  label: { fontSize: 13, marginLeft: 32, marginTop: 8, marginBottom: 8 },
  recents: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  recent: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, justifyContent: 'center', maxWidth: 180 },
  recentTitle: { fontSize: 15, fontWeight: '600' },
  recentMeta: { fontSize: 13, marginTop: 1 },
  picked: { marginTop: 8, textAlign: 'left', marginHorizontal: 32 },
});
