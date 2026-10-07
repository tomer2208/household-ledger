import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { money } from './money-text';
import { CategoryIcon, Icon } from './ui';
import { categoryColorId } from '@/lib/category-look';
import { envelopeStatus } from '@/lib/envelope';
import { t } from '@/lib/i18n';
import { moneyText, tokens, useColors } from '@/lib/theme';
import type { CategoryColor } from '@/lib/tokens/palette.gen';

const { envelope: E, type } = tokens;

// K1, direction D: a category as an envelope. A flap in the category's colour, the icon and name,
// what's left in words, a bar that fills up to the budget, and "spent of budget". Close to the
// limit (80%) and over get a frame in the status colour and say it in the sentence; over also
// gets a warning icon, so the state never rests on colour alone. No tag: the words are the tag.
export function Envelope({
  name,
  symbol,
  color,
  cap,
  spent,
  currency,
  hint,
  onPress,
  onLongPress,
  actions,
}: {
  name: string;
  symbol: string;
  color?: CategoryColor;
  cap: number | null;
  spent: number;
  currency: string;
  // One quiet line under the amounts, e.g. "At this rate it runs out on the 18th".
  hint?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  // Offered to VoiceOver/TalkBack as custom actions, so long-press actions stay reachable.
  actions?: { name: string; label: string; run: () => void }[];
}) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const look = tokens.categoryColors[color ?? categoryColorId(symbol)][dark ? 'dark' : 'light'];
  const st = envelopeStatus(cap, spent);
  const frame = st.state === 'over' ? c.overBar : st.state === 'close' ? c.closeBar : null;
  const tone = st.state === 'over' ? c.over : st.state === 'close' ? c.close : c.text;
  const bar = st.state === 'over' ? c.overBar : st.state === 'close' ? c.closeBar : look.base;

  const amount =
    st.state === 'none'
      ? t.budget.spent(money(spent, currency))
      : st.state === 'over'
        ? t.envelope.over(money(-st.left, currency))
        : st.state === 'close'
          ? t.envelope.close(money(st.left, currency))
          : t.envelope.left(money(st.left, currency));
  const label =
    st.state === 'none'
      ? t.envelope.a11yNone(name, money(spent, currency))
      : t.envelope.a11y(name, st.state, money(Math.abs(st.left), currency), money(st.cap, currency)) + (hint ? `. ${hint}` : '');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityHint={onPress ? t.envelope.addTo : undefined}
      accessibilityActions={actions?.map(({ name: n, label: l }) => ({ name: n, label: l }))}
      onAccessibilityAction={(e) => actions?.find((x) => x.name === e.nativeEvent.actionName)?.run()}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: c.surface },
        frame && { borderColor: frame, borderWidth: 2, padding: E.padding - 2, paddingTop: E.flapHeight + 6 - 2 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}>
      <Svg style={s.flap} width="100%" height={E.flapHeight} viewBox="0 0 100 16" preserveAspectRatio="none">
        <Polygon points="0,0 100,0 50,16" fill={look.base} />
      </Svg>
      <View style={s.top}>
        <CategoryIcon symbol={symbol} color={color ?? categoryColorId(symbol)} size={E.iconBox} />
        <Text numberOfLines={1} style={[s.name, { color: c.text }]}>
          {name}
        </Text>
      </View>
      <View style={s.amountRow}>
        {st.state === 'over' ? <Icon name="exclamationmark.triangle.fill" size={16} color={c.over} /> : null}
        <Text style={[s.amount, { color: tone }]}>{amount}</Text>
      </View>
      {st.state !== 'none' ? (
        <>
          <View style={[s.track, { backgroundColor: c.fill }]}>
            <View style={[s.fill, { width: `${Math.min(100, st.pct)}%`, backgroundColor: bar }]} />
          </View>
          <Text style={[s.of, { color: c.text2 }]}>{t.envelope.of(money(st.spent, currency), money(st.cap, currency))}</Text>
        </>
      ) : null}
      {hint ? <Text style={[s.hint, { color: c.text2 }]}>{hint}</Text> : null}
    </Pressable>
  );
}

// Two envelopes a row; one from 130% system text size, where two would break name and amount (F3).
export function EnvelopeGrid({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  const one = fontScale >= 1.3;
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += one ? 1 : 2) rows.push(items.slice(i, i + (one ? 1 : 2)));
  return (
    <View style={s.grid}>
      {rows.map((row, i) => (
        <View key={i} style={s.gridRow}>
          {row.map((item, j) => (
            <View key={j} style={s.cell}>
              {item}
            </View>
          ))}
          {!one && row.length === 1 ? <View style={s.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: E.radius,
    padding: E.padding,
    paddingTop: E.flapHeight + 6,
    gap: tokens.space[1],
    overflow: 'hidden',
  },
  flap: { position: 'absolute', top: 0, start: 0, end: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] },
  name: { ...type.label, fontWeight: '600', flexShrink: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[1], marginTop: 2 },
  amount: { ...type.amount, fontSize: 18, lineHeight: 23, flexShrink: 1 },
  track: { height: E.barHeight, borderRadius: E.barHeight / 2, overflow: 'hidden', marginTop: 2 },
  fill: { height: E.barHeight, borderRadius: E.barHeight / 2 },
  of: { ...type.caption, ...moneyText },
  hint: { ...type.caption },
  grid: { marginHorizontal: tokens.space[4], gap: E.gap },
  gridRow: { flexDirection: 'row', gap: E.gap },
  cell: { flex: 1 },
});
