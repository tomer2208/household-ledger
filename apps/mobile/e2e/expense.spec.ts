// Flow 2: add an expense; it lands in its envelope and in the expenses list.
import { formatMoney } from '../src/lib/money';
import { budgetedCategory, expect, loose, newHousehold, signIn, test } from './support';

test('add an expense to an envelope', async ({ page, t, lang }) => {
  const home = await newHousehold('add', 'E2E Home', lang);
  const cat = await budgetedCategory(home, 100000);
  await signIn(page, home.session);
  await page.goto('/overview');

  await page.getByRole('button', { name: t.add.addExpense }).first().click();
  await expect(page.getByRole('heading', { name: t.add.addExpense })).toBeVisible();
  await page.keyboard.type('120');
  await expect(page.getByRole('button', { name: loose(t.add.saveIn(cat.name)) })).toBeVisible();
  // tapping the envelope files the expense there
  await page.getByRole('radio', { name: loose(t.add.envelopeA11y(cat.name, formatMoney(100000, 'ILS'))) }).click();

  // the toast says where it went, and the envelope has ₪880 left
  await expect(page.getByText(loose(t.add.saved(formatMoney(12000, 'ILS'), cat.name)))).toBeVisible();
  await expect(page.getByRole('button', { name: loose(t.envelope.a11y(cat.name, 'ok', formatMoney(88000, 'ILS'), formatMoney(100000, 'ILS'))) })).toBeVisible();
  await page.goto('/transactions');
  await expect(page.getByText(cat.name).first()).toBeVisible();
  await expect(page.getByText(loose(formatMoney(12000, 'ILS'))).first()).toBeVisible();
});
