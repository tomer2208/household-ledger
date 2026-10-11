// Flow 1: a new person signs in with the emailed code and sets up a household.
import { expect, signInCode, test, uniqueEmail } from './support';

test('sign in with an emailed code, then create a household', async ({ page, t }) => {
  const email = uniqueEmail('signin');
  await page.goto('/');

  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByRole('button', { name: t.signIn.sendCode }).click();
  await expect(page.getByText(t.signIn.sentTo(email))).toBeVisible();

  await page.getByPlaceholder(t.signIn.codePlaceholder).fill(await signInCode(email));
  await page.getByRole('button', { name: t.signIn.signIn, exact: true }).click();

  // a person without a household lands on the setup of one
  await expect(page.getByText(t.onboarding.title)).toBeVisible();
  await page.getByPlaceholder(t.onboarding.firstName).fill('Dana');
  await page.getByRole('button', { name: t.onboarding.create }).click();

  // first-run setup: income, the suggested budgets, then Overview
  await expect(page.getByText(t.setup.incomeTitle)).toBeVisible();
  await page.getByLabel(t.settings.income).fill('10000');
  await page.getByRole('button', { name: t.setup.next }).click();
  await expect(page.getByText(t.setup.budgetsTitle)).toBeVisible();
  // "Save 14 Budgets": however many default categories got a suggestion
  const saveN = new RegExp(`^${t.setup.saveBudgets(999).replace('999', '\\d+')}$`);
  await page.getByRole('button', { name: saveN }).click();
  await expect(page.getByText(t.setup.almost)).toBeVisible();
  await page.getByRole('button', { name: t.setup.go }).click();

  await expect(page.getByText(t.overview.leftThisMonth)).toBeVisible();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('button', { name: t.budgets.open })).toBeVisible();
});
