import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Switch } from 'react-native';

import { useDevices, useHousehold, useRecurring, useSetAiConsent } from '@/api/queries';
import { useSession } from '@/api/session';
import { CategoryIcon, ErrorText, Row, Screen, Section } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { exportExpenses } from '@/lib/export-csv';
import { disableNotifications, enableNotifications, type PushState, usePushState } from '@/lib/push';
import { APP_URL, FUNCTIONS_URL, supabase } from '@/lib/supabase';

const PUSH_FOOTER: Record<PushState, string> = {
  on: 'You get an alert when a category reaches 90% and 100% of its budget. Nothing else.',
  off: 'Get an alert when a category reaches 90% and 100% of its budget. Nothing else.',
  blocked: 'Notifications are blocked for this app. Allow them in your phone or browser settings, then come back.',
  'install-first': 'On iPhone, alerts work only in the app on your Home Screen: tap Share → Add to Home Screen, then open it from there.',
  unsupported: "This browser can't show notifications.",
};

export default function SettingsScreen() {
  const { session } = useSession();
  const hh = useHousehold();
  const devices = useDevices();
  const recurring = useRecurring();
  const consent = useSetAiConsent();
  const household = hh.data?.household;
  const activeDevices = (devices.data ?? []).filter((d) => !d.revoked_at).length;
  const push = usePushState();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<unknown>(null);

  const [accountBusy, setAccountBusy] = useState<'export' | 'delete' | null>(null);
  const [accountError, setAccountError] = useState<unknown>(null);

  async function exportCsv() {
    setAccountBusy('export');
    setAccountError(null);
    try {
      await exportExpenses(new Map((hh.data?.members ?? []).map((m) => [m.user_id, m.display_name])));
    } catch (e) {
      setAccountError(e);
    } finally {
      setAccountBusy(null);
    }
  }

  // G10: asked twice, because it cannot be undone. The server decides what goes with the
  // account (a household you're alone in) and what stays (a shared one).
  async function deleteAccount() {
    const alone = (hh.data?.members.length ?? 0) <= 1;
    const first = await confirm(
      'Delete your account?',
      alone
        ? `You are the only member of ${household?.name ?? 'your household'}, so it is deleted too, with all expenses, budgets and reports.`
        : `You leave ${household?.name ?? 'the household'}. The other members keep its expenses. Your sign-in is deleted.`,
      'Continue',
    );
    if (!first) return;
    const second = await confirm('This cannot be undone', 'Export your expenses first if you want a copy.', 'Delete Account');
    if (!second || !session) return;
    setAccountBusy('delete');
    setAccountError(null);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Could not delete the account. Try again in a minute.');
      await supabase.auth.signOut();
    } catch (e) {
      setAccountError(e);
      setAccountBusy(null);
    }
  }

  async function togglePush(on: boolean) {
    if (!session) return;
    setPushBusy(true);
    setPushError(null);
    try {
      push.setState(on ? await enableNotifications(session.user.id) : await disableNotifications());
    } catch (e) {
      setPushError(e);
    } finally {
      setPushBusy(false);
    }
  }

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

      {push.state ? (
        <Section title="Notifications" footer={PUSH_FOOTER[push.state]}>
          <Row
            left={<CategoryIcon symbol="bell" />}
            title="Budget alerts"
            chevron={false}
            right={
              <Switch
                value={push.state === 'on'}
                disabled={pushBusy || (push.state !== 'on' && push.state !== 'off')}
                onValueChange={togglePush}
              />
            }
            last
          />
        </Section>
      ) : null}
      <ErrorText error={pushError} />

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

      <Section>
        <Row left={<CategoryIcon symbol="questionmark.circle" />} title="Set Up Guide" onPress={() => router.push('/settings/install')} last />
      </Section>

      <Section title="Your Data">
        <Row
          left={<CategoryIcon symbol="square.and.arrow.down" />}
          title={accountBusy === 'export' ? 'Preparing…' : 'Export Expenses (CSV)'}
          onPress={accountBusy ? undefined : exportCsv}
          chevron={false}
        />
        <Row
          left={<CategoryIcon symbol="hand.raised" />}
          title="Privacy Policy"
          onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/privacy.html`)}
        />
        <Row
          left={<CategoryIcon symbol="doc.text.magnifyingglass" />}
          title="Terms of Use"
          onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/terms.html`)}
          last
        />
      </Section>

      <Section title="Account" footer={session?.user.email ?? undefined}>
        <Row title="Sign Out" onPress={() => supabase.auth.signOut()} chevron={false} />
        <Row
          title={accountBusy === 'delete' ? 'Deleting…' : 'Delete Account'}
          destructive
          onPress={accountBusy ? undefined : deleteAccount}
          chevron={false}
          last
        />
      </Section>
      <ErrorText error={accountError} />
    </Screen>
  );
}
