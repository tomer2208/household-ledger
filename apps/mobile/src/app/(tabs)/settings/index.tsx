import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';

import { useDevices, useHousehold, useOverview, useRecurring, useSetAiConsent, useSetReportNotices } from '@/api/queries';
import { useSession } from '@/api/session';
import { LanguageRows } from '@/components/language-picker';
import { SwipeRow } from '@/components/swipe-row';
import { CategoryIcon, ErrorText, Icon, Row, Screen, Section } from '@/components/ui';
import { aiDisclosure } from '@/lib/ai-disclosure';
import { buildLabel } from '@/lib/app-update';
import { confirm } from '@/lib/confirm';
import { exportExpenses } from '@/lib/export-csv';
import { lang, t } from '@/lib/i18n';
import { useIncomeActions } from '@/lib/income-actions';
import { deviceLang } from '@/lib/lang-store';
import { formatMoney } from '@/lib/money';
import { disableNotifications, enableNotifications, usePushState } from '@/lib/push';
import { APP_URL, FUNCTIONS_URL, supabase } from '@/lib/supabase';
import { schemeEvents, schemeReadings, setAppearance, useAppearanceChoice } from '@/lib/appearance';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

export default function SettingsScreen() {
  const { session } = useSession();
  const c = useColors();
  const appearance = useAppearanceChoice();
  const hh = useHousehold();
  const reportNotices = useSetReportNotices();
  const notifyReports = hh.data?.me?.notify_reports ?? true;
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
      {/* P4 (D1: grouped by system parts): by what people come to do. The month's money first. */}
      <Section title={t.settings.groupMoney}>
        <Row left={<CategoryIcon symbol="pencil" />} title={t.budgets.open} onPress={() => router.push('/settings/budgets')} />
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

      {/* How expenses get in: Apple Pay, and the shop names it learned */}
      <Section title={t.settings.groupCapture} footer={t.settings.applePayFooter}>
        <Row
          left={<CategoryIcon symbol="iphone.gen3" />}
          title={t.settings.devices}
          value={devices.data ? String(activeDevices) : undefined}
          onPress={() => router.push('/settings/devices')}
        />
        <Row left={<CategoryIcon symbol="bag" />} title={t.settings.merchants} onPress={() => router.push('/settings/merchants')} last />
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
                accessibilityLabel={t.settings.budgetAlerts}
              />
            }
          />
          {/* P1-19: the month's report, announced when it is written; needs notifications on. */}
          <Row
            left={<CategoryIcon symbol="doc.text" />}
            title={t.settings.reportNotices}
            subtitle={t.settings.reportNoticesHint}
            chevron={false}
            right={
              <Switch
                value={push.state === 'on' && (reportNotices.isPending ? !!reportNotices.variables : notifyReports)}
                disabled={push.state !== 'on' || reportNotices.isPending}
                onValueChange={(on) => reportNotices.mutate(on)}
                accessibilityLabel={t.settings.reportNotices}
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
      {/* P5: light, dark, or like the phone */}
      <Section title={t.settings.groupLook}>
        {(['system', 'light', 'dark'] as const).map((k, i) => (
          <Row
            key={k}
            title={k === 'system' ? t.settings.appearanceSystem : k === 'light' ? t.settings.appearanceLight : t.settings.appearanceDark}
            right={appearance === k ? <Icon name="checkmark" size={18} color={c.tint} /> : null}
            onPress={() => setAppearance(k)}
            chevron={false}
            last={i === 2}
          />
        ))}
      </Section>
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
              accessibilityLabel={t.settings.aiSuggestions}
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
          onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/privacy${lang() === 'he' ? '.he' : ''}.html`)}
        />
        <Row
          left={<CategoryIcon symbol="doc.text.magnifyingglass" />}
          title={t.settings.terms}
          onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/terms${lang() === 'he' ? '.he' : ''}.html`)}
          last
        />
      </Section>

      <Section title={t.settings.account} footer={session?.user.email ?? undefined}>
        <Row title={t.settings.signOut} onPress={() => supabase.auth.signOut()} chevron={false} last />
      </Section>
      {/* D1 / F4: deleting the account sits apart from Sign Out, never a slip of the thumb away. */}
      <View style={{ height: 32 }} />
      <Section>
        <Row
          title={accountBusy === 'delete' ? t.settings.deleting : t.settings.deleteAccount}
          destructive
          onPress={accountBusy ? undefined : deleteAccount}
          chevron={false}
          last
        />
      </Section>
      <ErrorText error={accountError} />
      <SchemeDebug />
      {buildLabel() ? (
        <Text style={{ fontFamily: fontFamily.body, color: c.secondaryLabel, fontSize: 13, textAlign: 'center', marginTop: 24 }}>
          {t.settings.version(buildLabel()!)}
        </Text>
      ) : null}
    </Screen>
  );
}

// TEMP (dark mode on iPhone): what the phone reports about light/dark, live. Removed once fixed.
function SchemeDebug() {
  const c = useColors();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  if (Platform.OS !== 'web') return null;
  const r = schemeReadings();
  const ev = Object.entries(schemeEvents).map(([k, n]) => `${k}:${n}`).join(' ') || '-';
  return (
    <Text style={{ fontFamily: fontFamily.body, color: c.secondaryLabel, fontSize: 12, textAlign: 'center', marginTop: 24 }} {...({ dir: 'ltr' } as object)}>
      {`css:${r.css === 2 ? 'dark' : r.css === 1 ? 'light' : r.css} js:${r.js ? 'dark' : 'light'} app:${r.app ? 'dark' : 'light'} | ${ev}`}
    </Text>
  );
}
