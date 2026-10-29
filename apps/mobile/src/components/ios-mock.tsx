import { StyleSheet, Text, View } from 'react-native';

import { appDirText } from '@/lib/rtl';

// A drawing of an iOS Shortcuts screen for the Apple Pay setup guide, drawn the way iOS 17/18
// shows it: a navigation bar with its action at the top (Next, Done, +), grouped rows, a check
// mark for a choice, and actions as sentences ("Run FinPace with Dictionary"). The thing to tap
// is ringed and marked 👆. Always light and in iOS's own colours, since it stands for the
// iPhone's screen, not the app's. Rows follow the app's direction, as an iPhone set to Hebrew
// is mirrored too, and text keeps the app's direction so a Hebrew label reads right.
export type MockRow = {
  label: string;
  // a small grey line under the label
  hint?: string;
  // what's on the trailing side: a value, or a check mark for the chosen option
  value?: string;
  check?: boolean;
  // the row to tap
  tap?: boolean;
  // an action written as a sentence, its variables blue: [['Run'], ['FinPace', true], …]
  sentence?: [string, boolean?][];
};

export type Mock = {
  title?: string;
  // the navigation bar's action at the top (Next, Done, +)
  action?: string;
  actionTap?: boolean;
  rows?: MockRow[];
  // a wide button at the bottom of the sheet (Add Shortcut)
  bottom?: string;
  bottomTap?: boolean;
  // the tab bar along the bottom of the screen, and which tab to tap
  tabs?: string[];
  tabTap?: number;
};

export function IosMock({ title, action, actionTap, rows = [], bottom, bottomTap, tabs, tabTap }: Mock) {
  return (
    <View
      style={s.frame}
      accessibilityRole="image"
      accessibilityLabel={[title, action, ...rows.map((r) => r.label)].filter(Boolean).join(', ')}>
      {title || action ? (
        <View style={s.nav}>
          <Text style={s.title}>{title ?? ''}</Text>
          {action ? (
            <View style={[s.action, actionTap && s.tapAction]}>
              <Text style={s.actionText}>{action}</Text>
              {actionTap ? <Text style={s.finger}>👆</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {rows.length ? (
      <View style={s.card}>
        {rows.map((r, i) => (
          <View key={`${r.label}-${i}`} style={[s.row, i > 0 && s.rowLine, r.tap && s.tapRow]}>
            <View style={{ flex: 1 }}>
              {r.sentence ? (
                <Text {...appDirText()} style={s.label}>
                  {r.sentence.map(([w, blue], j) => (
                    <Text key={j} style={blue ? s.token : undefined}>
                      {j > 0 ? ' ' : ''}
                      {w}
                    </Text>
                  ))}
                </Text>
              ) : (
                <Text {...appDirText()} style={[s.label, r.tap && s.tapText]}>{r.label}</Text>
              )}
              {r.hint ? <Text {...appDirText()} style={s.hint}>{r.hint}</Text> : null}
            </View>
            {r.check ? <Text style={s.check}>✓</Text> : r.value ? <Text style={s.value}>{r.value}</Text> : null}
            {r.tap ? <Text style={s.finger}>👆</Text> : null}
          </View>
        ))}
      </View>
      ) : null}
      {bottom ? (
        <View style={[s.bottom, bottomTap && s.tapAction]}>
          <Text style={s.bottomText}>{bottom}</Text>
          {bottomTap ? <Text style={s.finger}>👆</Text> : null}
        </View>
      ) : null}
      {tabs ? (
        <View style={s.tabs}>
          {tabs.map((tab, i) => (
            <View key={tab} style={[s.tab, i === tabTap && s.tapAction]}>
              <Text style={[s.tabText, i === tabTap && { color: BLUE }]}>{tab}</Text>
              {i === tabTap ? <Text style={s.finger}>👆</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const BLUE = '#0A84FF';
const s = StyleSheet.create({
  // iOS's grouped background, whatever the app's theme
  frame: { backgroundColor: '#F2F2F7', borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: '#D1D1D6' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, minHeight: 32 },
  title: { fontSize: 17, fontWeight: '700', color: '#000' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tapAction: { borderWidth: 2, borderColor: BLUE, backgroundColor: '#E5F1FF' },
  actionText: { fontSize: 17, color: BLUE, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C6C6C8' },
  tapRow: { backgroundColor: '#E5F1FF', borderWidth: 2, borderColor: BLUE, borderRadius: 10, margin: 2 },
  label: { fontSize: 15, color: '#000' },
  token: { color: BLUE, fontWeight: '600' },
  tapText: { color: BLUE, fontWeight: '600' },
  hint: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  value: { fontSize: 15, color: BLUE },
  check: { fontSize: 18, color: BLUE, fontWeight: '700' },
  finger: { fontSize: 18 },
  bottom: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: BLUE, borderRadius: 14, paddingVertical: 12 },
  bottomText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C6C6C8', paddingTop: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  tabText: { fontSize: 13, color: '#8E8E93', fontWeight: '600' },
});
