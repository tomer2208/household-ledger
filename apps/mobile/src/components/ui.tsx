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
  useColorScheme,
  View,
  ViewStyle,
} from 'react-native';

import { CATEGORY_ICONS, categoryColorId, categoryIconId } from '@/lib/category-look';
import { moneyText, radius, tokens, useColors } from '@/lib/theme';
import type { CategoryColor } from '@/lib/tokens/palette.gen';
import { isRtl } from '@/lib/bidi';
import { errorMessage } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { useIsOnline } from '@/lib/query';
import { forwardIcon, textEnd } from '@/lib/rtl';

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
  'chevron.right': 'chevron_right', 'chevron.left': 'chevron_left', 'chevron.up': 'expand_less', 'chevron.down': 'expand_more', circle: 'radio_button_unchecked', 'person.crop.circle': 'account_circle', 'envelope': 'mail',
  // the add sheet and the month's status line (S1, O1)
  calendar: 'calendar_today', 'slider.horizontal.3': 'tune', ellipsis: 'more_horiz', 'delete.left': 'backspace', xmark: 'close',
  'checkmark.circle': 'check_circle',
  // category picker (settings/category.tsx) and later screens
  'cup.and.saucer': 'local_cafe', bus: 'directions_bus', drop: 'water_drop', wifi: 'wifi', pills: 'medication',
  pawprint: 'pets', tshirt: 'checkroom', gamecontroller: 'sports_esports', dumbbell: 'fitness_center',
  scissors: 'content_cut', 'wrench.and.screwdriver': 'build', creditcard: 'credit_card',
  'building.columns': 'account_balance', heart: 'favorite', 'chart.pie.fill': 'pie_chart', 'gearshape.fill': 'settings',
  magnifyingglass: 'search', bell: 'notifications', 'bell.slash': 'notifications_off', link: 'link', trash: 'delete',
  pencil: 'edit', 'person.badge.minus': 'person_remove', 'rectangle.portrait.and.arrow.right': 'logout',
  'square.and.arrow.down': 'download', 'questionmark.circle': 'help', 'hand.raised': 'privacy_tip',
  'xmark.circle.fill': 'cancel', briefcase: 'work', checkmark: 'check', globe: 'language',
  'line.3.horizontal.decrease': 'filter_list', 'doc.text': 'description', star: 'star', laptopcomputer: 'laptop',
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

// F5 + F2: a category's icon (Phosphor, duotone) in its own colour, the same on every platform.
// Anything that isn't a category (the review tray, devices) keeps the system icon, in neutral.
export function CategoryIcon({ symbol, size = 30, color }: { symbol: string; size?: number; color?: CategoryColor }) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const id = categoryIconId(symbol);
  const Glyph = id ? CATEGORY_ICONS[id] : null;
  if (!Glyph) {
    return (
      <View style={[styles.catIcon, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: c.fill }]}>
        <Icon name={symbol} size={size * 0.56} color={c.text2} />
      </View>
    );
  }
  const look = tokens.categoryColors[color ?? categoryColorId(symbol)][dark ? 'dark' : 'light'];
  return (
    <View style={[styles.catIcon, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: look.soft }]}>
      <Glyph size={Math.round(size * 0.6)} color={look.ink} weight="duotone" />
    </View>
  );
}

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  bottomSpace = 0,
}: {
  children?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  // Extra room under the content, e.g. for the floating Add expense button.
  bottomSpace?: number;
}) {
  const c = useColors();
  if (!scroll) return <View style={{ flex: 1, backgroundColor: c.groupedBackground }}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.screenContent, bottomSpace ? { paddingBottom: 48 + bottomSpace } : null]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Section({
  title,
  footer,
  action,
  children,
}: {
  title?: string;
  footer?: string;
  // A text button at the end of the title, e.g. Budgets → Edit.
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  children: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.section}>
      {title || action ? (
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: c.text }]} accessibilityRole="header">{title}</Text>
          {action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel ?? action.label}
              onPress={action.onPress}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
              <Text style={[styles.sectionAction, { color: c.tint }]}>{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
  onLongPress,
  actions,
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
  onLongPress?: () => void;
  // Offered to VoiceOver/TalkBack as custom actions (e.g. the swipe actions).
  actions?: { name: string; label: string; run: () => void }[];
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
        {chevron ? <Icon name={forwardIcon()} size={13} color={c.tertiaryLabel} /> : null}
      </View>
    </View>
  );
  if (!onPress && !onLongPress) return content(false);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityActions={actions?.map(({ name, label }) => ({ name, label }))}
      onAccessibilityAction={(e) => actions?.find((x) => x.name === e.nativeEvent.actionName)?.run()}>
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
          style={[styles.fieldInput, { color: c.label, textAlign: textEnd() }]}
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
        filled && { backgroundColor: disabled ? c.disabledBg : pressed ? c.actionPressed : c.tint },
        !filled && (disabled || pressed) && { opacity: disabled ? 0.45 : 0.7 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={(filled ? c.onTint : c.tint) as string} />
      ) : (
        <Text style={[styles.buttonText, { color: filled ? (disabled ? c.disabledText : c.onTint) : kind === 'destructive' ? c.red : c.tint }]}>{title}</Text>
      )}
    </Pressable>
  );
}

// `pace` (0-100) draws the FinPace marker: where spending should be by today. `forecast`
// (0-100, P1-17) draws a hollow ring where the month is heading; past the end, at the end.
export function ProgressBar({ pct, color, pace, forecast }: { pct: number; color: any; pace?: number; forecast?: number }) {
  const c = useColors();
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <View style={styles.trackWrap}>
      <View style={[styles.track, { backgroundColor: c.fill }]}>
        <View style={[styles.fillBar, { width: `${clamp(pct)}%`, backgroundColor: color }]} />
      </View>
      {pace != null ? (
        <View
          style={[styles.pace, { start: `${clamp(pace)}%`, backgroundColor: c.paceMarker }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      {forecast != null ? (
        <View
          style={[styles.forecast, { start: `${clamp(forecast)}%`, borderColor: color, backgroundColor: c.cell }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
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

// An empty screen is an invitation: say what goes here, then offer the next step. Use a plain
// action where the screen already has a primary button (the floating Add expense).
export function Empty({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void; kind?: 'filled' | 'plain' };
}) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={44} color={c.tertiaryLabel} />
      <Text style={[styles.emptyTitle, { color: c.label }]}>{title}</Text>
      {message ? <Text style={[styles.emptyMessage, { color: c.secondaryLabel }]}>{message}</Text> : null}
      {action ? <Button title={action.label} kind={action.kind ?? 'filled'} onPress={action.onPress} style={styles.emptyAction} /> : null}
    </View>
  );
}

// P1-12: a screen whose data couldn't load at all: what went wrong, in the person's language,
// and a way to try again. Offline, it says so; the data reloads by itself once back online.
export function ErrorState({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  const c = useColors();
  const online = useIsOnline();
  return (
    <View style={[styles.errorCard, { backgroundColor: c.cell }]} accessibilityLiveRegion="polite">
      <Icon name={online ? 'exclamationmark.triangle.fill' : 'wifi.slash'} size={28} color={online ? c.orange : c.secondaryLabel} />
      <Text style={[styles.errorTitle, { color: c.label }]}>{online ? t.common.loadFailed : t.common.offlineTitle}</Text>
      <Text style={[styles.errorBody, { color: c.secondaryLabel }]}>{online ? errorMessage(error) : t.common.offlineBody}</Text>
      <Button title={t.common.retry} kind="plain" onPress={onRetry} loading={retrying} style={styles.errorButton} />
    </View>
  );
}

// What stands in for data that isn't here yet: the error card when it failed or the phone is
// offline (a paused request would otherwise look like an empty list), else the skeleton.
export function LoadingState({
  error,
  onRetry,
  retrying,
  skeleton,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  skeleton: ReactNode;
}) {
  const online = useIsOnline();
  if (error || !online) return <ErrorState error={error} onRetry={onRetry} retrying={retrying} />;
  return <>{skeleton}</>;
}

export function ErrorText({ error }: { error: unknown }) {
  const c = useColors();
  if (!error) return null;
  return <Text style={[styles.error, { color: c.red }]}>{errorMessage(error)}</Text>;
}

export const styles = StyleSheet.create({
  screenContent: { paddingBottom: 48 },
  section: { marginTop: 22, marginHorizontal: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginHorizontal: 16, marginBottom: 6 },
  sectionTitle: { ...tokens.type.heading },
  sectionAction: { fontFamily: tokens.fontFamily.body, fontSize: 16, fontWeight: '600' },
  sectionFooter: { fontFamily: tokens.fontFamily.body, fontSize: 13, marginHorizontal: 16, marginTop: 6, lineHeight: 18 },
  card: { borderRadius: tokens.radius.envelope, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingStart: 16, minHeight: 44 },
  rowLeft: { marginEnd: 12, paddingVertical: 7 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingEnd: 16, paddingVertical: 11, minHeight: 44 },
  rowTitle: { fontFamily: tokens.fontFamily.body, fontSize: 17 },
  rowSubtitle: { fontFamily: tokens.fontFamily.body, fontSize: 13, marginTop: 2 },
  rowValue: { fontSize: 17, ...moneyText },
  fieldLabel: { fontFamily: tokens.fontFamily.body, fontSize: 17, width: 110 },
  fieldInput: { fontFamily: tokens.fontFamily.body, flex: 1, fontSize: 17, paddingVertical: 0 },
  // minHeight, not height: with a large system text size the label grows instead of clipping.
  button: { minHeight: 52, paddingVertical: 12, borderRadius: tokens.radius.tile + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { ...tokens.type.label },
  trackWrap: { justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fillBar: { height: 8, borderRadius: 4 },
  pace: { position: 'absolute', width: 2, height: 14, marginStart: -1, borderRadius: 1 },
  forecast: { position: 'absolute', width: 10, height: 10, marginStart: -5, borderRadius: 5, borderWidth: 2 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontFamily: tokens.fontFamily.body, fontSize: 13, fontWeight: '700' },
  catIcon: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { ...tokens.type.heading, fontSize: 22, lineHeight: 28, textAlign: 'center' },
  emptyMessage: { fontFamily: tokens.fontFamily.body, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  emptyAction: { marginTop: 12, alignSelf: 'stretch' },
  error: { fontFamily: tokens.fontFamily.body, fontSize: 14, marginHorizontal: 32, marginTop: 10, textAlign: 'center' },
  errorCard: { marginHorizontal: 16, marginTop: 24, borderRadius: radius.hero, padding: 20, alignItems: 'center', gap: 6 },
  errorTitle: { fontFamily: tokens.fontFamily.body, fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  errorBody: { fontFamily: tokens.fontFamily.body, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  errorButton: { alignSelf: 'stretch', marginTop: 6 },
});
