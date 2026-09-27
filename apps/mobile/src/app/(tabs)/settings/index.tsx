import { router } from 'expo-router';
import { Switch } from 'react-native';

import { useDevices, useHousehold, useRecurring, useSetAiConsent } from '@/api/queries';
import { useSession } from '@/api/session';
import { CategoryIcon, Row, Screen, Section } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { session } = useSession();
  const hh = useHousehold();
  const devices = useDevices();
  const recurring = useRecurring();
  const consent = useSetAiConsent();
  const household = hh.data?.household;
  const activeDevices = (devices.data ?? []).filter((d) => !d.revoked_at).length;

  return (
    <Screen>
      <Section title="Budget">
        <Row left={<CategoryIcon symbol="tag" />} title="Categories & Budgets" onPress={() => router.push('/settings/categories')} />
        <Row
          left={<CategoryIcon symbol="calendar.badge.clock" />}
          title="Recurring"
          value={recurring.data ? String(recurring.data.length) : undefined}
          onPress={() => router.push('/settings/recurring')}
        />
        <Row left={<CategoryIcon symbol="banknote" />} title="Savings" onPress={() => router.push('/settings/savings')} last />
      </Section>

      <Section title="Apple Pay" footer="Each iPhone gets its own token for the Shortcut. Revoke it here if a phone is lost.">
        <Row
          left={<CategoryIcon symbol="iphone.gen3" />}
          title="Shortcut & Devices"
          value={devices.data ? String(activeDevices) : undefined}
          onPress={() => router.push('/settings/devices')}
          last
        />
      </Section>

      <Section title="Household">
        <Row
          left={<CategoryIcon symbol="person.2" />}
          title={household?.name ?? 'Household'}
          subtitle={hh.data?.members.map((m) => m.display_name).join(' & ')}
          onPress={() => router.push('/settings/household')}
          last
        />
      </Section>

      <Section
        title="AI"
        footer="Sends merchant names, amounts and category names to Anthropic's Claude for category suggestions and the monthly report. No card numbers, names or emails.">
        <Row
          left={<CategoryIcon symbol="sparkles" />}
          title="AI suggestions"
          chevron={false}
          right={
            <Switch
              value={!!household?.ai_consent_at}
              disabled={!household || consent.isPending}
              onValueChange={(on) => {
                if (household) consent.mutate({ householdId: household.id, on });
              }}
            />
          }
        />
        <Row left={<CategoryIcon symbol="list.bullet" />} title="AI Activity" onPress={() => router.push('/settings/ai-activity')} last />
      </Section>

      <Section title="Account" footer={session?.user.email ?? undefined}>
        <Row title="Sign Out" onPress={() => supabase.auth.signOut()} chevron={false} last />
      </Section>
    </Screen>
  );
}
