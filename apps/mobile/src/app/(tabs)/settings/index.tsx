import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Switch } from 'react-native';

import { useDevices, useHousehold, useOverview, useRecurring, useSetAiConsent } from '@/api/queries';
import { useSession } from '@/api/session';
import { LanguageRows } from '@/components/language-picker';
import { SwipeRow } from '@/components/swipe-row';
import { CategoryIcon, ErrorText, Row, Screen, Section } from '@/components/ui';
import { aiDisclosure } from '@/lib/ai-disclosure';
import { confirm } from '@/lib/confirm';
import { exportExpenses } from '@/lib/export-csv';
import { t } from '@/lib/i18n';
import { useIncomeActions } from '@/lib/income-actions';
import { deviceLang } from '@/lib/lang-store';
import { formatMoney } from '@/lib/money';
import { disableNotifications, enableNotifications, usePushState } from '@/lib/push';
import { APP_URL, FUNCTIONS_URL, supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { session } = useSession();
  const hh = useHousehold();
  const devices = useDevices();
  const recurring = useRecurring();
  const overview = useOverview();
  const income = useIncomeActions();
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
      t.settings.deleteAccountTitle,
      alone ? t.settings.deleteAlone(household?.name) : t.settings.deleteShared(household?.name),
      t.settings.continue,
    );
    if (!first) return;
    const second = await confirm(t.settings.cannotUndo, t.settings.exportFirst, t.settings.deleteAccount);
    if (!second || !session) return;
    setAccountBusy('delete');
    setAccountError(null);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(t.settings.deleteFailed);
      await supabase.auth.signOut();
    } catch (e) {
      setAccountError(e);
      setAccountBusy(null);
    }
  }

  // Turning AI on shares data with a third party, so it asks first with the full disclosure.
  // Turning it off is immediate: withdrawing consent must be as easy as giving it.
  async function toggleAi(on: boolean) {
    if (!household) return;
    if (on && !(await confirm(t.settings.aiTurnOnTitle, `${aiDisclosure()} ${t.settings.aiAppliesTo(household.name)}`, t.settings.turnOn, false))) return;
    consent.mutate({ householdId: household.id, on });
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
      <Section title={t.settings.budget}>
        {overview.data?.income ? (
          // Set: swipe (or long press) to edit or remove it.
          <SwipeRow onEdit={income.edit} onDelete={income.remove}>
            {(open) => (
              <Row
                left={<CategoryIcon symbol="briefcase" />}
                title={t.settings.income}
                value={formatMoney(overview.data!.income, overview.data!.currency)}
                onPress={income.edit}
                onLongPress={open}
                actions={[
                  { name: 'edit', label: t.common.edit, run: income.edit },
                  { name: 'delete', label: t.common.remove, run: income.remove },
                ]}
              />
            )}
          </SwipeRow>
        ) : (
          <Row
            left={<CategoryIcon symbol="briefcase" />}
            title={t.settings.income}
            value={overview.data ? t.settings.notSet : undefined}
            onPress={income.edit}
          />
        )}
        <Row left={<CategoryIcon symbol="tag" />} title={t.settings.categories} onPress={() => router.push('/settings/categories')} />
        <Row
          left={<CategoryIcon symbol="calendar.badge.clock" />}
          title={t.settings.recurring}
          value={recurring.data ? String(recurring.data.length) : undefined}
          onPress={() => router.push('/settings/recurring')}
        />
        <Row left={<CategoryIcon symbol="banknote" />} title={t.overview.savings} onPress={() => router.push('/settings/savings')} last />
      </Section>

      <Section title="Apple Pay" footer={t.settings.applePayFooter}>
        <Row
          left={<CategoryIcon symbol="iphone.gen3" />}
          title={t.settings.devices}
          value={devices.data ? String(activeDevices) : undefined}
          onPress={() => router.push('/settings/devices')}
          last
        />
      </Section>

      {push.state ? (
        <Section title={t.settings.notifications} footer={t.settings.pushFooter[push.state]}>
          <Row
            left={<CategoryIcon symbol="bell" />}
            title={t.settings.budgetAlerts}
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

      <Section title={t.settings.household}>
        <Row
          left={<CategoryIcon symbol="person.2" />}
          title={household?.name ?? t.settings.household}
          subtitle={hh.data?.members.map((m) => m.display_name).join(' & ')}
          onPress={() => router.push('/settings/household')}
          last
        />
      </Section>

      {/* P1-6: Hebrew or English; switching reloads the app in the new language. */}
      <Section title={t.settings.language} footer={t.settings.languageFooter}>
        <LanguageRows systemLabel={t.settings.languageSystem(deviceLang() === 'he' ? 'עברית' : 'English')} />
      </Section>

      <Section title="AI" footer={aiDisclosure()}>
        <Row
          left={<CategoryIcon symbol="sparkles" />}
          title={t.settings.aiSuggestions}
          chevron={false}
          right={
            <Switch
              value={!!household?.ai_consent_at}
              disabled={!household || consent.isPending}
              onValueChange={toggleAi}
            />
          }
        />
        <Row left={<CategoryIcon symbol="list.bullet" />} title={t.settings.aiActivity} onPress={() => router.push('/settings/ai-activity')} last />
      </Section>

      <Section>
        <Row left={<CategoryIcon symbol="questionmark.circle" />} title={t.settings.guide} onPress={() => router.push('/settings/install')} last />
      </Section>

      <Section title={t.settings.yourData}>
        <Row
          left={<CategoryIcon symbol="square.and.arrow.down" />}
          title={accountBusy === 'export' ? t.settings.preparing : t.settings.export}
          onPress={accountBusy ? undefined : exportCsv}
          chevron={false}
        />
        <Row
          left={<CategoryIcon symbol="hand.raised" />}
          title={t.settings.privacy}
          onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/privacy.html`)}
        />
        <Row
          left={<CategoryIcon symbol="doc.text.magnifyingglass" />}
          title={t.settings.terms}
          onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/terms.html`)}
          last
        />
      </Section>

      <Section title={t.settings.account} footer={session?.user.email ?? undefined}>
        <Row title={t.settings.signOut} onPress={() => supabase.auth.signOut()} chevron={false} />
        <Row
          title={accountBusy === 'delete' ? t.settings.deleting : t.settings.deleteAccount}
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
