import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { useCreateInvite, useHousehold, useLeaveHousehold, useRemoveMember } from '@/api/queries';
import { ErrorText, Row, Screen, Section } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { shortDate } from '@/lib/dates';
import { APP_URL } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function HouseholdScreen() {
  const c = useColors();
  const hh = useHousehold();
  const invite = useCreateInvite();
  const remove = useRemoveMember();
  const leave = useLeaveHousehold();
  const [code, setCode] = useState<string | null>(null);
  const members = hh.data?.members ?? [];
  const meId = hh.data?.me?.user_id;
  const name = hh.data?.household?.name ?? 'this household';
  const alone = members.length <= 1;

  // G4: removing someone stops their Shortcut at once; the expenses they added stay.
  async function confirmRemove(userId: string, displayName: string) {
    const ok = await confirm(
      `Remove ${displayName}?`,
      `${displayName} will lose access to ${name} and their Shortcut stops logging. Expenses they added stay.`,
      'Remove',
    );
    if (ok) remove.mutate(userId);
  }

  // Leaving sends you back to onboarding (the route guard sees no household).
  async function confirmLeave() {
    const ok = alone
      ? await confirm(
          `Delete ${name}?`,
          'You are the only member, so leaving deletes the household with all its expenses, budgets and reports. This cannot be undone.',
          'Delete Household',
        )
      : await confirm(
          `Leave ${name}?`,
          'You lose access to its expenses and your Shortcut stops logging. The others keep everything. You can rejoin with a new invite.',
          'Leave',
        );
    if (ok) leave.mutate();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: hh.data?.household?.name ?? 'Household', headerLargeTitle: false }} />
      <Section title="Members" footer="Everyone has equal rights and sees everything.">
        {members.map((m, i) => (
          <Row
            key={m.user_id}
            title={m.display_name + (m.user_id === meId ? ' (you)' : '')}
            subtitle={`Joined ${shortDate(m.joined_at)}`}
            right={
              m.user_id !== meId ? (
                <Pressable
                  onPress={() => confirmRemove(m.user_id, m.display_name)}
                  disabled={remove.isPending}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.display_name}`}>
                  <Text style={{ color: c.red, fontSize: 15 }}>Remove</Text>
                </Pressable>
              ) : undefined
            }
            last={i === members.length - 1}
          />
        ))}
      </Section>

      <Section title="Currency">
        <Row title="Base currency" value={hh.data?.household?.base_currency} last />
      </Section>

      <Section title="Invite" footer="Send the link to whoever you share expenses with. It works once and expires in 72 hours.">
        {code ? (
          <View style={s.codeBox}>
            <Text selectable style={[s.code, { color: c.label }]}>{code}</Text>
          </View>
        ) : null}
        <Row
          title={code ? 'Share Invite Link' : 'Create Invite'}
          onPress={async () => {
            if (!code) {
              setCode(await invite.mutateAsync());
              return;
            }
            // G3: a link joins in one tap; the code stays visible for typing it in by hand.
            const link = `${APP_URL}/join/${code}`;
            await Clipboard.setStringAsync(link);
            Share.share({ message: `Join our household in FinPace: ${link}` }).catch(() => {});
          }}
          chevron={false}
          last
        />
      </Section>

      <Section footer={alone ? 'You are the only member: leaving deletes the household.' : undefined}>
        <Row title={alone ? 'Delete Household' : 'Leave Household'} destructive onPress={confirmLeave} chevron={false} last />
      </Section>
      <ErrorText error={invite.error ?? remove.error ?? leave.error} />
    </Screen>
  );
}

const s = StyleSheet.create({
  codeBox: { alignItems: 'center', paddingVertical: 18 },
  code: { fontSize: 32, fontWeight: '700', letterSpacing: 3, fontVariant: ['tabular-nums'] },
});
