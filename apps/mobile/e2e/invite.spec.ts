// Flow 5: one person invites their partner, who joins with the invite link.
import { expect, newHousehold, newPerson, signIn, test } from './support';

test('invite a partner, who joins with the link', async ({ browser, page, t, lang }) => {
  const home = await newHousehold('owner', 'E2E Shared Home', lang);
  await signIn(page, home.session);
  await page.goto('/settings/household');
  await page.getByRole('button', { name: t.household.createInvite }).click();
  const code = (await page.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/).textContent())!;

  // the partner, on their own phone, opens the link
  const partner = await newPerson('partner');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4317', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const phone = await other.newPage();
  await phone.addInitScript((l) => window.localStorage.setItem('app-language', l), lang);
  await signIn(phone, partner.session);
  await phone.goto(`/join/${code}`);

  await expect(phone.getByPlaceholder('ABCD-EFGH')).toHaveValue(code);
  await phone.getByPlaceholder(t.onboarding.firstName).fill('Noa');
  await phone.getByRole('button', { name: t.onboarding.join }).click();
  await expect(phone).toHaveURL(/\/overview$/);
  await expect(phone.getByRole('button', { name: t.add.addExpense }).first()).toBeVisible();

  // both are members of the same household now, and the owner sees the partner
  const members = await home.client.from('household_members').select('display_name').eq('household_id', home.householdId);
  expect(members.data?.map((m) => m.display_name).sort()).toEqual(['Noa', 'owner']);
  await page.reload();
  await expect(page.getByText('Noa', { exact: true })).toBeVisible();
  await other.close();
});
