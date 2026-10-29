import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { useAssignDevice, useCaptureHealth, useCreateHouseholdKey, useDevices, useHousehold, useHouseholdKey, useRevokeDevice } from '@/api/queries';
import { silentDays } from '@/components/capture-banner';
import { Badge, Button, ErrorText, Row, Screen, Section } from '@/components/ui';
import { shortDate } from '@/lib/dates';
import { appDirText } from '@/lib/rtl';
import { t } from '@/lib/i18n';
import { APP_URL } from '@/lib/supabase';
import { confirm } from '@/lib/confirm';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// US-C5 + Shortcut setup (BLUEPRINT §3.11, shortcuts/SPEC.md). The household has one key for one
// FinPace Shortcut, built once and shared by AirDrop (migration 49); each iPhone adds a small
// Wallet automation that runs it, since Apple doesn't let those be shared. An iPhone shows up
// below after its first purchase, and someone says whose it is. The key is shown exactly once.
const SHORTCUT_URL = `${APP_URL}/FinPace.shortcut`;

export default function DevicesScreen() {
  const c = useColors();
  const hh = useHousehold();
  const devices = useDevices();
  const key = useHouseholdKey();
  const createKey = useCreateHouseholdKey();
  const assign = useAssignDevice();
  const revoke = useRevokeDevice();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const members = hh.data?.members ?? [];
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const list = devices.data ?? [];
  const unowned = list.filter((d) => !d.revoked_at && d.device_name && !d.user_id);
  // R9: a quiet Shortcut gets a badge here and the checklist at the top.
  const health = new Map((useCaptureHealth().data ?? []).map((h) => [h.device_id, h]));
  const quiet = [...health.values()].filter((h) => h.status !== 'ok');

  async function copy(what: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(what);
  }

  async function makeKey() {
    if (key.data && !(await confirm(t.devices.replaceTitle, t.devices.replaceBody, t.devices.replace))) return;
    setNewKey(await createKey.mutateAsync());
    key.refetch();
  }

  async function confirmRevoke(id: string, name: string) {
    if (await confirm(t.devices.revokeTitle(name), t.devices.revokeBody, t.devices.revoke)) revoke.mutate(id);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t.settings.devices, headerLargeTitle: false }} />

      {/* R9: first thing on screen when a banner's Check brings you here. */}
      {quiet.length > 0 ? (
        <Section title={t.devices.stuckTitle} footer={t.devices.stuckFooter}>
          {t.devices.stuck.map((text, i, all) => (
            <Step key={i} n={i + 1} text={text} last={i === all.length - 1} />
          ))}
        </Section>
      ) : null}

      {/* A new iPhone's purchases wait here for an owner. */}
      {unowned.map((d) => (
        <Section key={d.id} title={t.devices.whoseTitle} footer={t.devices.whoseFooter}>
          {/* the phone's name is isolated, so an English name doesn't turn a Hebrew line around */}
          <Text {...appDirText()} style={[s.whose, { color: c.label }]}>
            {t.devices.whose(`\u2068${d.label}\u2069`)}
          </Text>
          <View style={s.owners}>
            {members.map((m) => (
              <Button
                key={m.user_id}
                title={m.display_name}
                kind="plain"
                loading={assign.isPending && assign.variables?.deviceId === d.id && assign.variables?.userId === m.user_id}
                onPress={() => assign.mutate({ deviceId: d.id, userId: m.user_id })}
              />
            ))}
          </View>
        </Section>
      ))}

      {newKey ? (
        <Section title={t.devices.newKey} footer={t.devices.newKeyFooter}>
          <View style={s.tokenBox}>
            <Text selectable style={[s.token, { color: c.label }]}>{newKey}</Text>
          </View>
          <Row
            title={copied === 'key' ? t.devices.copied : t.devices.copyKey}
            onPress={() => copy('key', newKey)}
            chevron={false}
            last
          />
        </Section>
      ) : (
        <Section title={t.devices.keyTitle} footer={t.devices.keyFooter}>
          {key.data ? (
            <Row
              title={t.devices.keyMade(shortDate(key.data.created_at))}
              subtitle={key.data.last_used_at ? t.devices.keyUsed(shortDate(key.data.last_used_at)) : t.devices.keyNeverUsed}
            />
          ) : null}
          <Row
            title={key.data ? t.devices.replaceKey : t.devices.createKey}
            onPress={makeKey}
            chevron={false}
            destructive={!!key.data}
            last
          />
        </Section>
      )}
      <ErrorText error={createKey.error ?? assign.error ?? revoke.error} />

      {/* The FinPace Shortcut is built in code (shortcuts/build_finpace.py) and served with the app;
          on install, iOS asks for the household key. */}
      <Section title={t.devices.buildTitle} footer={t.devices.buildFooter}>
        {t.devices.build.map((text, i, all) => (
          <Step key={i} n={i + 1} text={text} last={i === all.length - 1}>
            {i === 1 ? (
              <Button title={t.devices.download} onPress={() => Linking.openURL(SHORTCUT_URL)} />
            ) : null}
          </Step>
        ))}
      </Section>

      <Section title={t.devices.phoneTitle} footer={t.devices.phoneFooter}>
        {t.devices.phone.map((text, i, all) => (
          <Step key={i} n={i + 1} text={text} last={i === all.length - 1} />
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
                  : `${d.user_id ? (names.get(d.user_id) ?? '') : t.devices.noOwner} · ${d.last_used_at ? t.devices.lastUsed(shortDate(d.last_used_at)) : t.devices.neverUsed}`
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

const s = StyleSheet.create({
  tokenBox: { padding: 16 },
  token: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 14 },
  whose: { fontFamily: fontFamily.body, fontSize: 17, paddingHorizontal: 16, paddingTop: 14 },
  owners: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  step: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: fontFamily.body, fontWeight: '700', fontSize: 13 },
  stepText: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  copyValue: { flex: 1, fontSize: 13, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
