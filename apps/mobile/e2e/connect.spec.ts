// The Apple Pay setup wizard: each step in turn, with the iPhone's side (the Shortcut's test
// and a first purchase) played on the server, as the Shortcut would. The screen moves on by
// itself when they arrive.
import { createHash } from 'node:crypto';

import { admin, expect, loose, newHousehold, signIn, test } from './support';

test('connect Apple Pay, step by step', async ({ page, t, lang }) => {
  const home = await newHousehold('wizard', 'E2E Wizard Home', lang);
  await signIn(page, home.session);
  await page.goto('/settings/connect');

  await page.getByRole('button', { name: t.connect.start }).click();
  await expect(page.getByText(t.connect.stepOf(1, 5))).toBeVisible();

  // 1 the key: made and copied in one tap
  await page.getByRole('button', { name: t.connect.makeKey }).click();
  await expect(page.getByText(t.connect.copied)).toBeVisible();
  const key = (await home.client.rpc('household_key')).data.key as string;
  expect(key).toMatch(/^hl_hh_[0-9a-f]{48}$/);
  await page.getByRole('button', { name: t.connect.next }).click();

  // 2 installing the Shortcut
  await expect(page.getByRole('button', { name: t.connect.getShortcut })).toBeVisible();
  await page.getByRole('button', { name: t.connect.next }).click();

  // 3 the test: the Shortcut reaches the server, and the screen says so
  page.on('popup', (p) => p.close().catch(() => {}));
  await page.getByRole('button', { name: t.connect.runTest }).click();
  await expect(page.getByText(t.connect.testWaiting)).toBeVisible();
  const hash = createHash('sha256').update(key).digest('hex');
  await admin.rpc('capture_auth', { p_token_hash: hash, p_device_name: 'Noa iPhone' });
  await expect(page.getByText(t.connect.connected)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: t.connect.next }).click();

  // 4 the automation, made on the iPhone
  await expect(page.getByText(t.connect.guide[0].text)).toBeVisible();
  await page.getByRole('button', { name: t.connect.automationDone }).click();

  // 5 the first purchase comes in; whose iPhone it is, then done
  await expect(page.getByText(t.connect.firstWaiting)).toBeVisible();
  const device = (await admin.rpc('capture_auth', { p_token_hash: hash, p_device_name: 'Noa iPhone' })).data[0];
  const cat = await home.client.from('categories').select('id').eq('household_id', home.householdId).limit(1).single();
  await admin.rpc('capture_record', {
    p: {
      household_id: home.householdId, user_id: null, device_id: device.device_id, status: 'confirmed', title: 'Aroma',
      raw_merchant: 'AROMA', category_id: cat.data!.id, amount_minor: 2500, currency: 'ILS',
      occurred_at: new Date().toISOString(), idempotency_key: `e2e-${Date.now()}`,
    },
  });
  await expect(page.getByText(loose(t.connect.firstArrived('Noa iPhone')))).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'wizard', exact: true }).click();
  await expect(page.getByText(t.connect.doneTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: t.connect.partner })).toBeVisible();

  // the partner, on their phone, can copy the same key
  expect((await home.client.from('device_tokens').select('user_id').eq('id', device.device_id).single()).data?.user_id).toBe(home.session.user.id);
});
