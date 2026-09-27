import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { useCreateInvite, useHousehold } from '@/api/queries';
import { ErrorText, Row, Screen, Section } from '@/components/ui';
import { shortDate } from '@/lib/dates';
import { useColors } from '@/lib/theme';

export default function HouseholdScreen() {
  const c = useColors();
  const hh = useHousehold();
  const invite = useCreateInvite();
  const [code, setCode] = useState<string | null>(null);
  const members = hh.data?.members ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: hh.data?.household?.name ?? 'Household', headerLargeTitle: false }} />
      <Section title="Members" footer="Everyone has equal rights and sees everything.">
        {members.map((m, i) => (
          <Row
            key={m.user_id}
            title={m.display_name + (m.user_id === hh.data?.me?.user_id ? ' (you)' : '')}
            subtitle={`Joined ${shortDate(m.joined_at)}`}
            last={i === members.length - 1}
          />
        ))}
      </Section>

      <Section title="Currency">
        <Row title="Base currency" value={hh.data?.household?.base_currency} last />
      </Section>

      <Section title="Invite" footer="The code works once and expires in 72 hours.">
        {code ? (
          <View style={s.codeBox}>
            <Text selectable style={[s.code, { color: c.label }]}>{code}</Text>
          </View>
        ) : null}
        <Row
          title={code ? 'Share Code' : 'Create Invite Code'}
          onPress={async () => {
            if (!code) {
              setCode(await invite.mutateAsync());
              return;
            }
            await Clipboard.setStringAsync(code);
            Share.share({ message: `Join our household in Household Ledger with code ${code}` }).catch(() => {});
          }}
          chevron={false}
          last
        />
      </Section>
      <ErrorText error={invite.error} />
    </Screen>
  );
}

const s = StyleSheet.create({
  codeBox: { alignItems: 'center', paddingVertical: 18 },
  code: { fontSize: 32, fontWeight: '700', letterSpacing: 3, fontVariant: ['tabular-nums'] },
});
