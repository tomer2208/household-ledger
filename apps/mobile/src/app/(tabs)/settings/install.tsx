import { router, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon, Screen, Section } from '@/components/ui';
import { t } from '@/lib/i18n';
import { isInstalled, isIosBrowser } from '@/lib/install';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

type Step = { icon: string; title: string; body: string };

// The words come from i18n (guide.*), step for step with these icons.
const withIcons = (icons: string[], steps: readonly { title: string; body: string }[]): Step[] =>
  steps.map((st, i) => ({ ...st, icon: icons[i] }));

// G12: setup for people who have never added a web app to their Home Screen.
export default function InstallGuide() {
  const c = useColors();
  const installed = isInstalled();
  const steps = isIosBrowser()
    ? withIcons(['square.and.arrow.up', 'plus', 'house'], t.guide.iphone)
    : withIcons(['ellipsis.circle', 'plus'], t.guide.other);
  const after = withIcons(['bell', 'person.2', 'iphone.gen3'], t.guide.after);

  return (
    <Screen>
      <Stack.Screen options={{ title: t.guide.title, headerLargeTitle: false }} />
      {installed ? (
        <View style={[s.done, { backgroundColor: c.cell }]}>
          <Icon name="checkmark.circle.fill" size={22} color={c.green} />
          <Text style={[s.doneText, { color: c.label }]}>{t.guide.installed}</Text>
        </View>
      ) : (
        <StepList title={t.guide.step1} steps={steps} />
      )}
      <StepList title={installed ? t.guide.next : t.guide.step2} steps={after} />
      <View style={{ marginHorizontal: 16, marginTop: 24 }}>
        <Button title={t.common.done} kind="plain" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function StepList({ title, steps }: { title: string; steps: Step[] }) {
  const c = useColors();
  return (
    <Section title={title}>
      {steps.map((st, i) => (
        <View
          key={st.title}
          style={[s.step, i < steps.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={[s.num, { backgroundColor: c.fill }]}>
            <Icon name={st.icon} size={18} color={c.tint} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.stepTitle, { color: c.label }]}>{st.title}</Text>
            <Text style={[s.stepBody, { color: c.secondaryLabel }]}>{st.body}</Text>
          </View>
        </View>
      ))}
    </Section>
  );
}

const s = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start' },
  num: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontFamily: fontFamily.body, fontSize: 16, fontWeight: '600' },
  stepBody: { fontFamily: fontFamily.body, fontSize: 14, lineHeight: 19 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 14 },
  doneText: { fontFamily: fontFamily.body, fontSize: 15, flex: 1 },
});
