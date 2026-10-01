import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateHousehold, useJoinHousehold } from '@/api/queries';
import { LanguageToggle } from '@/components/language-picker';
import { Button, ErrorText, Field, Section } from '@/components/ui';
import { aiDisclosure } from '@/lib/ai-disclosure';
import { lang, t } from '@/lib/i18n';
import { CURRENCIES } from '@/lib/money';
import { clearPendingInvite, readPendingInvite } from '@/lib/pending-invite';
import { clearSetupPending, setSetupPending } from '@/lib/setup';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

// US-M1 AC2: create a household or join the partner's with an invite code.
// An invite link (G3) opened earlier lands here with the code already filled in.
export default function Onboarding() {
  const c = useColors();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState(t.onboarding.defaultName);
  const [currency, setCurrency] = useState<string>('ILS');
  // Off until the person turns it on: consent to share data has to be their own act.
  const [aiConsent, setAiConsent] = useState(false);
  const [code, setCode] = useState('');
  const create = useCreateHousehold();
  const join = useJoinHousehold();
  const busy = create.isPending || join.isPending;

  useEffect(() => {
    readPendingInvite().then((pending) => {
      if (!pending) return;
      setMode('join');
      setCode(pending);
    });
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.groupedBackground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.title, { color: c.label }]}>{t.onboarding.title}</Text>

        <View style={[s.segment, { backgroundColor: c.fill }]}>
          {(['create', 'join'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[s.segmentItem, mode === m && { backgroundColor: c.cell }]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}>
              <Text style={[s.segmentText, { color: c.label }]}>{m === 'create' ? t.onboarding.startNew : t.onboarding.joinExisting}</Text>
            </Pressable>
          ))}
        </View>

        <Section title={t.onboarding.you}>
          <Field label={t.onboarding.yourName} value={displayName} onChangeText={setDisplayName} placeholder={t.onboarding.firstName} last />
        </Section>

        {mode === 'create' ? (
          <>
            <Section title={t.settings.household} footer={t.onboarding.currencyFooter}>
              <Field label={t.review.name} value={householdName} onChangeText={setHouseholdName} />
              <View style={s.currencyRow}>
                <Text style={[s.currencyLabel, { color: c.label }]}>{t.household.currency}</Text>
                <View style={s.currencyChips}>
                  {CURRENCIES.map((cur) => (
                    <Pressable
                      key={cur}
                      onPress={() => setCurrency(cur)}
                      hitSlop={{ top: 4, bottom: 4 }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: currency === cur }}
                      style={[s.chip, { backgroundColor: currency === cur ? c.tint : c.fill }]}>
                      <Text style={{ color: currency === cur ? c.onTint : c.label, fontWeight: '600' }}>{cur}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Section>

            {/* US-M1 AC5: explicit disclosure before anything is sent to a third-party AI. */}
            <Section title={t.onboarding.smart} footer={aiDisclosure()}>
              <View style={s.switchRow}>
                <Text style={[s.switchLabel, { color: c.label }]}>{t.onboarding.useAi}</Text>
                <Switch value={aiConsent} onValueChange={setAiConsent} />
              </View>
            </Section>

            <View style={s.actions}>
              <Button
                title={t.onboarding.create}
                loading={busy}
                disabled={!displayName.trim() || !householdName.trim()}
                onPress={async () => {
                  // P1-7: set before creating, so the route guard's redirect already finds it.
                  await setSetupPending();
                  // P1-6: a Hebrew household starts with Hebrew category names.
                  create.mutate({ name: householdName.trim(), currency, displayName: displayName.trim(), aiConsent, language: lang() });
                }}
              />
            </View>
          </>
        ) : (
          <>
            <Section title={t.onboarding.inviteCode} footer={t.onboarding.inviteFooter}>
              <Field label={t.signIn.code} value={code} onChangeText={setCode} placeholder="ABCD-EFGH" autoCapitalize="characters" last />
            </Section>
            <View style={s.actions}>
              <Button
                title={t.onboarding.join}
                loading={busy}
                disabled={!displayName.trim() || code.replace(/[^A-Za-z0-9]/g, '').length < 8}
                onPress={() =>
                  join.mutate(
                    { code, displayName: displayName.trim() },
                    {
                      onSuccess: () => {
                        clearPendingInvite();
                        clearSetupPending(); // joining: the household's budgets already exist
                      },
                    },
                  )
                }
              />
            </View>
          </>
        )}
        <ErrorText error={create.error ?? join.error} />

        <View style={s.actions}>
          <Button title={t.settings.signOut} kind="plain" onPress={() => supabase.auth.signOut()} />
          <LanguageToggle />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 34, fontWeight: '700', marginHorizontal: 20, marginTop: 24 },
  segment: { flexDirection: 'row', marginHorizontal: 16, marginTop: 20, borderRadius: 9, padding: 2 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 7, minHeight: 36 },
  segmentText: { fontSize: 14, fontWeight: '600' },
  currencyRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  currencyLabel: { fontSize: 17 },
  currencyChips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, minHeight: 36, justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 50 },
  switchLabel: { fontSize: 17 },
  actions: { marginHorizontal: 16, marginTop: 20 },
});
