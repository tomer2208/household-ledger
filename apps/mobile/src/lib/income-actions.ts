import { router } from 'expo-router';

import { useOverview, useSetIncome } from '@/api/queries';
import { useToast } from '@/components/toast';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

// Edit and Remove for the monthly income, shared by the swipe actions (Settings row, income
// card) and the Monthly Income screen. Removing sets it to 0, which set_monthly_income()
// treats as "not set" from this month on; closed months keep theirs. Undo puts the amount back.
export function useIncomeActions() {
  const overview = useOverview();
  const setIncome = useSetIncome();
  const toast = useToast();

  const edit = () => router.push('/settings/income');

  // Resolves true when the income was removed.
  async function remove(): Promise<boolean> {
    const o = overview.data;
    if (!o?.income) return false;
    const previous = o.income;
    const ok = await confirm(t.actions.removeIncomeTitle, t.actions.removeIncomeBody(formatMoney(previous, o.currency)), t.common.remove);
    if (!ok) return false;
    try {
      await setIncome.mutateAsync(0);
    } catch (e) {
      toast({ message: errorMessage(e) });
      return false;
    }
    toast({
      message: t.actions.incomeRemoved,
      action: { label: t.common.undo, onPress: () => setIncome.mutate(previous) },
    });
    return true;
  }

  return { edit, remove };
}
