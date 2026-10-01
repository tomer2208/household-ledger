import { router } from 'expo-router';

import { useCategoryDelete, useSaveCategory } from '@/api/queries';
import { useToast } from '@/components/toast';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { t } from '@/lib/i18n';

type Cat = { id: string; name: string; sf_symbol: string };

// Edit and Delete for a category, shared by the swipe actions and the editor's Delete button.
// The server decides what Delete means (delete_category, migration 22); the confirmation
// says exactly that, and a toast offers Undo:
// - never used → hidden now, deleted when the toast leaves (Undo just brings it back)
// - has history → archived now (Undo restores it)
// - active recurring rules → nothing happens; the dialog offers to open Recurring
export function useCategoryActions(householdId: string | undefined) {
  const del = useCategoryDelete();
  const save = useSaveCategory();
  const toast = useToast();

  const edit = (cat: Cat) => router.push({ pathname: '/settings/category', params: { id: cat.id } });

  // Resolves true when the category is gone from the lists (deleted, pending delete or archived).
  async function remove(cat: Cat): Promise<boolean> {
    let plan;
    try {
      plan = await del.preview(cat.id);
    } catch (e) {
      toast({ message: errorMessage(e) });
      return false;
    }

    if (plan.action === 'blocked') {
      const n = plan.recurring;
      const go = await confirm(t.actions.cantDelete(cat.name), t.actions.usedByRecurring(n), t.actions.showRecurring);
      if (go) router.push('/settings/recurring');
      return false;
    }

    if (plan.action === 'archive') {
      const n = plan.transactions;
      const ok = await confirm(
        t.actions.archiveTitle(cat.name),
        n > 0 ? t.actions.archiveBody(n) : t.actions.archiveHistory,
        t.actions.archive,
      );
      if (!ok) return false;
      try {
        await del.commit(cat.id);
      } catch (e) {
        toast({ message: errorMessage(e) });
        return false;
      }
      toast({
        message: t.actions.archived(cat.name),
        action: {
          label: t.common.undo,
          onPress: () => {
            if (householdId) save.mutate({ id: cat.id, householdId, name: cat.name, sfSymbol: cat.sf_symbol, archived: false });
          },
        },
      });
      return true;
    }

    const ok = await confirm(t.actions.deleteTitle(cat.name), t.actions.deleteUnused, t.common.delete);
    if (!ok) return false;
    del.hide(cat.id);
    toast({
      message: t.actions.deleted(cat.name),
      action: { label: t.common.undo, onPress: () => del.restore() },
      onExpire: () => {
        del.commit(cat.id).catch((e) => toast({ message: errorMessage(e) }));
      },
    });
    return true;
  }

  return { edit, remove };
}
