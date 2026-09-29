import { router } from 'expo-router';

import { useDeleteTransaction, useRestoreTransaction } from '@/api/queries';
import { useToast } from '@/components/toast';
import { formatSigned } from '@/lib/money';
import { useIsOnline } from '@/lib/query';

type Tx = { id: string; title: string; amount_minor: number; currency: string };

// R5: Edit and Delete for an expense, shared by the list's swipe actions and the details
// screen. Delete is a soft delete that happens at once (so the partner's phone agrees), and
// the toast's Undo clears deleted_at again. No confirmation dialog: Undo is the safety net.
export function useTransactionActions() {
  const del = useDeleteTransaction();
  const restore = useRestoreTransaction();
  const toast = useToast();
  const online = useIsOnline();

  const edit = (tx: Tx) => router.push({ pathname: '/transaction/[id]', params: { id: tx.id } });

  // Resolves true once the expense is deleted.
  async function remove(tx: Tx): Promise<boolean> {
    if (!online) {
      toast({ message: 'You’re offline. Delete when you’re back online.' });
      return false;
    }
    try {
      await del.mutateAsync(tx.id);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : String(e) });
      return false;
    }
    toast({
      message: `${tx.title} · ${formatSigned(tx.amount_minor, tx.currency)} deleted`,
      action: {
        label: 'Undo',
        onPress: () =>
          restore.mutate(tx.id, { onError: (e) => toast({ message: `Couldn’t restore it: ${e instanceof Error ? e.message : e}` }) }),
      },
    });
    return true;
  }

  return { edit, remove };
}
