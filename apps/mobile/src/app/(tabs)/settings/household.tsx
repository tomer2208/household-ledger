import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { useCreateInvite, useHousehold, useLeaveHousehold, useRemoveMember } from '@/api/queries';
import { ErrorText, Row, Screen, Section } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { shortDate } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { APP_URL } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

export default function HouseholdScreen() {
  const c = useColors();
  const hh = useHousehold();
  const invite = useCreateInvite();
  const remove = useRemoveMember();
  const leave = useLeaveHousehold();
  const [code, setCode] = useState<string | null>(null);
  const members = hh.data?.members ?? [];
  const meId = hh.data?.me?.user_id;
  const name = hh.data?.household?.name ?? t.household.thisHousehold;
  const alone = members.length <= 1;

  // G4: removing someone stops their Shortcut at once; the expenses they added stay.
  async function confirmRemove(userId: string, displayName: string) {
    const ok = await confirm(t.household.removeTitle(displayName), t.household.removeBody(displayName, name), t.common.remove);
    if (ok) remove.mutate(userId);
  }

  // Leaving sends you back to onboarding (the route guard sees no household).
  async function confirmLeave() {
    const ok = alone
      ? await confirm(t.household.deleteTitle(name), t.household.deleteBody, t.household.deleteHousehold)
      : await confirm(t.household.leaveTitle(name), t.household.leaveBody, t.household.leave);
    if (ok) leave.mutate();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: hh.data?.household?.name ?? t.settings.household, headerLargeTitle: false }} />
      <Section title={t.household.members} footer={t.household.membersFooter}>
        {members.map((m, i) => (
          <Row
            key={m.user_id}
            title={m.user_id === meId ? t.household.you(m.display_name) : m.display_name}
            subtitle={t.household.joined(shortDate(m.joined_at))}
            right={
              m.user_id !== meId ? (
                <Pressable
                  onPress={() => confirmRemove(m.user_id, m.display_name)}
                  disabled={remove.isPending}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t.household.removeTitle(m.display_name)}>
                  <Text style={{ color: c.red, fontSize: 15 }}>{t.common.remove}</Text>
                </Pressable>
              ) : undefined
            }
            last={i === members.length - 1}
          />
        ))}
      </Section>

      <Section title={t.household.currency}>
        <Row title={t.household.baseCurrency} value={hh.data?.household?.base_currency} last />
      </Section>

      <Section title={t.household.invite} footer={t.household.inviteFooter}>
        {code ? (
          <View style={s.codeBox}>
            <Text selectable style={[s.code, { color: c.label }]}>{code}</Text>
          </View>
        ) : null}
        <Row
          title={code ? t.household.shareInvite : t.household.createInvite}
          onPress={async () => {
            if (!code) {
              setCode(await invite.mutateAsync());
              return;
            }
            // G3: a link joins in one tap; the code stays visible for typing it in by hand.
            const link = `${APP_URL}/join/${code}`;
            await Clipboard.setStringAsync(link);
            Share.share({ message: t.household.inviteMessage(link) }).catch(() => {});
          }}
          chevron={false}
          last
        />
      </Section>

      <Section footer={alone ? t.household.aloneFooter : undefined}>
        <Row title={alone ? t.household.deleteHousehold : t.household.leaveHousehold} destructive onPress={confirmLeave} chevron={false} last />
      </Section>
      <ErrorText error={invite.error ?? remove.error ?? leave.error} />
    </Screen>
  );
}

const s = StyleSheet.create({
  codeBox: { alignItems: 'center', paddingVertical: 20 },
  code: { fontFamily: fontFamily.body, fontSize: 32, fontWeight: '700', letterSpacing: 3, fontVariant: ['tabular-nums'] },
});
