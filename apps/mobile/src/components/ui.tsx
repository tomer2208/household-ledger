// Inset-grouped building blocks that mirror iOS Settings, so every screen reads as a
// native app (Batch 3: Apple-native). Colors come from lib/theme only.

import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { useColors } from '@/lib/theme';
import { isRtl } from '@/lib/bidi';

// Web has no SF Symbols; a few Material names keep the icons meaningful there.
const WEB_ICON: Record<string, string> = {
  cart: 'shopping_cart', 'fork.knife': 'restaurant', car: 'directions_car', fuelpump: 'local_gas_station',
  house: 'home', bolt: 'bolt', 'cross.case': 'medical_services', 'figure.and.child.holdinghands': 'family_restroom',
  bag: 'shopping_bag', popcorn: 'movie', 'arrow.triangle.2.circlepath': 'autorenew', airplane: 'flight',
  gift: 'redeem', graduationcap: 'school', 'ellipsis.circle': 'more_horiz', banknote: 'savings', tag: 'sell',
  'chart.pie': 'pie_chart', 'list.bullet': 'list', 'doc.text.magnifyingglass': 'summarize', gearshape: 'settings',
  plus: 'add', 'tray.full': 'inbox', 'iphone.gen3': 'smartphone', 'person.2': 'group', 'calendar.badge.clock': 'event_repeat',
  'square.and.arrow.up': 'ios_share', 'doc.on.doc': 'content_copy', 'checkmark.circle.fill': 'check_circle',
  'exclamationmark.triangle.fill': 'warning', 'wifi.slash': 'wifi_off', 'sparkles': 'auto_awesome',
  'chevron.right': 'chevron_right', 'person.crop.circle': 'account_circle', 'envelope': 'mail',
};

export function Icon({ name, size = 20, color }: { name: string; size?: number; color?: any }) {
  const c = useColors();
  return (
    <SymbolView
      name={{ ios: name as SFSymbol, android: (WEB_ICON[name] ?? 'label') as any, web: (WEB_ICON[name] ?? 'label') as any }}
      size={size}
      tintColor={color ?? c.tint}
      type="hierarchical"
    />
  );
}

export function CategoryIcon({ symbol, size = 30 }: { symbol: string; size?: number }) {
  const c = useColors();
  return (
    <View style={[styles.catIcon, { width: size, height: size, borderRadius: size * 0.26, backgroundColor: c.fill }]}>
      <Icon name={symbol} size={size * 0.56} color={c.tint} />
    </View>
  );
}

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
}: {
  children?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
}) {
  const c = useColors();
  if (!scroll) return <View style={{ flex: 1, backgroundColor: c.groupedBackground }}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      {title ? <Text style={[styles.sectionTitle, { color: c.secondaryLabel }]}>{title.toUpperCase()}</Text> : null}
      <View style={[styles.card, { backgroundColor: c.cell }]}>{children}</View>
      {footer ? <Text style={[styles.sectionFooter, { color: c.secondaryLabel }]}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  value,
  left,
  right,
  onPress,
  chevron = !!onPress,
  destructive,
  last,
  titleStyle,
}: {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  last?: boolean;
  titleStyle?: TextStyle;
}) {
  const c = useColors();
  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && { backgroundColor: c.fill }]}>
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={[styles.rowBody, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[
              styles.rowTitle,
              { color: destructive ? c.red : onPress && !chevron ? c.tint : c.label },
              isRtl(title) && { writingDirection: 'rtl' },
              titleStyle,
            ]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[styles.rowSubtitle, { color: c.secondaryLabel }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? <Text style={[styles.rowValue, { color: c.secondaryLabel }]}>{value}</Text> : null}
        {right}
        {chevron ? <Icon name="chevron.right" size={13} color={c.tertiaryLabel} /> : null}
      </View>
    </View>
  );
  if (!onPress) return content(false);
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

export function Field({
  label,
  last,
  ...props
}: TextInputProps & { label: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.row, { minHeight: 44 }]}>
      <View style={[styles.rowBody, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Text style={[styles.fieldLabel, { color: c.label }]}>{label}</Text>
        <TextInput
          placeholderTextColor={c.tertiaryLabel as string}
          style={[styles.fieldInput, { color: c.label }]}
          {...props}
        />
      </View>
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  kind = 'filled',
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  kind?: 'filled' | 'plain' | 'destructive';
  style?: ViewStyle;
}) {
  const c = useColors();
  const filled = kind === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        if (Platform.OS === 'ios') Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        filled && { backgroundColor: c.tint },
        (disabled || pressed) && { opacity: disabled ? 0.4 : 0.7 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={filled ? '#fff' : (c.tint as string)} />
      ) : (
        <Text style={[styles.buttonText, { color: filled ? '#fff' : kind === 'destructive' ? c.red : c.tint }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ProgressBar({ pct, color }: { pct: number; color: any }) {
  const c = useColors();
  return (
    <View style={[styles.track, { backgroundColor: c.fill }]}>
      <View style={[styles.fillBar, { width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Badge({ text, color }: { text: string; color: any }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function Empty({ icon, title, message }: { icon: string; title: string; message?: string }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={44} color={c.tertiaryLabel} />
      <Text style={[styles.emptyTitle, { color: c.label }]}>{title}</Text>
      {message ? <Text style={[styles.emptyMessage, { color: c.secondaryLabel }]}>{message}</Text> : null}
    </View>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const c = useColors();
  if (!error) return null;
  return <Text style={[styles.error, { color: c.red }]}>{error instanceof Error ? error.message : String(error)}</Text>;
}

export const styles = StyleSheet.create({
  screenContent: { paddingBottom: 48 },
  section: { marginTop: 22, marginHorizontal: 16 },
  sectionTitle: { fontSize: 13, marginLeft: 16, marginBottom: 6 },
  sectionFooter: { fontSize: 13, marginHorizontal: 16, marginTop: 6, lineHeight: 18 },
  card: { borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, minHeight: 44 },
  rowLeft: { marginRight: 12, paddingVertical: 7 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16, paddingVertical: 11, minHeight: 44 },
  rowTitle: { fontSize: 17 },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  rowValue: { fontSize: 17, fontVariant: ['tabular-nums'] },
  fieldLabel: { fontSize: 17, width: 110 },
  fieldInput: { flex: 1, fontSize: 17, paddingVertical: 0, textAlign: 'right' },
  button: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontSize: 17, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fillBar: { height: 6, borderRadius: 3 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  catIcon: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  emptyMessage: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  error: { fontSize: 14, marginHorizontal: 32, marginTop: 10, textAlign: 'center' },
});
