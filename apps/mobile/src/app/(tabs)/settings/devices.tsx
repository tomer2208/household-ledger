import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCreateDeviceToken, useDevices, useHousehold, useRevokeDevice } from '@/api/queries';
import { Button, ErrorText, Field, Row, Screen, Section } from '@/components/ui';
import { shortDate } from '@/lib/dates';
import { FUNCTIONS_URL } from '@/lib/supabase';
import { confirm } from '@/lib/confirm';
import { useColors } from '@/lib/theme';

// US-C5 + Shortcut setup (BLUEPRINT §3.11, shortcuts/SPEC.md). The token is shown exactly once.
// Wallet automations can't be shared by link, so the guide below is how each person builds one.
const CAPTURE_URL = `${FUNCTIONS_URL}/capture`;
const CONFIRM_URL = `${FUNCTIONS_URL}/capture/confirm`;

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
        <Section title="Your new token" footer="Copy it now and keep it in Notes until the Shortcut is built. For your security it won't be shown again.">
          <View style={s.tokenBox}>
            <Text selectable style={[s.token, { color: c.label }]}>{token}</Text>
          </View>
          <Row
            title={copied === 'token' ? 'Copied ✓' : 'Copy Token'}
            onPress={() => copy('token', token)}
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

      <Section
        title="Build the Apple Pay automation"
        footer="About 10 minutes, once per iPhone. After that, known places log silently and new ones ask for a category.">
        <Step n={1} text="Create a token above and copy it." />
        <Step n={2} text="Shortcuts app → Automation → + → Transaction. Pick your cards, choose Run Immediately, then Next → New Blank Automation." />
        <Step n={3} text="Add “Get Contents of URL”. Paste the capture address, set Method to POST and Request Body to JSON.">
          <CopyRow label="Capture address" value={CAPTURE_URL} copied={copied === 'capture'} onCopy={() => copy('capture', CAPTURE_URL)} />
        </Step>
        <Step n={4} text="In the JSON body add Text fields: token = your token; merchant, amount, card, name = Shortcut Input › Merchant, Amount, Card or Pass, Name." />
        <Step n={5} text="Add “Get Dictionary Value”: status in Contents of URL. Tap the result and set Type to Text." />
        <Step n={6} text="Add “If” → Dictionary Value is needs_input. Inside it: get transaction_id → Set Variable TxId; get prompt → Set Variable Prompt; get category_names → Choose from List with Prompt." />
        <Step n={7} text="Still inside: If Chosen Item contains “New category” → Ask for Text “New category name” → Set Variable NewCategory." />
        <Step n={8} text="After that inner If: duplicate the first URL action and change its address to the confirm address. Body: token, transaction_id = TxId, category_name = Chosen Item, new_category_name = NewCategory.">
          <CopyRow label="Confirm address" value={CONFIRM_URL} copied={copied === 'confirm'} onCopy={() => copy('confirm', CONFIRM_URL)} />
        </Step>
        <Step n={9} text="In the main Otherwise: If status is not logged → Show Notification “FinPace couldn't log this purchase. Add it in the app.”" />
        <Step
          n={10}
          text="Tap ▶ to test: without a purchase the server answers “missing merchant”, which means the token works. Your next Apple Pay purchase at a new place shows the category menu."
          last
        />
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

function Step({ n, text, last, children }: { n: number; text: string; last?: boolean; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[s.step, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[s.stepNum, { backgroundColor: c.tint }]}>
        <Text style={[s.stepNumText, { color: c.onTint }]}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={[s.stepText, { color: c.label }]}>{text}</Text>
        {children}
      </View>
    </View>
  );
}

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onCopy} style={[s.copy, { backgroundColor: c.fill }]} accessibilityRole="button" accessibilityLabel={`Copy ${label}`}>
      {/* The path is what tells the two addresses apart; Copy still takes the full URL. */}
      <Text numberOfLines={1} style={[s.copyValue, { color: c.secondaryLabel }]}>
        {value.replace(/^https:\/\/[^/]+/, '…')}
      </Text>
      <Text style={{ color: c.tint, fontSize: 15, fontWeight: '600' }}>{copied ? 'Copied ✓' : 'Copy'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tokenBox: { padding: 16 },
  token: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 14 },
  actions: { marginHorizontal: 16, marginTop: 12 },
  step: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontWeight: '700', fontSize: 13 },
  stepText: { fontSize: 15, lineHeight: 21 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  copyValue: { flex: 1, fontSize: 13, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
