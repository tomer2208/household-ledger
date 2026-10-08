import { type ReactNode, useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateInput, hasSystemDatePicker } from './date-input';
import { Button, CategoryIcon, Icon } from './ui';
import { useCategories, useHousehold, useTransactionSummary } from '@/api/queries';
import { dayChipLabel, monthLabel, todayYmd } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { minorToInput, parseMoneyInput } from '@/lib/money';
import {
  EMPTY_FILTER,
  KINDS,
  PERIODS,
  serverFilter,
  SOURCES,
  toggleIn,
  type Period,
  type TxFilter,
  withoutPeriod,
} from '@/lib/search-filter';
import { textStart } from '@/lib/rtl';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

// P1-9: every filter in one sheet. Changes are a draft until Show, and the button counts what
// the draft would show (summarize_transactions), so nobody applies a filter that finds nothing.
export function FilterSheet({
  visible,
  value,
  query,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: TxFilter;
  query: string;
  onApply: (f: TxFilter) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      {visible ? <Sheet value={value} query={query} onApply={onApply} onClose={onClose} /> : null}
    </Modal>
  );
}

function Sheet({ value, query, onApply, onClose }: { value: TxFilter; query: string; onApply: (f: TxFilter) => void; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const hh = useHousehold().data;
  const base = hh?.household?.base_currency ?? 'ILS';
  const members = hh?.members ?? [];
  const cats = (useCategories().data ?? []).filter(
    (x) => x.kind === 'expense' && (!x.archived_at || value.categories.includes(x.id)),
  );
  const [draft, setDraft] = useState(value);
  const [minText, setMinText] = useState(value.min != null ? minorToInput(value.min) : '');
  const [maxText, setMaxText] = useState(value.max != null ? minorToInput(value.max) : '');

  // Count what the draft finds once typing pauses, not on every keystroke.
  const [counted, setCounted] = useState(draft);
  useEffect(() => {
    const timer = setTimeout(() => setCounted(draft), 300);
    return () => clearTimeout(timer);
  }, [draft]);
  const summary = useTransactionSummary(serverFilter(counted, query));
  const n = summary.data?.count;

  const setPeriod = (p: Period) =>
    setDraft((d) => (d.period === p ? withoutPeriod(d) : { ...withoutPeriod(d), period: p }));
  const today = todayYmd();
  const periods: Period[] = [...PERIODS, ...(hasSystemDatePicker ? (['custom'] as const) : [])];
  // A past month opened from Overview stays offered until another period replaces it.
  const monthChip = draft.period === 'month' && draft.month;

  const amount = (text: string, which: 'min' | 'max') => {
    (which === 'min' ? setMinText : setMaxText)(text);
    const v = parseMoneyInput(text);
    setDraft((d) => ({ ...d, [which]: v != null && v > 0 ? v : null }));
  };
  const reset = () => {
    setDraft(EMPTY_FILTER);
    setMinText('');
    setMaxText('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.groupedBackground, paddingTop: Platform.OS === 'web' ? insets.top : 0 }}>
      <View style={[s.bar, { borderBottomColor: c.separator }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <Text style={[s.barButton, { color: c.tint }]}>{t.common.cancel}</Text>
        </Pressable>
        <Text style={[s.barTitle, { color: c.label }]} accessibilityRole="header">
          {t.filters.title}
        </Text>
        <Pressable onPress={reset} hitSlop={12} accessibilityRole="button">
          <Text style={[s.barButton, { color: c.tint }]}>{t.filters.reset}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Group title={t.filters.period}>
          {monthChip ? <Choice label={monthLabel(draft.month!)} selected onPress={() => setDraft(withoutPeriod)} /> : null}
          {periods.map((p) => (
            <Choice key={p} label={t.filters.periods[p as keyof typeof t.filters.periods]} selected={draft.period === p} onPress={() => setPeriod(p)} />
          ))}
        </Group>
        {draft.period === 'custom' ? (
          <View style={s.days}>
            <DayChoice
              label={t.filters.from}
              value={draft.from}
              max={draft.to ?? today}
              onChange={(from) => setDraft((d) => ({ ...d, from }))}
            />
            <DayChoice
              label={t.filters.to}
              value={draft.to}
              max={today}
              onChange={(to) => setDraft((d) => ({ ...d, to }))}
            />
          </View>
        ) : null}

        <Group title={t.filters.amount} footer={t.filters.amountHint(base)}>
          <View style={s.amounts}>
            {(['min', 'max'] as const).map((which) => (
              <TextInput
                key={which}
                value={which === 'min' ? minText : maxText}
                onChangeText={(x) => amount(x, which)}
                placeholder={which === 'min' ? t.filters.min : t.filters.max}
                placeholderTextColor={c.tertiaryLabel as string}
                keyboardType="decimal-pad"
                inputMode="decimal"
                accessibilityLabel={which === 'min' ? t.filters.min : t.filters.max}
                style={[s.amount, { backgroundColor: c.cell, color: c.label, textAlign: textStart() }]}
              />
            ))}
          </View>
        </Group>

        <Group title={t.filters.categories}>
          {cats.map((cat) => (
            <Choice
              key={cat.id}
              label={cat.name}
              icon={<CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} size={20} />}
              selected={draft.categories.includes(cat.id)}
              onPress={() => setDraft((d) => toggleIn.categories(d, cat.id))}
            />
          ))}
        </Group>

        {members.length > 1 ? (
          <Group title={t.filters.who}>
            {members.map((m) => (
              <Choice
                key={m.user_id}
                label={m.display_name}
                selected={draft.members.includes(m.user_id)}
                onPress={() => setDraft((d) => toggleIn.members(d, m.user_id))}
              />
            ))}
          </Group>
        ) : null}

        <Group title={t.filters.source}>
          {SOURCES.map((x) => (
            <Choice key={x} label={t.tx.source[x]} selected={draft.sources.includes(x)} onPress={() => setDraft((d) => toggleIn.sources(d, x))} />
          ))}
        </Group>

        <Group title={t.filters.kind}>
          {KINDS.map((k) => (
            <Choice
              key={k}
              label={t.filters.kinds[k]}
              selected={draft.kind === k}
              onPress={() => setDraft((d) => ({ ...d, kind: d.kind === k ? null : k }))}
            />
          ))}
        </Group>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: 12 + insets.bottom, borderTopColor: c.separator, backgroundColor: c.groupedBackground }]}>
        <Button
          title={n == null || summary.isPlaceholderData ? t.filters.showResults : t.filters.show(n)}
          onPress={() => onApply(draft)}
        />
      </View>
    </View>
  );
}

function Group({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={s.group}>
      <Text style={[s.groupTitle, { color: c.secondaryLabel }]}>{title}</Text>
      <View style={s.choices}>{children}</View>
      {footer ? <Text style={[s.groupFooter, { color: c.secondaryLabel }]}>{footer}</Text> : null}
    </View>
  );
}

function Choice({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[s.choice, { backgroundColor: selected ? c.tint : c.cell }]}>
      {/* A category icon is tinted on a tinted square; on the selected (tinted) chip it keeps a light backing. */}
      {icon ? <View style={selected ? [s.iconBacking, { backgroundColor: c.cell }] : undefined}>{icon}</View> : null}
      <Text numberOfLines={1} style={[s.choiceText, { color: selected ? c.onTint : c.label }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// One end of a custom range: a chip over the system date picker (web), with a clear button
// once a day is set, which leaves that end open.
function DayChoice({ label, value, max, onChange }: { label: string; value: string | null; max: string; onChange: (day: string | null) => void }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[s.dayLabel, { color: c.secondaryLabel }]}>{label}</Text>
      <View style={[s.choice, s.day, { backgroundColor: value ? c.tintFill : c.cell }]}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[s.choiceText, { color: value ? c.tint : c.secondaryLabel }]}>
            {value ? dayChipLabel(value) : t.filters.anyDay}
          </Text>
          <DateInput value={value ?? max} max={max} onChange={onChange} label={label} />
        </View>
        {value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.filters.remove(label)}>
            <Icon name="xmark.circle.fill" size={18} color={c.tint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barTitle: { fontFamily: fontFamily.body, fontSize: 17, fontWeight: '600' },
  barButton: { fontFamily: fontFamily.body, fontSize: 17 },
  group: { marginTop: 24, paddingHorizontal: 16 },
  groupTitle: { fontFamily: fontFamily.body, fontSize: 13, marginBottom: 8, marginStart: 16 },
  groupFooter: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 8, marginStart: 16 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 36 tall plus 4 of hitSlop each side = a 44pt target.
  choice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 36, borderRadius: 18 },
  choiceText: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  iconBacking: { borderRadius: 6 },
  days: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 12 },
  day: { justifyContent: 'space-between' },
  dayLabel: { fontFamily: fontFamily.body, fontSize: 13, marginStart: 4 },
  amounts: { flexDirection: 'row', gap: 12, width: '100%' },
  // 16px or larger, or iOS Safari zooms the page on focus.
  amount: { fontFamily: fontFamily.body, flex: 1, minWidth: 0, height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 17, outlineStyle: 'none' } as any,
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
