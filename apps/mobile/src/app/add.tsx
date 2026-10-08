import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import {
  newTransactionId,
  useAddTransaction,
  useCategories,
  useCreateInstallments,
  useDeleteTransaction,
  useExpenseTemplates,
  useHousehold,
  useOverview,
  useSuggestedCategory,
} from '@/api/queries';
import type { Category } from '@/api/types';
import { money } from '@/components/money-text';
import { useToast } from '@/components/toast';
import { DateField } from '@/components/date-field';
import { InstallmentPicker } from '@/components/installment-picker';
import { KindToggle } from '@/components/kind-toggle';
import { CategoryIcon, ErrorText, Field, Icon, Section } from '@/components/ui';
import { lookOf } from '@/lib/category-look';
import { dayChipLabel, onDay, todayYmd, ymd } from '@/lib/dates';
import { envelopeStatus } from '@/lib/envelope';
import { errorMessage } from '@/lib/errors';
import { isRTL, t } from '@/lib/i18n';
import { CURRENCIES, formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { useIsOnline } from '@/lib/query';
import { moneyText, tokens, useColors } from '@/lib/theme';
import { useScheme } from '@/lib/appearance';
import { Pressable } from '@/components/pressable';

const DRAFT_KEY = 'hl-add-draft';
// How many envelopes show before "More": two rows of four, the ones used most (sort order).
const FIRST = 8;

// Opened cold from the Shortcut's deep link there is nothing to go back to.
const close = () => (router.canGoBack() ? router.back() : router.replace('/overview'));

// S1, direction D (docs/design/c4/prototype.html): the amount on our own keypad, so the phone's
// keyboard never covers the envelopes, and a tap on an envelope saves. "Save to …" at the
// bottom saves to the marked one. Before saving the sheet says what the expense will do to the
// envelope; after, the toast says what it did. Everything else (refund, currency, date,
// installments, name, note) is under More details. Also the target of finpace://add?... from
// the Shortcut's failure path (US-C3), so it keeps a local draft while offline.
export default function AddExpense() {
  const c = useColors();
  const dark = useScheme() === 'dark';
  // P1-8: `title`, `category` and `refund` come from Duplicate on an expense's details, and
  // `category` from tapping an envelope on Overview.
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
  const month = useOverview();
  const add = useAddTransaction();
  const del = useDeleteTransaction();
  const split = useCreateInstallments();
  const toast = useToast();
  const [payments, setPayments] = useState(1);
  const online = useIsOnline();
  const base = hh.data?.household?.base_currency ?? 'ILS';

  const [amount, setAmount] = useState(params.amount ?? '');
  const [currency, setCurrency] = useState(params.currency?.toUpperCase() ?? base);
  const [title, setTitle] = useState(params.title ?? params.merchant ?? '');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  const [refund, setRefund] = useState(params.refund === '1');
  const linked = params.occurred_at && !isNaN(new Date(params.occurred_at).getTime()) ? new Date(params.occurred_at) : null;
  const [day, setDay] = useState(linked ? ymd(linked) : todayYmd());
  const [details, setDetails] = useState(false);
  const [allEnvelopes, setAllEnvelopes] = useState(false);
  const [nudge, setNudge] = useState(false);

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
      if (Number.isInteger(d.payments) && d.payments >= 1 && d.payments <= 36) setPayments(d.payments);
    });
  }, [params.amount, params.merchant, params.title, base]);

  // P1-8: repeat expenses one tap away, and a category picked from the title.
  const templates = useExpenseTemplates();
  const [typedTitle, setTypedTitle] = useState(title);
  useEffect(() => {
    const timer = setTimeout(() => setTypedTitle(title), 300);
    return () => clearTimeout(timer);
  }, [title]);
  const suggestion = useSuggestedCategory(categoryId ? '' : typedTitle).data;
  const envelopes = (cats.data ?? []).filter((x) => !x.archived_at && !x.hidden && x.kind === 'expense');
  const suggestedId = suggestion && envelopes.some((x) => x.id === suggestion.category_id) ? suggestion.category_id : null;
  // Marked for "Save to …": the one picked, else the suggestion, else the first envelope.
  const selected = categoryId ?? suggestedId ?? envelopes[0]?.id ?? null;
  const applyTemplate = (tpl: { title: string; category_id: string; amount_minor: number; currency: string }) => {
    setTitle(tpl.title);
    setCategoryId(tpl.category_id);
    setAmount(minorToInput(tpl.amount_minor));
    setCurrency(tpl.currency);
  };

  const minor = parseMoneyInput(amount);
  const count = refund ? 1 : payments;
  const busy = add.isPending || split.isPending;
  const thisMonth = new Map((month.data?.categories ?? []).map((x) => [x.id, x]));
  // Only this month's share counts against the envelope: one payment of an installment plan.
  const effect = (id: string | null, m: number | null) => {
    const o = id ? thisMonth.get(id) : null;
    if (!o || !m || o.cap == null || o.cap <= 0) return null;
    const now = refund ? -m : Math.round(m / count);
    return { before: envelopeStatus(o.cap, o.spent), after: envelopeStatus(o.cap, o.spent + now) };
  };
  const name = (id: string | null) => envelopes.find((x) => x.id === id)?.name ?? '';

  async function save(id: string | null = selected) {
    if (!minor) {
      setNudge(true);
      return;
    }
    if (!id || !hh.data?.household || !hh.data.me || busy) return;
    if (!online) return saveDraft(id);
    const categoryName = name(id);
    const fx = currency === base ? effect(id, minor) : null;
    const expense = {
      id: newTransactionId(),
      householdId: hh.data.household.id,
      userId: hh.data.me.user_id,
      title: title.trim() || (refund ? t.add.refundTitle(categoryName) : categoryName) || t.common.expense,
      amountMinor: refund ? -minor : minor,
      currency,
      categoryId: id,
      // Today: the moment of saving. Another day keeps the time of day (the deep link's, or now).
      occurredAt: linked && ymd(linked) === day ? linked.toISOString() : day === todayYmd() ? new Date().toISOString() : onDay(day, linked ?? new Date()),
      note: note.trim() || null,
      rawMerchant: params.merchant ?? null,
    };
    const worse = fx && fx.after.state !== 'none' && fx.after.state !== fx.before.state && fx.after.state !== 'ok';
    const done = () => {
      if (Platform.OS === 'ios') Haptics.notificationAsync(worse ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      const after = fx?.after;
      const outcome =
        after && after.state !== 'none'
          ? after.state === 'over'
            ? t.add.savedOver(money(-after.left, base))
            : after.state === 'close'
              ? t.add.savedClose(money(after.left, base))
              : t.add.savedLeft(money(after.left, base))
          : '';
      toast({
        message: t.add.saved(formatMoney(minor, currency), categoryName) + outcome,
        action: { label: t.common.undo, onPress: () => del.mutate(expense.id) },
      });
      close();
    };
    // T7: one payment in the base currency is shown at once and the sheet closes; the save goes
    // on behind it. The draft is kept until the server has it, so a refusal loses nothing.
    if (count === 1 && currency === base) {
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ amount, title, currency, categoryId: id, day, refund, payments }));
      add
        .mutateAsync(expense)
        .then(() => AsyncStorage.removeItem(DRAFT_KEY))
        .catch((e) => toast({ message: t.add.saveFailed(errorMessage(e)) }));
      return done();
    }
    // Installments need the saved expense, and another currency the server's rate: wait for it.
    const saved = await add.mutateAsync(expense);
    if (count > 1) {
      try {
        await split.mutateAsync({ transactionId: saved, count });
      } catch {
        toast({ message: t.add.splitFailed });
      }
    }
    await AsyncStorage.removeItem(DRAFT_KEY);
    done();
  }

  async function saveDraft(id: string | null = selected) {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ amount, title, currency, categoryId: id, day, refund, payments }));
    close();
  }

  // A tap on an envelope saves once there's an amount; without one it marks the envelope.
  function pick(cat: Category) {
    setCategoryId(cat.id);
    if (minor) save(cat.id);
    else setNudge(true);
  }

  function press(k: string) {
    setNudge(false);
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    setAmount((a) => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : (a || '0') + '.';
      const [whole, frac] = a.split('.');
      if (frac !== undefined && frac.length >= 2) return a;
      if (frac === undefined && whole.length >= 7) return a;
      return a === '0' ? k : a + k;
    });
  }

  // On the web a hardware keyboard types into the keypad too.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === '.' || e.key === ',') press('.');
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') save();
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fx = currency === base ? effect(selected, minor) : null;
  const prompt = nudge
    ? { text: t.add.amountFirst, color: c.close }
    : fx && fx.after.state !== 'none'
      ? fx.after.state === 'over'
        ? { text: t.add.willGoOver(name(selected), money(-fx.after.left, base)), color: c.over }
        : fx.after.state === 'close'
          ? { text: t.add.willLeaveOnly(name(selected), money(fx.after.left, base)), color: c.close }
          : { text: t.add.willLeave(name(selected), money(fx.after.left, base)), color: c.text2 }
      : { text: t.add.prompt, color: c.text2 };
  const [whole, frac] = (amount || '0').split('.');
  const shown = `${Number(whole).toLocaleString('en-US')}${frac !== undefined ? `.${frac}` : ''}`;
  const visible = allEnvelopes ? envelopes : envelopes.slice(0, FIRST);
  const canSave = !!minor && !!selected && !busy && (count === 1 || (minor ?? 0) >= count);

  return (
    <View style={{ flex: 1, backgroundColor: c.raised }}>
      <View style={s.column}>
      <View style={s.head}>
        <Text style={[s.title, { color: c.text }]} accessibilityRole="header">
          {refund ? t.add.newRefund : t.add.addExpense}
        </Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.common.cancel} style={s.closeBtn}>
          <Icon name="xmark" size={20} color={c.text2} />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
        <Text
          style={[s.amount, { color: amount ? (refund ? c.positive : c.text) : c.text3 }]}
          accessibilityLabel={`${refund ? t.add.refundAmount : t.add.amount}: ${minor ? formatMoney(minor, currency) : '0'}`}
          accessibilityLiveRegion="polite">
          {currency === 'ILS' ? `${shown} ₪` : `${shown} ${currency}`}
        </Text>
        <Text style={[s.prompt, { color: prompt.color }]} accessibilityLiveRegion="polite">
          {prompt.text}
        </Text>

        <View style={s.chips}>
          <Chip label={day === todayYmd() ? t.dates.today : dayChipLabel(day)} icon="calendar" onPress={() => setDetails(true)} />
          <Chip label={t.add.moreDetails} icon="slider.horizontal.3" selected={details} onPress={() => setDetails((x) => !x)} />
        </View>

        {!title.trim() && !amount && (templates.data ?? []).length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recents} keyboardShouldPersistTaps="handled">
            {(templates.data ?? []).map((tpl) => (
              <Pressable
                key={tpl.title}
                onPress={() => applyTemplate(tpl)}
                accessibilityRole="button"
                accessibilityLabel={t.add.fillIn(tpl.title, formatMoney(tpl.amount_minor, tpl.currency))}
                style={[s.recent, { backgroundColor: c.bg }]}>
                <Text style={[s.recentTitle, { color: c.text }]} numberOfLines={1}>
                  {tpl.title}
                </Text>
                <Text style={[s.recentMeta, { color: c.text2 }]}>{formatMoney(tpl.amount_minor, tpl.currency)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {details ? (
          <View style={s.details}>
            <KindToggle refund={refund} onChange={setRefund} />
            <DateField value={day} onChange={setDay} />
            <View style={s.currencies}>
              {CURRENCIES.map((cur) => (
                <Chip key={cur} label={cur} selected={currency === cur} onPress={() => setCurrency(cur)} />
              ))}
            </View>
            {currency !== base ? <Text style={[s.hint, { color: c.text2 }]}>{t.add.converted(base)}</Text> : null}
            {!refund ? <InstallmentPicker value={payments} onChange={setPayments} totalMinor={minor} currency={currency} /> : null}
            <Section>
              <Field label={t.add.titleLabel} value={title} onChangeText={setTitle} placeholder={name(selected) || t.common.optional} />
              <Field label={t.add.note} value={note} onChangeText={setNote} placeholder={t.common.optional} last />
            </Section>
          </View>
        ) : null}

        <View style={s.picks} accessibilityRole="radiogroup">
          {visible.map((cat) => {
            const o = thisMonth.get(cat.id);
            const st = envelopeStatus(o?.cap, o?.spent ?? 0);
            const look = tokens.categoryColors[lookOf(cat).color][dark ? 'dark' : 'light'];
            const on = cat.id === selected;
            return (
              <Pressable
                key={cat.id}
                onPress={() => pick(cat)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={
                  st.state === 'over'
                    ? t.add.envelopeOverA11y(cat.name, money(-st.left, base))
                    : st.state === 'none'
                      ? cat.name
                      : t.add.envelopeA11y(cat.name, money(st.left, base))
                }
                style={({ pressed }) => [
                  s.pick,
                  { backgroundColor: c.bg },
                  on && { borderColor: c.action, borderWidth: 2 },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}>
                <Svg style={s.flap} width="100%" height={10} viewBox="0 0 100 10" preserveAspectRatio="none">
                  <Polygon points="0,0 100,0 50,10" fill={look.base} />
                </Svg>
                <CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} size={26} />
                <Text numberOfLines={1} style={[s.pickName, { color: c.text }]}>
                  {cat.name}
                </Text>
                {st.state !== 'none' ? (
                  <Text style={[s.pickLeft, { color: st.state === 'over' ? c.over : st.state === 'close' ? c.close : c.text2 }]}>
                    {st.state === 'over' ? `+${money(-st.left, base)}` : money(st.left, base)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {!allEnvelopes && envelopes.length > FIRST ? (
            <Pressable onPress={() => setAllEnvelopes(true)} accessibilityRole="button" style={[s.pick, s.more, { backgroundColor: c.fill }]}>
              <Icon name="ellipsis" size={20} color={c.text2} />
              <Text style={[s.pickName, { color: c.text2 }]}>{t.add.moreEnvelopes}</Text>
            </Pressable>
          ) : null}
        </View>
        {!online ? <Text style={[s.hint, { color: c.text2 }]}>{t.add.offline}</Text> : null}
        <ErrorText error={add.error} />
      </ScrollView>

      <View style={[s.bottom, { borderTopColor: c.line }]}>
        {/* 1-2-3 from the left, as on every phone keypad, in Hebrew too. */}
        <View style={s.keys}>
          {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'del']].map((row) => (
            <View key={row.join('')} style={[s.keyRow, { flexDirection: isRTL() ? 'row-reverse' : 'row' }]}>
              {row.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => press(k)}
                  accessibilityRole="button"
                  accessibilityLabel={k === 'del' ? t.add.keyDelete : k === '.' ? t.add.keyPoint : k}
                  style={({ pressed }) => [s.key, { backgroundColor: pressed ? c.fill : c.bg }]}>
                  {k === 'del' ? <Icon name="delete.left" size={22} color={c.text} /> : <Text style={[s.keyText, { color: c.text }]}>{k}</Text>}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => (online ? save() : saveDraft())}
          accessibilityRole="button"
          accessibilityState={{ disabled: online ? !canSave : !minor }}
          style={({ pressed }) => [
            s.save,
            { backgroundColor: (online ? canSave : !!minor) ? (pressed ? c.actionPressed : c.action) : c.disabledBg },
          ]}>
          <Text style={[s.saveText, { color: (online ? canSave : !!minor) ? c.onAction : c.disabledText }]} numberOfLines={1}>
            {online ? (refund ? t.add.saveRefund : t.add.saveIn(name(selected))) : t.add.saveDraft}
          </Text>
        </Pressable>
      </View>
      </View>
    </View>
  );
}

function Chip({ label, icon, selected, onPress }: { label: string; icon?: string; selected?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[s.chip, { backgroundColor: selected ? c.text : c.surface, borderColor: selected ? c.text : c.line }]}>
      {icon ? <Icon name={icon} size={15} color={selected ? c.bg : c.text} /> : null}
      <Text style={[s.chipText, { color: selected ? c.bg : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const { space, radius, type, contentMaxWidth } = tokens;
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[1] },
  title: { ...type.label },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: space[4], gap: space[3] },
  amount: { ...type.display, textAlign: 'center', writingDirection: 'ltr' },
  prompt: { ...type.secondary, fontWeight: '600', textAlign: 'center', marginTop: -space[2], marginHorizontal: space[4] },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: space[2], flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { ...type.secondary },
  recents: { gap: space[2], paddingHorizontal: space[4] },
  recent: { borderRadius: radius.tile, paddingHorizontal: 16, paddingVertical: space[2], minHeight: 44, justifyContent: 'center', maxWidth: 180 },
  recentTitle: { ...type.secondary, fontWeight: '600' },
  recentMeta: { ...type.caption, ...moneyText },
  details: { gap: space[3] },
  currencies: { flexDirection: 'row', gap: space[2], justifyContent: 'center' },
  hint: { ...type.caption, textAlign: 'center', marginHorizontal: space[8] },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: space[4] },
  pick: {
    width: '23.5%',
    minHeight: 76,
    borderRadius: radius.tile,
    paddingTop: 16,
    paddingBottom: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  more: { justifyContent: 'center', paddingTop: 6 },
  flap: { position: 'absolute', top: 0, start: 0, end: 0 },
  pickName: { ...type.caption, fontWeight: '600' },
  pickLeft: { ...type.caption, ...moneyText, fontSize: 11, lineHeight: 14 },
  bottom: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[6], gap: space[2], borderTopWidth: StyleSheet.hairlineWidth },
  // Q2: on a tablet or a computer the pad stays phone-sized, centred.
  column: { flex: 1, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' },
  keys: { gap: 6 },
  keyRow: { gap: 6 },
  key: { flex: 1, minHeight: 48, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  keyText: { ...moneyText, fontSize: 24 },
  save: { minHeight: 54, borderRadius: radius.tile + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4] },
  saveText: { ...type.label, fontSize: 18 },
});
