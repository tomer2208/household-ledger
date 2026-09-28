import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateHousehold, useJoinHousehold } from '@/api/queries';
import { Button, ErrorText, Field, Section } from '@/components/ui';
import { CURRENCIES } from '@/lib/money';
import { clearPendingInvite, readPendingInvite } from '@/lib/pending-invite';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

// US-M1 AC2: create a household or join the partner's with an invite code.
// An invite link (G3) opened earlier lands here with the code already filled in.
export default function Onboarding() {
  const c = useColors();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('Our Home');
  const [currency, setCurrency] = useState<string>('ILS');
  const [aiConsent, setAiConsent] = useState(true);
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
        <Text style={[s.title, { color: c.label }]}>Set up your household</Text>

        <View style={[s.segment, { backgroundColor: c.fill }]}>
          {(['create', 'join'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[s.segmentItem, mode === m && { backgroundColor: c.cell }]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}>
              <Text style={[s.segmentText, { color: c.label }]}>{m === 'create' ? 'Start new' : 'Join existing'}</Text>
            </Pressable>
          ))}
        </View>

        <Section title="You">
          <Field label="Your name" value={displayName} onChangeText={setDisplayName} placeholder="First name" last />
        </Section>

        {mode === 'create' ? (
          <>
            <Section title="Household" footer="The base currency is what budgets and reports use. It locks after the first expense.">
              <Field label="Name" value={householdName} onChangeText={setHouseholdName} />
              <View style={s.currencyRow}>
                <Text style={[s.currencyLabel, { color: c.label }]}>Currency</Text>
                <View style={s.currencyChips}>
                  {CURRENCIES.map((cur) => (
                    <Pressable
                      key={cur}
                      onPress={() => setCurrency(cur)}
                      style={[s.chip, { backgroundColor: currency === cur ? c.tint : c.fill }]}>
                      <Text style={{ color: currency === cur ? c.onTint : c.label, fontWeight: '600' }}>{cur}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Section>

            {/* US-M1 AC5: explicit disclosure before anything is sent to a third-party AI. */}
            <Section
              title="Smart categorization"
              footer="When on, merchant names, amounts and your category names are sent to Anthropic's Claude to suggest categories and write the monthly report. No card numbers, names or emails are sent. You can turn this off anytime in Settings.">
              <View style={s.switchRow}>
                <Text style={[s.switchLabel, { color: c.label }]}>Use AI suggestions</Text>
                <Switch value={aiConsent} onValueChange={setAiConsent} />
              </View>
            </Section>

            <View style={s.actions}>
              <Button
                title="Create Household"
                loading={busy}
                disabled={!displayName.trim() || !householdName.trim()}
                onPress={() => create.mutate({ name: householdName.trim(), currency, displayName: displayName.trim(), aiConsent })}
              />
            </View>
          </>
        ) : (
          <>
            <Section title="Invite code" footer="Opened an invite link? The code is already here. Otherwise ask for it in Settings → Household. Codes last 72 hours.">
              <Field label="Code" value={code} onChangeText={setCode} placeholder="ABCD-EFGH" autoCapitalize="characters" last />
            </Section>
            <View style={s.actions}>
              <Button
                title="Join Household"
                loading={busy}
                disabled={!displayName.trim() || code.replace(/[^A-Za-z0-9]/g, '').length < 8}
                onPress={() =>
                  join.mutate({ code, displayName: displayName.trim() }, { onSuccess: () => clearPendingInvite() })
                }
              />
            </View>
          </>
        )}
        <ErrorText error={create.error ?? join.error} />

        <View style={s.actions}>
          <Button title="Sign Out" kind="plain" onPress={() => supabase.auth.signOut()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 34, fontWeight: '700', marginHorizontal: 20, marginTop: 24 },
  segment: { flexDirection: 'row', marginHorizontal: 16, marginTop: 20, borderRadius: 9, padding: 2 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 7 },
  segmentText: { fontSize: 14, fontWeight: '600' },
  currencyRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  currencyLabel: { fontSize: 17 },
  currencyChips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, minHeight: 36, justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 50 },
  switchLabel: { fontSize: 17 },
  actions: { marginHorizontal: 16, marginTop: 20 },
});
