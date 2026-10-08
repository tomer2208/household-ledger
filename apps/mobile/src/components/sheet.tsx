import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './ui';
import { t } from '@/lib/i18n';
import { tokens, useColors } from '@/lib/theme';
import { useScheme } from '@/lib/appearance';
import { Pressable } from '@/components/pressable';

// K3: a sheet from the bottom of the screen, over a dimmed backdrop (F4 elevation 2). Tapping the
// backdrop or the close button dismisses it; on the web, Escape too (Modal's onRequestClose).
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const c = useColors();
  const dark = useScheme() === 'dark';
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fill}>
        <Pressable feedback={false} style={[s.fill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.common.cancel} />
        <View
          style={[
            s.sheet,
            { backgroundColor: c.raised, paddingBottom: tokens.space[4] + insets.bottom },
            dark ? tokens.elevation.dark.sheet : tokens.elevation.light.sheet,
          ]}
          accessibilityViewIsModal>
          <View style={[s.grab, { backgroundColor: c.line }]} />
          {title ? (
            <View style={s.head}>
              <Text style={[s.title, { color: c.text }]} accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.common.cancel} style={s.close}>
                <Icon name="xmark" size={18} color={c.text2} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type MenuItem = { label: string; icon: string; onPress: () => void; destructive?: boolean };

// K3: a menu of actions, e.g. an envelope's long press. A destructive item sits apart from the
// rest (F4 `space[8]` before danger), so it's never a slip of the thumb away.
export function MenuSheet({ open, onClose, title, items }: { open: boolean; onClose: () => void; title?: string; items: MenuItem[] }) {
  const c = useColors();
  const safe = items.filter((x) => !x.destructive);
  const danger = items.filter((x) => x.destructive);
  const row = (x: MenuItem) => (
    <Pressable
      key={x.label}
      onPress={() => {
        onClose();
        x.onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [s.item, { backgroundColor: pressed ? c.fill : c.bg }]}>
      <Icon name={x.icon} size={20} color={x.destructive ? c.over : c.text} />
      <Text style={[s.itemText, { color: x.destructive ? c.over : c.text }]}>{x.label}</Text>
    </Pressable>
  );
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <View style={s.items}>{safe.map(row)}</View>
      {danger.length ? <View style={[s.items, s.danger]}>{danger.map(row)}</View> : null}
    </Sheet>
  );
}

const { space, radius, type } = tokens;
const s = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingHorizontal: space[4], paddingTop: space[2], gap: space[3] },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  title: { ...type.heading, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  items: { gap: space[1] },
  danger: { marginTop: space[4] },
  item: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[4], borderRadius: radius.tile },
  itemText: { ...type.body, fontWeight: '600' },
});
