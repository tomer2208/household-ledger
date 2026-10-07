import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useSetBudget } from '@/api/queries';
import type { OverviewCategory } from '@/api/types';
import { Envelope } from './envelope';
import { Sheet } from './sheet';
import { Button, ErrorText } from './ui';
import { lookOf } from '@/lib/category-look';
import { t } from '@/lib/i18n';
import { minorToInput, parseMoneyInput } from '@/lib/money';
import { moneyText, tokens, useColors } from '@/lib/theme';

// P3 (D3: a budget used to take four taps and two scrolls): change an envelope's budget right
// where it is. The envelope below the field shows this month under the amount being typed, so
// the effect is clear before saving. What carried in and what spread payments set aside
// (P1-14, P1-16) stay as they are: only the budget that was set changes.
type Props = {
  cat: OverviewCategory | null;
  look?: { icon?: string | null; color?: string | null };
  currency: string;
  onClose: () => void;
};

export function BudgetSheet(props: Props) {
  if (!props.cat) return null;
  // Keyed by category, so the field starts from that envelope's budget each time.
  return <Editor key={props.cat.id} {...props} cat={props.cat} />;
}

function Editor({ cat, look, currency, onClose }: Props & { cat: OverviewCategory }) {
  const c = useColors();
  const save = useSetBudget();
  const [text, setText] = useState(cat.base_cap ? minorToInput(cat.base_cap) : '');

  const typed = text.trim() === '' ? 0 : parseMoneyInput(text);
  const extra = (cat.cap ?? 0) - (cat.base_cap ?? 0);
  const preview = typed == null ? cat.cap : typed + extra;
  const { icon, color } = lookOf({ sf_symbol: cat.sf_symbol, ...look });

  return (
    <Sheet open onClose={onClose} title={t.envelope.budgetFor(cat.name)}>
      <TextInput
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        autoFocus
        placeholder={t.envelope.noBudgetYet}
        placeholderTextColor={c.text3 as string}
        accessibilityLabel={t.categories.monthlyBudget}
        style={[s.input, { color: c.text, backgroundColor: c.bg, borderColor: c.line }]}
        onSubmitEditing={() => typed != null && save.mutate({ categoryId: cat.id, capMinor: typed }, { onSuccess: onClose })}
      />
      <Text style={[s.label, { color: c.text2 }]}>{t.envelope.budgetPreview}</Text>
      <View pointerEvents="none">
        <Envelope name={cat.name} symbol={cat.sf_symbol} icon={icon} color={color} cap={preview && preview > 0 ? preview : null} spent={cat.spent} currency={currency} />
      </View>
      <ErrorText error={save.error} />
      <Button
        title={t.common.save}
        loading={save.isPending}
        disabled={typed == null || typed === (cat.base_cap ?? 0)}
        onPress={() => typed != null && save.mutate({ categoryId: cat.id, capMinor: typed }, { onSuccess: onClose })}
      />
    </Sheet>
  );
}

const s = StyleSheet.create({
  input: { ...moneyText, fontSize: 28, fontWeight: '600', minHeight: 56, borderRadius: tokens.radius.tile, borderWidth: 1, paddingHorizontal: tokens.space[4], textAlign: 'center' },
  label: { ...tokens.type.caption },
});
