import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCaptureHealth, useCreateDeviceToken, useDevices, useHousehold, useRevokeDevice } from '@/api/queries';
import { silentDays } from '@/components/capture-banner';
import { Badge, Button, ErrorText, Field, Row, Screen, Section } from '@/components/ui';
import { shortDate } from '@/lib/dates';
import { t } from '@/lib/i18n';
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
  const [label, setLabel] = useState(t.devices.defaultName(hh.data?.me?.display_name));
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const names = new Map((hh.data?.members ?? []).map((m) => [m.user_id, m.display_name]));
  const list = devices.data ?? [];
  // R9: a quiet Shortcut gets a badge here and the checklist at the top.
  const health = new Map((useCaptureHealth().data ?? []).map((h) => [h.device_id, h]));
  const quiet = [...health.values()].filter((h) => h.status !== 'ok');

  async function copy(what: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(what);
  }

  async function confirmRevoke(id: string, name: string) {
    if (await confirm(t.devices.revokeTitle(name), t.devices.revokeBody, t.devices.revoke)) revoke.mutate(id);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t.settings.devices, headerLargeTitle: false }} />

      {/* R9: first thing on screen when a banner's Check brings you here. */}
      {quiet.length > 0 ? (
        <Section
          title={t.devices.stuckTitle}
          footer={t.devices.stuckFooter}>
          {t.devices.stuck.map((text, i, all) => (
            <Step key={i} n={i + 1} text={text} last={i === all.length - 1} />
          ))}
        </Section>
      ) : null}

      {token ? (
        <Section title={t.devices.newToken} footer={t.devices.newTokenFooter}>
          <View style={s.tokenBox}>
            <Text selectable style={[s.token, { color: c.label }]}>{token}</Text>
          </View>
          <Row
            title={copied === 'token' ? t.devices.copied : t.devices.copyToken}
            onPress={() => copy('token', token)}
            chevron={false}
            last
          />
        </Section>
      ) : (
        <Section title={t.devices.connect} footer={t.devices.connectFooter}>
          <Field label={t.review.name} value={label} onChangeText={setLabel} maxLength={40} last />
        </Section>
      )}
      {!token ? (
        <View style={s.actions}>
          <Button
            title={t.devices.createToken}
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
        title={t.devices.buildTitle}
        footer={t.devices.buildFooter}>
        {t.devices.build.map((text, i, all) => (
          <Step key={i} n={i + 1} text={text} last={i === all.length - 1}>
            {i === 2 ? (
              <CopyRow label={t.devices.captureAddress} value={CAPTURE_URL} copied={copied === 'capture'} onCopy={() => copy('capture', CAPTURE_URL)} />
            ) : i === 7 ? (
              <CopyRow label={t.devices.confirmAddress} value={CONFIRM_URL} copied={copied === 'confirm'} onCopy={() => copy('confirm', CONFIRM_URL)} />
            ) : null}
          </Step>
        ))}
      </Section>

      {list.length > 0 ? (
        <Section title={t.devices.devices}>
          {list.map((d, i) => (
            <Row
              key={d.id}
              title={d.label}
              subtitle={
                d.revoked_at
                  ? t.devices.revoked(shortDate(d.revoked_at))
                  : `${names.get(d.user_id) ?? ''} · ${d.last_used_at ? t.devices.lastUsed(shortDate(d.last_used_at)) : t.devices.neverUsed}`
              }
              value={d.revoked_at ? undefined : t.devices.revoke}
              right={
                health.get(d.id)?.status === 'silent' ? (
                  <Badge text={t.devices.silent(silentDays(health.get(d.id)!))} color={c.orange} />
                ) : health.get(d.id)?.status === 'setup' ? (
                  <Badge text={t.devices.noPurchases} color={c.orange} />
                ) : undefined
              }
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
    <Pressable onPress={onCopy} style={[s.copy, { backgroundColor: c.fill }]} accessibilityRole="button" accessibilityLabel={t.devices.copyA11y(label)}>
      {/* The path is what tells the two addresses apart; Copy still takes the full URL. */}
      <Text numberOfLines={1} style={[s.copyValue, { color: c.secondaryLabel }]}>
        {value.replace(/^https:\/\/[^/]+/, '…')}
      </Text>
      <Text style={{ color: c.tint, fontSize: 15, fontWeight: '600' }}>{copied ? t.devices.copied : t.devices.copy}</Text>
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
