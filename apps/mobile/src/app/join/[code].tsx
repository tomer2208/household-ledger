import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useHousehold } from '@/api/queries';
import { useSession } from '@/api/session';
import { Button, Icon } from '@/components/ui';
import { t } from '@/lib/i18n';
import { clearPendingInvite, savePendingInvite } from '@/lib/pending-invite';
import { useColors } from '@/lib/theme';

// G3: /join/ABCD-EFGH. Outside every guard, like "/": it keeps the code, then sends the
// person through sign-in (if needed) to onboarding, which fills the code in.
export default function JoinLink() {
  const c = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useSession();
  const hh = useHousehold();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (code) savePendingInvite(code).then(() => setSaved(true));
  }, [code]);

  // Nothing to carry forward for someone who already has a household.
  const alreadyMember = !!session && !!hh.data?.household;
  useEffect(() => {
    if (saved && alreadyMember) clearPendingInvite();
  }, [saved, alreadyMember]);

  if (!saved || (session && hh.isLoading)) return null;
  if (!session) return <Redirect href="/sign-in" />;
  if (!hh.data?.household) return <Redirect href="/onboarding" />;

  // Already in a household: one household per person, so this link can't be used as-is.
  return (
    <View style={[s.wrap, { backgroundColor: c.groupedBackground }]}>
      <Icon name="person.2" size={44} color={c.tertiaryLabel} />
      <Text style={[s.title, { color: c.label }]}>{t.join.title}</Text>
      <Text style={[s.body, { color: c.secondaryLabel }]}>
        {t.join.body(hh.data.household.name)}
      </Text>
      <Button title={t.join.open} onPress={() => router.replace('/overview')} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 12 },
});
