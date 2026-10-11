// Flow 3: delete an expense from its screen, then bring it back with Undo.
import { formatMoney } from '../src/lib/money';
import { budgetedCategory, expect, loose, newHousehold, signIn, test } from './support';

test('delete an expense, then undo it', async ({ page, t, lang }) => {
  const home = await newHousehold('undo', 'E2E Home', lang);
  const cat = await budgetedCategory(home, 100000);
  const made = await home.client
    .from('transactions')
    .insert({ household_id: home.householdId, created_by: home.session.user.id, source: 'manual', title: 'Pizza E2E', category_id: cat.id, amount_minor: 7500, currency: 'ILS' })
    .select('id')
    .single();
  if (made.error) throw made.error;
  const deletedAt = async () =>
    (await home.client.from('transactions').select('deleted_at').eq('id', made.data.id).single()).data?.deleted_at;

  // the list row, not the toast that names it
  const row = page.getByText(/^[\u2068]*Pizza E2E[\u2069]*$/);

  await signIn(page, home.session);
  await page.goto('/transactions');
  await row.click();
  await page.getByRole('button', { name: t.detail.deleteExpense }).click();

  // gone from the list at once, and deleted on the server; the toast offers Undo
  await expect(row).toHaveCount(0);
  await expect(page.getByText(loose(t.actions.deleted(`Pizza E2E · ${formatMoney(7500, 'ILS')}`)))).toBeVisible();
  await expect.poll(deletedAt).not.toBeNull();

  await page.getByRole('button', { name: t.common.undo }).click();
  await expect(row).toBeVisible();
  await expect.poll(deletedAt).toBeNull();
});
