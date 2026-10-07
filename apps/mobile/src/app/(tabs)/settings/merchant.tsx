import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { countMerchantMove, type MerchantUpdate, useCategories, useMergeMerchants, useMerchants, useRemoveMerchantAlias, useUpdateMerchant } from '@/api/queries';
import type { MerchantSummary } from '@/api/types';
import { CategoryPicker } from '@/components/category-picker';
import { matches, MerchantSearch } from '@/components/merchant-search';
import { useToast } from '@/components/toast';
import { Button, CategoryIcon, ErrorText, Field, Icon, Row, Screen, Section } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// P1-13: one learned merchant. Rename it, change where its purchases go (optionally its existing
// expenses too), forget a spelling that belongs to another shop, or merge a duplicate into it.
export default function MerchantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const merchants = useMerchants();
  const m = merchants.data?.find((x) => x.id === id);
  if (!merchants.data) return <Screen />;
  // Merged away (here or on the partner's phone): nothing left to edit.
  if (!m) return <Screen><Stack.Screen options={{ title: t.merchants.title }} /><ErrorText error={new Error('unknown merchant')} /></Screen>;
  return <Editor key={m.id + m.display_name + m.default_category_id} m={m} others={merchants.data.filter((x) => x.id !== m.id)} />;
}

function Editor({ m, others }: { m: MerchantSummary; others: MerchantSummary[] }) {
  const c = useColors();
  const toast = useToast();
  const cats = useCategories();
  const update = useUpdateMerchant();
  const removeAlias = useRemoveMerchantAlias();
  const merge = useMergeMerchants();
  const [name, setName] = useState(m.display_name);
  const [categoryId, setCategoryId] = useState<string | null>(m.default_category_id);
  const [moveExisting, setMoveExisting] = useState(true);
  const [count, setCount] = useState<MerchantUpdate | null>(null);
  const [picking, setPicking] = useState(false);

  const categoryChanged = categoryId !== m.default_category_id && categoryId != null;
  const dirty = name.trim() !== m.display_name || categoryId !== m.default_category_id;
  const categoryName = (cats.data ?? []).find((x) => x.id === categoryId)?.name ?? '';

  // How many existing expenses the new category would move, asked once the choice settles.
  useEffect(() => {
    if (!categoryChanged || !categoryId) return;
    let live = true;
    countMerchantMove(m.id, m.display_name, categoryId)
      .then((n) => live && setCount(n))
      .catch(() => live && setCount(null));
    return () => {
      live = false;
    };
  }, [categoryChanged, categoryId, m.id, m.display_name]);
  const shownCount = categoryChanged ? count : null;

  async function save() {
    const res = await update.mutateAsync({
      id: m.id,
      name: name.trim(),
      categoryId,
      applyExisting: categoryChanged && moveExisting && (shownCount?.moved ?? 0) > 0,
    });
    toast({ message: categoryChanged && moveExisting && res.moved > 0 ? t.merchants.savedMoved(res.moved) : t.merchants.saved });
  }

  async function forget(normalized: string) {
    if (!(await confirm(t.merchants.removeTitle, t.merchants.removeMessage(normalized), t.merchants.removeAction))) return;
    removeAlias.mutate({ id: m.id, normalized }, { onError: (e) => toast({ message: errorMessage(e) }) });
  }

  async function mergeIn(from: MerchantSummary) {
    setPicking(false);
    if (!(await confirm(t.merchants.mergeTitle(from.display_name, m.display_name), t.merchants.mergeMessage(from.display_name, from.tx_count), t.merchants.mergeAction))) return;
    merge.mutate(
      { into: m.id, from: from.id },
      { onSuccess: () => toast({ message: t.merchants.merged(from.display_name) }), onError: (e) => toast({ message: errorMessage(e) }) },
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: m.display_name, headerLargeTitle: false }} />
      <Section>
        <Field label={t.merchants.name} value={name} onChangeText={setName} maxLength={60} last />
      </Section>

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.merchants.category}</Text>
      <CategoryPicker
        categories={(cats.data ?? []).filter((x) => x.kind === 'expense')}
        value={categoryId}
        onChange={setCategoryId}
      />
      <Text style={[s.hint, { color: c.secondaryLabel }]}>{t.merchants.categoryFooter}</Text>

      {shownCount && shownCount.moved > 0 ? (
        <Section footer={shownCount.closed > 0 ? t.merchants.closedStay(shownCount.closed) : undefined}>
          <Row
            title={t.merchants.moveExisting(shownCount.moved, categoryName)}
            right={<Switch value={moveExisting} onValueChange={setMoveExisting} accessibilityLabel={t.merchants.moveExisting(shownCount.moved, categoryName)} />}
            last
          />
        </Section>
      ) : null}

      <ErrorText error={update.error} />
      <View style={s.actions}>
        <Button title={t.common.save} onPress={save} loading={update.isPending} disabled={!dirty || !name.trim()} />
      </View>

      {m.aliases.length > 0 ? (
        <Section title={t.merchants.spellings} footer={t.merchants.spellingsFooter}>
          {m.aliases.map((a, i) => (
            <Row
              key={a.normalized}
              title={a.normalized}
              subtitle={t.merchants.sources[a.source]}
              right={
                <Pressable onPress={() => forget(a.normalized)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t.merchants.removeSpelling(a.normalized)}>
                  <Icon name="trash" size={18} color={c.red} />
                </Pressable>
              }
              last={i === m.aliases.length - 1}
            />
          ))}
        </Section>
      ) : null}

      {others.length > 0 ? (
        <Section footer={t.merchants.mergeFooter}>
          <Row title={t.merchants.merge} onPress={() => setPicking(true)} chevron={false} last />
        </Section>
      ) : null}

      <MergePicker visible={picking} others={others} onPick={mergeIn} onClose={() => setPicking(false)} />
    </Screen>
  );
}

// The other merchants, searchable, to pick the duplicate to merge in.
function MergePicker({ visible, others, onPick, onClose }: { visible: boolean; others: MerchantSummary[]; onPick: (m: MerchantSummary) => void; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = others.filter((m) => !q || matches(m, q));
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.groupedBackground, paddingBottom: insets.bottom }}>
        <View style={[s.bar, { borderBottomColor: c.separator }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={[s.barButton, { color: c.tint }]}>{t.common.cancel}</Text>
          </Pressable>
          <Text style={[s.barTitle, { color: c.label }]} accessibilityRole="header">
            {t.merchants.pickTitle}
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          <MerchantSearch value={query} onChange={setQuery} />
          <Section>
            {shown.map((m, i) => (
              <Row
                key={m.id}
                left={<CategoryIcon symbol={m.category?.sf_symbol ?? 'bag'} categoryId={m.default_category_id} />}
                title={m.display_name}
                subtitle={`${m.category?.name ?? t.merchants.noCategory} · ${t.merchants.uses(m.tx_count)}`}
                onPress={() => onPick(m)}
                chevron={false}
                last={i === shown.length - 1}
              />
            ))}
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 24, marginBottom: 8, marginStart: 32 },
  hint: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 8, marginHorizontal: 32 },
  actions: { marginHorizontal: 16, marginTop: 20 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  barTitle: { fontFamily: fontFamily.body, fontSize: 17, fontWeight: '600' },
  barButton: { fontFamily: fontFamily.body, fontSize: 17 },
});
