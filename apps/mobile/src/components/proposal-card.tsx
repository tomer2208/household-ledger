import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from './ui';
import { useDecideProposal } from '@/api/queries';
import type { Proposal } from '@/api/types';
import { fill, flatten } from '@/lib/fill';
import { useColors } from '@/lib/theme';

const TITLE: Record<Proposal['kind'], string> = {
  create_recurring: 'Make it recurring',
  update_estimate: 'Update an estimate',
  adjust_budget: 'Adjust a budget',
  recategorize_merchant: 'Fix a category',
  flag_duplicate: 'Possible duplicate',
};

const ACTION: Record<Proposal['kind'], string> = {
  create_recurring: 'Create',
  update_estimate: 'Update',
  adjust_budget: 'Apply',
  recategorize_merchant: 'Change',
  flag_duplicate: 'Remove',
};

// US-A2: one tap to approve (the server re-checks and applies), one to dismiss for good.
export function ProposalCard({ p, currency }: { p: Proposal; currency: string }) {
  const c = useColors();
  const decide = useDecideProposal();
  const [outcome, setOutcome] = useState<string | null>(null);
  const text = fill(p.rationale.text, flatten({ evidence: p.rationale.evidence }), currency);

  async function act(approve: boolean) {
    const r = await decide.mutateAsync({ id: p.id, approve });
    if (r.status === 'failed') setOutcome('Things changed since this was suggested, so nothing was applied.');
  }

  return (
    <View style={[s.card, { backgroundColor: c.cell }]}>
      <View style={s.head}>
        <Icon name="sparkles" size={15} color={c.tint} />
        <Text style={[s.kind, { color: c.tint }]}>{TITLE[p.kind]}</Text>
      </View>
      <Text style={[s.text, { color: c.label }]}>{text}</Text>
      {outcome ? <Text style={[s.outcome, { color: c.secondaryLabel }]}>{outcome}</Text> : null}
      <View style={s.buttons}>
        <Button title="Not now" kind="plain" style={s.btn} onPress={() => act(false)} disabled={decide.isPending} />
        <Button title={ACTION[p.kind]} style={s.btn} onPress={() => act(true)} loading={decide.isPending} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  text: { fontSize: 16, lineHeight: 22 },
  outcome: { fontSize: 13 },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 44 },
});
