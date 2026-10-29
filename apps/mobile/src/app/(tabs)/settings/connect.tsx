import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, Text, View } from 'react-native';

import { useAssignDevice, useCaptureHealth, useCreateHouseholdKey, useDevices, useHousehold, useHouseholdKey } from '@/api/queries';
import { IosMock } from '@/components/ios-mock';
import { Button, ErrorText, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { appDirText } from '@/lib/rtl';
import { APP_URL } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// Apple Pay setup, one step a screen (the household key, the FinPace Shortcut, a test, the Wallet
// automation, a first purchase), each checked by the app where it can be: the test and the first
// purchase show up on the server, so the screen moves on by itself. The FinPace Shortcut is
// built in code (shortcuts/build_finpace.py) and asks for the household key on install.
const SHORTCUT_URL = `${APP_URL}/FinPace.shortcut`;
const RUN_TEST = 'shortcuts://run-shortcut?name=FinPace';
const STEPS = ['intro', 'key', 'install', 'test', 'automation', 'first', 'done'] as const;
type Step = (typeof STEPS)[number];

// While the screen waits for the server, it asks again every few seconds.
function usePoll(keys: string[][], on: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })), 3000);
    return () => clearInterval(id);
  }, [on, qc, keys]);
}

const KEY_QUERY = [['hh', 'capture_key']];
const DEVICE_QUERIES = [['hh', 'devices'], ['hh', 'capture_health']];

export default function ConnectScreen() {
  const c = useColors();
  const [step, setStep] = useState<Step>('intro');
  const go = (s: Step) => setStep(s);
  const n = STEPS.indexOf(step);
  // the steps that count in "Step 2 of 5": not the intro or the end
  const shown = n >= 1 && n <= 5;

  return (
    <Screen>
      <Stack.Screen options={{ title: t.connect.title, headerLargeTitle: false }} />
      {shown ? (
        <View style={s.progress} accessibilityLabel={t.connect.stepOf(n, 5)}>
          <Text style={[s.stepOf, { color: c.secondaryLabel }]}>{t.connect.stepOf(n, 5)}</Text>
          <View style={[s.bar, { backgroundColor: c.fill }]}>
            <View style={[s.barFill, { backgroundColor: c.tint, width: `${(n / 5) * 100}%` }]} />
          </View>
        </View>
      ) : null}
      {step === 'intro' ? <Intro onNext={() => go('key')} /> : null}
      {step === 'key' ? <KeyStep onNext={() => go('install')} /> : null}
      {step === 'install' ? <InstallStep onNext={() => go('test')} /> : null}
      {step === 'test' ? <TestStep onNext={() => go('automation')} /> : null}
      {step === 'automation' ? <AutomationStep onNext={() => go('first')} /> : null}
      {step === 'first' ? <FirstStep onNext={() => go('done')} /> : null}
      {step === 'done' ? <Done /> : null}
      {shown ? (
        <View style={s.back}>
          <Button title={t.connect.back} kind="plain" onPress={() => go(STEPS[n - 1])} />
        </View>
      ) : null}
    </Screen>
  );
}

function Card({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[s.card, { backgroundColor: c.cell }]}>
      <Text {...appDirText()} style={[s.title, { color: c.label }]}>{title}</Text>
      {body ? <Text {...appDirText()} style={[s.body, { color: c.secondaryLabel }]}>{body}</Text> : null}
      {children}
    </View>
  );
}

// "1  Tap this." A numbered line, the number in a circle.
function Line({ n, text }: { n: number; text: string }) {
  const c = useColors();
  return (
    <View style={s.line}>
      <View style={[s.num, { backgroundColor: c.tint }]}>
        <Text style={[s.numText, { color: c.onTint }]}>{n}</Text>
      </View>
      <Text {...appDirText()} style={[s.lineText, { color: c.label }]}>{text}</Text>
    </View>
  );
}

function Status({ ok, text }: { ok: boolean; text: string }) {
  const c = useColors();
  return (
    <View style={[s.status, { backgroundColor: ok ? c.green : c.fill }]} accessibilityLiveRegion="polite">
      {ok ? null : <ActivityIndicator color={c.secondaryLabel as string} />}
      <Text {...appDirText()} style={[s.statusText, { color: ok ? '#fff' : c.label }]}>{text}</Text>
    </View>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  return (
    <Card title={t.connect.introTitle} body={t.connect.introBody}>
      <Text {...appDirText()} style={s.small}>{t.connect.introExample}</Text>
      <IosMock rows={[{ label: 'FinPace', hint: t.connect.introSample }]} />
      <Text {...appDirText()} style={s.small}>{t.connect.introTime}</Text>
      <Button title={t.connect.start} onPress={onNext} />
    </Card>
  );
}

function KeyStep({ onNext }: { onNext: () => void }) {
  const key = useHouseholdKey();
  const create = useCreateHouseholdKey();
  const [copied, setCopied] = useState(false);
  const existing = key.data?.key ?? null;
  // a key made before members could copy it has no readable copy
  const stale = !!key.data && !existing;

  async function copy() {
    const value = existing ?? (await create.mutateAsync());
    await Clipboard.setStringAsync(value);
    setCopied(true);
    key.refetch();
  }

  return (
    <Card title={t.connect.keyTitle} body={t.connect.keyBody}>
      {stale ? <Text {...appDirText()} style={s.small}>{t.connect.remakeNote}</Text> : null}
      <Button
        title={existing ? t.connect.copyKey : stale ? t.connect.remakeKey : t.connect.makeKey}
        onPress={copy}
        loading={create.isPending || key.isPending}
      />
      {copied ? <Status ok text={t.connect.copied} /> : null}
      <ErrorText error={create.error} />
      <Button title={t.connect.next} kind="plain" disabled={!copied} onPress={onNext} />
    </Card>
  );
}

function InstallStep({ onNext }: { onNext: () => void }) {
  return (
    <Card title={t.connect.installTitle}>
      {t.connect.install.map((line, i) => (
        <Line key={i} n={i + 1} text={line} />
      ))}
      <IosMock
        title="FinPace"
        rows={[{ label: t.connect.mockKeyField, tap: true }]}
        button={{ label: 'Add Shortcut', tap: false }}
      />
      <Button title={t.connect.getShortcut} onPress={() => Linking.openURL(SHORTCUT_URL)} />
      <Button title={t.connect.next} kind="plain" onPress={onNext} />
    </Card>
  );
}

function TestStep({ onNext }: { onNext: () => void }) {
  const key = useHouseholdKey();
  // when the test was started; a little early, as the phone's and the server's clocks may differ
  const [since, setSince] = useState<number | null>(null);
  const waiting = since != null;
  const used = key.data?.last_used_at ? new Date(key.data.last_used_at).getTime() : 0;
  const ok = since != null && used >= since;
  usePoll(KEY_QUERY, waiting && !ok);

  function run() {
    setSince(Date.now() - 5000);
    Linking.openURL(RUN_TEST);
  }

  return (
    <Card title={t.connect.testTitle} body={t.connect.testBody}>
      <Button title={t.connect.runTest} onPress={run} />
      <Text {...appDirText()} style={s.small}>{t.connect.testAllow}</Text>
      {waiting ? <Status ok={ok} text={ok ? t.connect.connected : t.connect.testWaiting} /> : null}
      {waiting && !ok ? <Text {...appDirText()} style={s.small}>{t.connect.testManual}</Text> : null}
      <Button title={t.connect.next} kind={ok ? 'filled' : 'plain'} onPress={onNext} />
    </Card>
  );
}

function AutomationStep({ onNext }: { onNext: () => void }) {
  const mocks = [
    <IosMock key="a" rows={[{ label: 'Shortcuts' }, { label: 'Automation', tap: true }, { label: '+', tap: true }]} />,
    <IosMock
      key="b"
      title="New Automation"
      rows={[{ label: 'Transaction', hint: 'Wallet', tap: true }, { label: 'Run Immediately', toggle: true, tap: true }, { label: 'Next' }]}
    />,
    <IosMock
      key="c"
      title="Dictionary"
      rows={[
        { label: 'merchant', value: 'Merchant' },
        { label: 'amount', value: 'Amount' },
        { label: 'card', value: 'Card or Pass' },
        { label: 'name', value: 'Name' },
      ]}
    />,
    <IosMock key="d" title="Run Shortcut" rows={[{ label: 'FinPace', tap: true }, { label: 'Input', value: 'Dictionary', tap: true }]} button={{ label: 'Done' }} />,
  ];
  return (
    <Card title={t.connect.automationTitle} body={t.connect.automationBody}>
      {t.connect.autoSteps.map((line, i) => (
        <View key={i} style={{ gap: 8 }}>
          <Line n={i + 1} text={line} />
          {mocks[i]}
        </View>
      ))}
      <Button title={t.connect.openShortcuts} kind="plain" onPress={() => Linking.openURL('shortcuts://')} />
      <Button title={t.connect.automationDone} onPress={onNext} />
    </Card>
  );
}

function FirstStep({ onNext }: { onNext: () => void }) {
  const c = useColors();
  // a purchase from a minute before this screen counts too
  const [since] = useState(() => Date.now() - 60_000);
  const health = useCaptureHealth();
  const devices = useDevices();
  const members = useHousehold().data?.members ?? [];
  const assign = useAssignDevice();
  const fresh = (health.data ?? []).find((h) => h.last_capture_at && new Date(h.last_capture_at).getTime() >= since);
  const device = fresh ? (devices.data ?? []).find((d) => d.id === fresh.device_id) : undefined;
  usePoll(DEVICE_QUERIES, !fresh);
  const unowned = !!device && !device.user_id;

  return (
    <Card title={t.connect.firstTitle} body={t.connect.firstBody}>
      <Status ok={!!fresh} text={fresh ? t.connect.firstArrived(fresh.label) : t.connect.firstWaiting} />
      {unowned ? (
        <>
          <Text {...appDirText()} style={[s.title, { color: c.label, fontSize: 17 }]}>{t.connect.whose}</Text>
          <View style={s.owners}>
            {members.map((m) => (
              <Button
                key={m.user_id}
                title={m.display_name}
                kind="plain"
                loading={assign.isPending && assign.variables?.userId === m.user_id}
                onPress={() => assign.mutate({ deviceId: device.id, userId: m.user_id }, { onSuccess: onNext })}
              />
            ))}
          </View>
        </>
      ) : null}
      <ErrorText error={assign.error} />
      {fresh && !unowned ? <Button title={t.connect.next} onPress={onNext} /> : null}
      {!fresh ? <Button title={t.connect.skip} kind="plain" onPress={onNext} /> : null}
    </Card>
  );
}

function Done() {
  const link = `${APP_URL}/settings/connect`;
  return (
    <Card title={t.connect.doneTitle} body={t.connect.doneBody}>
      <Button title={t.connect.partner} onPress={() => Share.share({ message: t.connect.partnerMessage(link) }).catch(() => {})} />
      <Button title={t.connect.manage} kind="plain" onPress={() => router.replace('/settings/devices')} />
      <Button title={t.connect.finish} kind="plain" onPress={() => router.replace('/overview')} />
    </Card>
  );
}

const s = StyleSheet.create({
  progress: { marginHorizontal: 16, marginTop: 12, gap: 6 },
  stepOf: { fontFamily: fontFamily.body, fontSize: 13 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 16, gap: 14 },
  title: { fontFamily: fontFamily.body, fontSize: 22, fontWeight: '700' },
  body: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18, color: '#8E8E93' },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numText: { fontFamily: fontFamily.body, fontWeight: '700', fontSize: 13 },
  lineText: { flex: 1, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
  statusText: { flex: 1, fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  owners: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  back: { marginHorizontal: 16, marginTop: 8, marginBottom: 24 },
});
