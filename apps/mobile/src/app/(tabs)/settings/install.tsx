import { router, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon, Screen, Section } from '@/components/ui';
import { isInstalled, isIosBrowser } from '@/lib/install';
import { useColors } from '@/lib/theme';

type Step = { icon: string; title: string; body: string };

const IPHONE_INSTALL: Step[] = [
  { icon: 'square.and.arrow.up', title: 'Tap Share', body: 'The square with an arrow, at the bottom of Safari.' },
  { icon: 'plus', title: 'Add to Home Screen', body: 'Scroll the list a little if you don’t see it. Keep the name and tap Add.' },
  { icon: 'house', title: 'Open it from the Home Screen', body: 'Sign in once more there: the Home Screen app keeps its own sign-in.' },
];

const OTHER_INSTALL: Step[] = [
  { icon: 'ellipsis.circle', title: 'Open the browser menu', body: 'In Chrome it is ⋮ at the top right.' },
  { icon: 'plus', title: 'Install app / Add to Home screen', body: 'Confirm, then open it from your home screen or app list.' },
];

const AFTER: Step[] = [
  { icon: 'bell', title: 'Turn on budget alerts', body: 'Settings → Budget alerts. You’ll hear from the app only at 90% and 100% of a budget.' },
  { icon: 'person.2', title: 'Invite your household', body: 'Settings → Household → Create Invite, and send the link to whoever shares expenses with you.' },
  { icon: 'iphone.gen3', title: 'Log Apple Pay automatically', body: 'Settings → Shortcut & Devices: create a token, install the Shortcut and paste it in. Each purchase then logs itself.' },
];

// G12: setup for people who have never added a web app to their Home Screen.
export default function InstallGuide() {
  const c = useColors();
  const installed = isInstalled();
  const steps = isIosBrowser() ? IPHONE_INSTALL : OTHER_INSTALL;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Set Up', headerLargeTitle: false }} />
      {installed ? (
        <View style={[s.done, { backgroundColor: c.cell }]}>
          <Icon name="checkmark.circle.fill" size={22} color={c.green} />
          <Text style={[s.doneText, { color: c.label }]}>Installed. You’re using the Home Screen app.</Text>
        </View>
      ) : (
        <StepList title="1 · Add to your Home Screen" steps={steps} />
      )}
      <StepList title={installed ? 'Next' : '2 · Then, in the app'} steps={AFTER} />
      <View style={{ marginHorizontal: 16, marginTop: 24 }}>
        <Button title="Done" kind="plain" onPress={() => router.back()} />
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
  stepTitle: { fontSize: 16, fontWeight: '600' },
  stepBody: { fontSize: 14, lineHeight: 19 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 14 },
  doneText: { fontSize: 15, flex: 1 },
});
