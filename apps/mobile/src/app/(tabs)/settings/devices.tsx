import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useCreateDeviceToken, useDevices, useHousehold, useRevokeDevice } from '@/api/queries';
import { Button, ErrorText, Field, Row, Screen, Section } from '@/components/ui';
import { shortDate } from '@/lib/dates';
import { FUNCTIONS_URL } from '@/lib/supabase';
import { confirm } from '@/lib/confirm';
import { useColors } from '@/lib/theme';

// US-C5 + Shortcut setup (BLUEPRINT §3.11). The token is shown exactly once.
export default function DevicesScreen() {
  const c = useColors();
  const hh = useHousehold();
  const devices = useDevices();
  const create = useCreateDeviceToken();
  const revoke = useRevokeDevice();
  const [label, setLabel] = useState(`${hh.data?.me?.display_name ?? 'My'}'s iPhone`);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const names = new Map((hh.data?.members ?? []).map((m) => [m.user_id, m.display_name]));
  const list = devices.data ?? [];

  async function copy(what: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(what);
  }

  async function confirmRevoke(id: string, name: string) {
    if (await confirm(`Revoke ${name}?`, 'Its Shortcut stops logging purchases immediately.', 'Revoke')) revoke.mutate(id);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Shortcut & Devices', headerLargeTitle: false }} />

      {token ? (
        <Section title="Your new token" footer="Copy it into the Shortcut now. For your security it won't be shown again.">
          <View style={s.tokenBox}>
            <Text selectable style={[s.token, { color: c.label }]}>{token}</Text>
          </View>
          <Row title={copied === 'token' ? 'Copied ✓' : 'Copy Token'} onPress={() => copy('token', token)} chevron={false} />
          <Row
            title={copied === 'url' ? 'Copied ✓' : 'Copy Server URL'}
            subtitle={FUNCTIONS_URL}
            onPress={() => copy('url', FUNCTIONS_URL)}
            chevron={false}
            last
          />
        </Section>
      ) : (
        <Section title="Connect this iPhone" footer="Creates a private token for the Apple Pay Shortcut on this phone.">
          <Field label="Name" value={label} onChangeText={setLabel} maxLength={40} last />
        </Section>
      )}
      {!token ? (
        <View style={s.actions}>
          <Button
            title="Create Token"
            loading={create.isPending}
            disabled={!label.trim()}
            onPress={async () => {
              const r = await create.mutateAsync(label.trim());
              setToken(r.token);
            }}
          />
        </View>
      ) : null}
      <ErrorText error={create.error ?? revoke.error} />

      <Section title="Set up the Shortcut" footer="Apple doesn't let apps install automations, so this last step is done once by hand on each iPhone.">
        <Step n={1} text="Create a token above and copy it." />
        <Step n={2} text={'Install the "Log Expense" Shortcut and paste the token and server URL when it asks.'} />
        <Step n={3} text="Shortcuts → Automation → + → Transaction. Pick your cards, choose Run Immediately, then run “Log Expense”." last />
      </Section>

      {list.length > 0 ? (
        <Section title="Devices">
          {list.map((d, i) => (
            <Row
              key={d.id}
              title={d.label}
              subtitle={
                d.revoked_at
                  ? `Revoked ${shortDate(d.revoked_at)}`
                  : `${names.get(d.user_id) ?? ''} · ${d.last_used_at ? `last used ${shortDate(d.last_used_at)}` : 'never used'}`
              }
              value={d.revoked_at ? undefined : 'Revoke'}
              onPress={d.revoked_at ? undefined : () => confirmRevoke(d.id, d.label)}
              chevron={false}
              titleStyle={d.revoked_at ? { color: c.secondaryLabel as string } : undefined}
              last={i === list.length - 1}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={[s.step, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[s.stepNum, { backgroundColor: c.tint }]}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <Text style={[s.stepText, { color: c.label }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tokenBox: { padding: 16 },
  token: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 14 },
  actions: { marginHorizontal: 16, marginTop: 12 },
  step: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21 },
});
