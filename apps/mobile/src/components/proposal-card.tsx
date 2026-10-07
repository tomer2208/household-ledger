import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from './ui';
import { useDecideProposal } from '@/api/queries';
import type { Proposal } from '@/api/types';
import { fill, flatten } from '@/lib/fill';
import { lang, t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// US-A2: one tap to approve (the server re-checks and applies), one to dismiss for good.
export function ProposalCard({ p, currency }: { p: Proposal; currency: string }) {
  const c = useColors();
  const decide = useDecideProposal();
  const [outcome, setOutcome] = useState<string | null>(null);
  // P1-6: the server writes the card in each member's language; older cards have English only.
  const text = fill(p.rationale.texts?.[lang()] ?? p.rationale.text, flatten({ evidence: p.rationale.evidence }), currency);

  async function act(approve: boolean) {
    const r = await decide.mutateAsync({ id: p.id, approve });
    if (r.status === 'failed') setOutcome(t.proposals.changed);
  }

  return (
    <View style={[s.card, { backgroundColor: c.cell }]}>
      <View style={s.head}>
        <Icon name="sparkles" size={15} color={c.tint} />
        <Text style={[s.kind, { color: c.tint }]}>{t.proposals.title[p.kind]}</Text>
      </View>
      <Text style={[s.text, { color: c.label }]}>{text}</Text>
      {outcome ? <Text style={[s.outcome, { color: c.secondaryLabel }]}>{outcome}</Text> : null}
      <View style={s.buttons}>
        <Button title={t.proposals.notNow} kind="plain" style={s.btn} onPress={() => act(false)} disabled={decide.isPending} />
        <Button title={t.proposals.action[p.kind]} style={s.btn} onPress={() => act(true)} loading={decide.isPending} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { fontFamily: fontFamily.body, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  text: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 22 },
  outcome: { fontFamily: fontFamily.body, fontSize: 13 },
  buttons: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, height: 44 },
});
