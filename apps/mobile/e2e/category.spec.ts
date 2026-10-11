// Flow 4: create a category with a monthly budget; it becomes an envelope on Overview.
import { formatMoney } from '../src/lib/money';
import { expect, loose, newHousehold, signIn, test } from './support';

test('create a category with a budget', async ({ page, t, lang }) => {
  const home = await newHousehold('cat', 'E2E Home', lang);
  const name = lang === 'he' ? 'חיות מחמד' : 'Pets';
  await signIn(page, home.session);
  await page.goto('/settings/categories');

  await page.getByRole('button', { name: t.categories.addA11y }).click();
  await page.getByPlaceholder(t.categories.namePlaceholder).fill(name);
  await page.getByPlaceholder(t.overview.noBudget).fill('500');
  await page.getByRole('button', { name: t.common.save, exact: true }).click();

  // saved on the server with its budget
  await expect
    .poll(async () => {
      const c = await home.client.from('categories').select('id').eq('household_id', home.householdId).eq('name', name).maybeSingle();
      if (!c.data) return null;
      return (await home.client.from('category_budgets').select('cap_minor').eq('category_id', c.data.id).maybeSingle()).data?.cap_minor;
    })
    .toBe(50000);

  // and on Overview (its tab, as a person would go there), a full envelope
  await page.getByRole('tab', { name: t.tabs.overview }).or(page.getByRole('link', { name: t.tabs.overview })).first().click();
  await expect(page.getByRole('button', { name: loose(t.envelope.a11y(name, 'ok', formatMoney(50000, 'ILS'), formatMoney(50000, 'ILS'))) })).toBeVisible();
});
