import { router } from 'expo-router';

import { useCategoryDelete, useSaveCategory } from '@/api/queries';
import { useToast } from '@/components/toast';
import { confirm } from '@/lib/confirm';

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
      toast({ message: e instanceof Error ? e.message : String(e) });
      return false;
    }

    if (plan.action === 'blocked') {
      const n = plan.recurring;
      const go = await confirm(
        `Can’t delete ${cat.name}`,
        `${n} recurring expense${n === 1 ? ' uses' : 's use'} this category. Move or pause ${n === 1 ? 'it' : 'them'} first.`,
        'Show Recurring',
      );
      if (go) router.push('/settings/recurring');
      return false;
    }

    if (plan.action === 'archive') {
      const n = plan.transactions;
      const ok = await confirm(
        `Archive ${cat.name}?`,
        n > 0
          ? `${n} past expense${n === 1 ? ' keeps' : 's keep'} this category. It leaves your lists and budgets, and you can restore it from Archived.`
          : 'It has history, so it’s archived rather than deleted. You can restore it from Archived.',
        'Archive',
      );
      if (!ok) return false;
      try {
        await del.commit(cat.id);
      } catch (e) {
        toast({ message: e instanceof Error ? e.message : String(e) });
        return false;
      }
      toast({
        message: `${cat.name} archived`,
        action: {
          label: 'Undo',
          onPress: () => {
            if (householdId) save.mutate({ id: cat.id, householdId, name: cat.name, sfSymbol: cat.sf_symbol, archived: false });
          },
        },
      });
      return true;
    }

    const ok = await confirm(`Delete ${cat.name}?`, 'It hasn’t been used, so it’s removed along with its budget.', 'Delete');
    if (!ok) return false;
    del.hide(cat.id);
    toast({
      message: `${cat.name} deleted`,
      action: { label: 'Undo', onPress: () => del.restore() },
      onExpire: () => {
        del.commit(cat.id).catch((e) => toast({ message: e instanceof Error ? e.message : String(e) }));
      },
    });
    return true;
  }

  return { edit, remove };
}
