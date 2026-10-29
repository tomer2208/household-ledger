import { StyleSheet, Text, View } from 'react-native';

import { appDirText } from '@/lib/rtl';

// A drawing of an iOS Shortcuts screen for the Apple Pay setup wizard: the rows a person sees,
// with the one to tap ringed and marked. It's always light and in iOS's own colours, since it
// stands for the iPhone's screen, not the app's. Labels are the iOS names people search for.
// Rows follow the app's direction, as an iPhone set to Hebrew is mirrored too, and text keeps
// the app's direction so a Hebrew label reads right.
export type MockRow = {
  label: string;
  // what's on the right of the row: a value, a switch, or a chevron
  value?: string;
  toggle?: boolean;
  // the row to tap
  tap?: boolean;
  // a small grey line under the label
  hint?: string;
};

export function IosMock({
  title,
  rows,
  button,
  caption,
}: {
  title?: string;
  rows: MockRow[];
  button?: { label: string; tap?: boolean };
  caption?: string;
}) {
  return (
    <View style={s.frame} accessibilityRole="image" accessibilityLabel={[title, ...rows.map((r) => r.label), button?.label].filter(Boolean).join(', ')}>
      {title ? <Text style={s.title}>{title}</Text> : null}
      <View style={s.card}>
        {rows.map((r, i) => (
          <View key={`${r.label}-${i}`} style={[s.row, i > 0 && s.rowLine, r.tap && s.tapRow]}>
            <View style={{ flex: 1 }}>
              <Text {...appDirText()} style={[s.label, r.tap && s.tapText]}>{r.label}</Text>
              {r.hint ? <Text {...appDirText()} style={s.hint}>{r.hint}</Text> : null}
            </View>
            {r.toggle ? (
              <View style={s.switch}>
                <View style={s.knob} />
              </View>
            ) : r.value ? (
              <Text style={s.value}>{r.value}</Text>
            ) : null}
            {r.tap ? <Text style={s.finger}>👆</Text> : null}
          </View>
        ))}
      </View>
      {button ? (
        <View style={[s.button, button.tap && s.tapButton]}>
          <Text style={s.buttonText}>{button.label}</Text>
          {button.tap ? <Text style={s.finger}>👆</Text> : null}
        </View>
      ) : null}
      {caption ? (
        <Text {...appDirText()} style={s.caption}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const BLUE = '#0A84FF';
const s = StyleSheet.create({
  // iOS's grouped background, whatever the app's theme
  frame: { backgroundColor: '#F2F2F7', borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: '#D1D1D6' },
  title: { fontSize: 17, fontWeight: '700', color: '#000', paddingHorizontal: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C6C6C8' },
  tapRow: { backgroundColor: '#E5F1FF', borderWidth: 2, borderColor: BLUE, borderRadius: 10, margin: 2 },
  label: { fontSize: 15, color: '#000' },
  tapText: { color: BLUE, fontWeight: '600' },
  hint: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  value: { fontSize: 15, color: BLUE, writingDirection: 'ltr' },
  switch: { width: 40, height: 24, borderRadius: 12, backgroundColor: '#34C759', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 2 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  finger: { fontSize: 18 },
  button: { flexDirection: 'row', gap: 8, alignSelf: 'center', alignItems: 'center', backgroundColor: BLUE, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10 },
  tapButton: { borderWidth: 3, borderColor: '#9ECBFF' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 13, color: '#3C3C43', paddingHorizontal: 4 },
});
