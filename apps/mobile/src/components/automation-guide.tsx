import { StyleSheet, Text, View } from 'react-native';

import { IosMock, type Mock } from './ios-mock';
import { t } from '@/lib/i18n';
import { appDirText } from '@/lib/rtl';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// How to make the Wallet automation on an iPhone (the one part of the Apple Pay setup Apple
// doesn't let anyone share). Each step: what to do, in the app's language and without iOS
// words in the sentence; then the iPhone's buttons to tap as numbered chips (iOS's own names,
// each on its own, so Hebrew and English never mix in one line, and the order never depends on
// an arrow's direction); then a drawing of that screen. Used by the setup wizard and by
// Shortcut & Devices.
const MOCKS: Mock[] = [
  { title: 'Automation', action: '+', actionTap: true, tabs: ['Shortcuts', 'Automation', 'Gallery'], tabTap: 1 },
  { title: 'New Automation', rows: [{ label: 'Time of Day' }, { label: 'Transaction', hint: 'Wallet', tap: true }, { label: 'Email' }] },
  {
    title: 'Transaction',
    action: 'Next',
    actionTap: true,
    rows: [
      { label: 'Card', value: 'Max, Cal', tap: true },
      { label: 'Run Immediately', check: true, tap: true },
      { label: 'Run After Confirmation' },
    ],
  },
  {
    title: 'Dictionary',
    rows: [
      { label: 'merchant', value: 'Shortcut Input › Merchant' },
      { label: 'amount', value: 'Shortcut Input › Amount' },
      { label: 'card', value: 'Shortcut Input › Card or Pass' },
      { label: 'name', value: 'Shortcut Input › Name' },
    ],
  },
  {
    title: 'New Automation',
    action: 'Done',
    actionTap: true,
    rows: [{ label: 'Run FinPace with Dictionary', sentence: [['Run'], ['FinPace', true], ['with'], ['Dictionary', true]] }],
  },
];

export function AutomationGuide() {
  return (
    <View style={{ gap: 12 }}>
      {t.connect.guide.map((step, i) => (
        <GuideStep key={i} n={i + 1} {...step} mock={MOCKS[i]} />
      ))}
    </View>
  );
}

// One numbered step: the sentence, the buttons to tap, an optional note with its own buttons,
// and a drawing. Exported for the Shortcut's own install steps.
export function GuideStep({
  n,
  text,
  taps,
  note,
  then,
  mock,
  children,
}: {
  n: number;
  text: string;
  taps?: readonly string[];
  note?: string;
  then?: readonly string[];
  mock?: Mock;
  children?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={[s.step, { backgroundColor: c.cell }]}>
      <View style={s.head}>
        <View style={[s.num, { backgroundColor: c.tint }]}>
          <Text style={[s.numText, { color: c.onTint }]}>{n}</Text>
        </View>
        <Text {...appDirText()} style={[s.text, { color: c.label }]}>{text}</Text>
      </View>
      {taps?.length ? <Taps labels={taps} /> : null}
      {note ? <Text {...appDirText()} style={[s.note, { color: c.secondaryLabel }]}>{note}</Text> : null}
      {then?.length ? <Taps labels={then} /> : null}
      {mock ? <IosMock {...mock} /> : null}
      {children}
    </View>
  );
}

// The buttons to tap, in order, each with its number: ① Automation  ② +
export function Taps({ labels }: { labels: readonly string[] }) {
  return (
    <View style={s.taps} accessibilityLabel={labels.map((l, i) => `${i + 1}. ${l}`).join(', ')}>
      {labels.map((l, i) => (
        <View key={`${l}-${i}`} style={s.chip}>
          <View style={s.chipNum}>
            <Text style={s.chipNumText}>{i + 1}</Text>
          </View>
          <Text style={s.chipText}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  step: { borderRadius: 16, padding: 14, gap: 12 },
  head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: fontFamily.body, fontWeight: '700', fontSize: 14 },
  text: { flex: 1, fontFamily: fontFamily.body, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  taps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // iOS's blue, like the buttons it stands for
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E5F1FF', borderRadius: 8, paddingStart: 4, paddingEnd: 10, paddingVertical: 4 },
  chipNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#0A84FF', alignItems: 'center', justifyContent: 'center' },
  chipNumText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chipText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },
  note: { fontFamily: fontFamily.body, fontSize: 14, lineHeight: 20 },
});
