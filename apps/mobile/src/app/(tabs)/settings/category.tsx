import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useCategories, useCategoryTrend, useHousehold, useOverview, useSaveCategory, useSetBudget } from '@/api/queries';
import type { Fund } from '@/api/types';
import { BudgetBreakdown } from '@/components/budget-breakdown';
import { CategoryTrend } from '@/components/charts';
import { Envelope } from '@/components/envelope';
import { Button, CategoryIcon, ErrorText, Field, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { budgetStatus, incomePlan } from '@/lib/budget';
import { useCategoryActions } from '@/lib/category-actions';
import { CATEGORY_COLORS, lookOf, sfFor } from '@/lib/category-look';
import { ICON_INFO } from '@/lib/icon-info';
import { monthPace } from '@/lib/dates';
import { isRTL, t } from '@/lib/i18n';
import { formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { budgetTone, moneyText, radius, tokens, useColors } from '@/lib/theme';
import type { CategoryColor } from '@/lib/tokens/palette.gen';
import { fontFamily } from '@/lib/tokens';
import { useScheme } from '@/lib/appearance';

export default function CategoryEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const cats = useCategories();
  const overview = useOverview();
  if (id && (!cats.data || !overview.data)) return <Screen />;
  return <Editor id={id} />;
}

function Editor({ id }: { id?: string }) {
  const c = useColors();
  const hh = useHousehold();
  const cats = useCategories();
  const overview = useOverview();
  const save = useSaveCategory();
  const setBudget = useSetBudget();
  const actions = useCategoryActions(hh.data?.household?.id);
  const trend = useCategoryTrend(id);
  const cat = cats.data?.find((x) => x.id === id);
  const current = overview.data?.categories.find((x) => x.id === id);

  const [name, setName] = useState(cat?.name ?? '');
  // P2: the envelope's own icon and colour (migration 46); a new one starts from "other".
  const start = lookOf(cat ?? { sf_symbol: 'tag' });
  const [icon, setIcon] = useState(start.icon ?? 'tag');
  const [color, setColor] = useState<CategoryColor>(cat ? start.color : CATEGORY_COLORS[(cats.data?.length ?? 0) % CATEGORY_COLORS.length]);
  const [hidden, setHidden] = useState(cat?.hidden ?? false);
  const [query, setQuery] = useState('');
  const dark = useScheme() === 'dark';
  // The budget that was set; what carried in from last month (P1-14) comes on top of it.
  const baseCap = current?.base_cap ?? null;
  const carry = current?.carry ?? 0;
  const reserve = current?.reserve ?? 0;
  const [cap, setCap] = useState(baseCap ? minorToInput(baseCap) : '');
  const [rollover, setRollover] = useState(cat?.rollover ?? false);
  const [overspend, setOverspend] = useState(cat?.rollover_overspend ?? true);

  const householdId = hh.data?.household?.id;
  const capMinor = cap.trim() === '' ? null : parseMoneyInput(cap) ?? (cap.trim() === '0' ? 0 : null);
  // The household plan with this budget swapped in: budgets come out of income.
  const o = overview.data;
  const plan = incomePlan(o?.income, (o?.total_base_cap ?? 0) - (baseCap ?? 0) + (capMinor ?? 0));
  const cur = hh.data?.household?.base_currency ?? 'ILS';

  async function onSave() {
    if (!householdId || !name.trim()) return;
    const saved = (await save.mutateAsync({
      id,
      householdId,
      name: name.trim(),
      sfSymbol: sfFor(icon),
      icon,
      color,
      hidden,
      acknowledge: !!id,
      ...(id ? { rollover, rolloverOverspend: overspend } : {}),
    })) as { id: string } | null;
    // D3: a new category takes its budget in the same step, not after saving and reopening.
    const target = id ?? saved?.id;
    if (target && capMinor != null && capMinor !== (id ? baseCap : null)) {
      await setBudget.mutateAsync({ categoryId: target, capMinor });
    }
    router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? t.categories.editTitle : t.categories.newTitle, headerLargeTitle: false }} />
      {/* P2: the envelope as it will look, with everything chosen below. */}
      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.categories.preview}</Text>
      <View style={s.preview} pointerEvents="none">
        <Envelope
          name={name.trim() || t.categories.namePlaceholder}
          symbol={sfFor(icon)}
          icon={icon}
          color={color}
          cap={capMinor && capMinor > 0 ? capMinor + carry + reserve : null}
          spent={current?.spent ?? 0}
          currency={cur}
        />
      </View>
      {id && current ? (
        <MonthStatus
          cap={capMinor}
          carry={carry}
          reserve={reserve}
          funds={current.funds}
          spent={current.spent}
          currency={cur}
          preview={capMinor !== baseCap}
        />
      ) : null}
      {/* P1-11: the last six months; a month opens its expenses here. */}
      {id && trend.data ? (
        <CategoryTrend
          months={trend.data}
          currency={cur}
          onMonth={(mo) => router.push({ pathname: '/transactions', params: { category: id, month: mo } })}
        />
      ) : null}
      <Section>
        <Field label={t.review.name} value={name} onChangeText={setName} maxLength={30} placeholder={t.categories.namePlaceholder} />
        <Field label={t.categories.monthlyBudget} value={cap} onChangeText={setCap} keyboardType="decimal-pad" placeholder={t.overview.noBudget} last />
      </Section>
      {id && plan.kind !== 'none' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.hint, { color: plan.health === 'over' ? c.red : plan.health === 'thin' ? c.orange : c.secondaryLabel }]}>
          {plan.kind === 'over'
            ? t.categories.planOver(formatMoney(-plan.unassigned, cur), formatMoney(plan.income, cur))
            : t.categories.planLeft(formatMoney(plan.unassigned, cur), formatMoney(plan.income, cur), plan.savingsPct)}
        </Text>
      ) : null}
      {/* P1-14: what's left at month end stays with this category. */}
      {id ? (
        <Section footer={rollover ? `${t.categories.rolloverFooter} ${t.categories.rolloverOverspendFooter}` : t.categories.rolloverFooter}>
          <Row
            title={t.categories.rollover}
            right={<Switch value={rollover} onValueChange={setRollover} accessibilityLabel={t.categories.rollover} />}
            last={!rollover}
          />
          {rollover ? (
            <Row
              title={t.categories.rolloverOverspend}
              right={<Switch value={overspend} onValueChange={setOverspend} accessibilityLabel={t.categories.rolloverOverspend} />}
              last
            />
          ) : null}
        </Section>
      ) : null}
      {id && cat && !cat.budget_acknowledged ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>
          {t.categories.fromShortcut}
        </Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.categories.color}</Text>
      <View style={[s.colors, { backgroundColor: c.cell }]} accessibilityRole="radiogroup">
        {CATEGORY_COLORS.map((k) => {
          const look = tokens.categoryColors[k][dark ? 'dark' : 'light'];
          const on = k === color;
          return (
            <Pressable
              key={k}
              onPress={() => setColor(k)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t.categories.colors[k]}
              style={[s.swatchWrap, on && { borderColor: c.text }]}>
              <View style={[s.swatch, { backgroundColor: look.base }]} />
            </Pressable>
          );
        })}
      </View>
      {(() => {
        const same = (cats.data ?? []).find((x) => x.id !== id && !x.archived_at && lookOf(x).color === color);
        return same ? <Text style={[s.hint, { color: c.secondaryLabel }]}>{t.categories.sameColor(same.name)}</Text> : null;
      })()}

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.categories.icon}</Text>
      <View style={[s.icons, { backgroundColor: c.cell }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.categories.iconSearch}
          placeholderTextColor={c.tertiaryLabel as string}
          accessibilityLabel={t.categories.iconSearch}
          style={[s.search, { color: c.text, backgroundColor: c.bg, textAlign: isRTL() ? 'right' : 'left' }]}
        />
        {(() => {
          const q = query.trim().toLowerCase().replace(/["׳']/g, '');
          const found = ICON_INFO.filter((x) => !q || `${x.he} ${x.en} ${x.words}`.toLowerCase().replace(/["׳']/g, '').includes(q));
          if (!found.length) return <Text style={[s.hint, { color: c.secondaryLabel }]}>{t.categories.noIcon(query.trim())}</Text>;
          return (
            <View style={s.iconGrid} accessibilityRole="radiogroup">
              {found.map((x) => (
                <Pressable
                  key={x.id}
                  onPress={() => setIcon(x.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: icon === x.id }}
                  accessibilityLabel={isRTL() ? x.he : x.en}
                  style={[s.iconCell, icon === x.id && { backgroundColor: c.actionSoft, borderColor: c.action }]}>
                  <CategoryIcon symbol={sfFor(x.id)} icon={x.id} color={color} size={36} />
                  <Text numberOfLines={1} style={[s.iconName, { color: c.text }]}>
                    {isRTL() ? x.he : x.en}
                  </Text>
                </Pressable>
              ))}
            </View>
          );
        })()}
      </View>

      {/* P2: hide without deleting: not relevant now, history kept. */}
      {id ? (
        <Section footer={t.categories.hiddenFooter}>
          <Row title={t.categories.hidden} right={<Switch value={hidden} onValueChange={setHidden} accessibilityLabel={t.categories.hidden} />} last />
        </Section>
      ) : null}

      <ErrorText error={save.error ?? setBudget.error} />
      <View style={s.actions}>
        <Button title={t.common.save} onPress={onSave} loading={save.isPending || setBudget.isPending} disabled={!name.trim()} />
      </View>
      {/* Kept apart from Save so the destructive action is never a mis-tap away. */}
      {id && cat ? (
        <View style={s.danger}>
          {cat.archived_at ? (
            <Button
              title={t.categories.restore}
              kind="plain"
              onPress={async () => {
                await save.mutateAsync({ id, householdId: householdId!, name: cat.name, sfSymbol: cat.sf_symbol, archived: false });
                router.back();
              }}
            />
          ) : (
            <Button
              title={t.categories.deleteCategory}
              kind="destructive"
              onPress={async () => {
                if (await actions.remove(cat)) router.back();
              }}
            />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

// This month under the budget being typed: the effect of a change is visible before saving.
function MonthStatus({
  cap,
  carry,
  reserve,
  funds,
  spent,
  currency,
  preview,
}: {
  cap: number | null;
  carry: number;
  reserve: number;
  funds: Fund[];
  spent: number;
  currency: string;
  preview: boolean;
}) {
  const c = useColors();
  const pace = monthPace();
  // the month's budget: the one being typed, plus what carried in and what spread payments
  // set aside or release
  const st = budgetStatus(cap == null && carry === 0 && reserve === 0 ? null : (cap ?? 0) + carry + reserve, spent);
  const tone = st.kind === 'none' ? c.label : budgetTone(st.pct, c);
  return (
    <View style={[s.status, { backgroundColor: c.cell }]} accessibilityLiveRegion="polite">
      <Text style={[s.statusLabel, { color: c.secondaryLabel }]}>{preview ? t.categories.withNewBudget : t.month.thisMonth}</Text>
      {st.kind === 'none' ? (
        <Text style={[s.statusAmount, { color: tone }]}>{t.budget.spent(formatMoney(spent, currency))}</Text>
      ) : (
        <>
          <Text style={[s.statusAmount, { color: tone }]}>
            {st.kind === 'left' ? t.budget.left(formatMoney(st.amount, currency)) : t.budget.over(formatMoney(st.amount, currency))}
          </Text>
          <ProgressBar pct={st.pct} color={tone} pace={pace} />
          <Text style={[s.statusMeta, { color: c.secondaryLabel }]}>
            {t.common.of(formatMoney(st.spent, currency), formatMoney(st.cap, currency))}
          </Text>
          <BudgetBreakdown base={cap ?? 0} carry={carry} reserve={reserve} funds={funds} currency={currency} align="start" />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  status: { marginHorizontal: 16, marginTop: 16, borderRadius: radius.hero, padding: 16, gap: 8 },
  statusLabel: { fontFamily: fontFamily.body, fontSize: 13 },
  statusAmount: { fontSize: 28, fontWeight: '700', ...moneyText },
  statusMeta: { fontSize: 13, ...moneyText },
  preview: { marginHorizontal: 16, marginTop: 4 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: 16, borderRadius: tokens.radius.envelope, padding: 12, justifyContent: 'center' },
  swatchWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  icons: { marginHorizontal: 16, borderRadius: tokens.radius.envelope, padding: 12, gap: 12 },
  search: { ...tokens.type.body, minHeight: 44, borderRadius: tokens.radius.tile, paddingHorizontal: 12 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconCell: { width: '23.4%', minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: tokens.radius.tile, borderWidth: 2, borderColor: 'transparent', paddingHorizontal: 2 },
  iconName: { ...tokens.type.caption, fontSize: 12 },
  hint: { fontFamily: fontFamily.body, fontSize: 13, marginHorizontal: 32, marginTop: 6 },
  label: { fontFamily: fontFamily.body, fontSize: 13, marginStart: 32, marginTop: 24, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, borderRadius: 10, padding: 8 },
  symbol: { width: '16.66%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
  danger: { marginHorizontal: 16, marginTop: 32 },
});
