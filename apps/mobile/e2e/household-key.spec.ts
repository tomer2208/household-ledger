// Apple Pay: one key for the household's FinPace Shortcut. A new iPhone's first purchase shows
// up on Devices, someone says whose it is, and the purchase becomes that person's.
import { createHash } from 'node:crypto';

import { admin, expect, loose, newHousehold, signIn, test } from './support';

test('create the household key, then say whose a new iPhone is', async ({ page, t, lang }) => {
  const home = await newHousehold('keyowner', 'E2E Key Home', lang);
  await signIn(page, home.session);
  await page.goto('/settings/devices');

  await page.getByRole('button', { name: t.devices.createKey }).click();
  const key = (await page.getByText(/^hl_hh_[0-9a-f]{48}$/).textContent())!;

  // the Shortcut on another iPhone logs a purchase with the key and the phone's name
  const hash = createHash('sha256').update(key).digest('hex');
  const auth = await admin.rpc('capture_auth', { p_token_hash: hash, p_device_name: 'Noa iPhone' });
  if (auth.error) throw auth.error;
  const device = auth.data[0];
  expect(device.user_id).toBeNull();
  const cat = await home.client.from('categories').select('id').eq('household_id', home.householdId).limit(1).single();
  const rec = await admin.rpc('capture_record', {
    p: {
      household_id: home.householdId, user_id: null, device_id: device.device_id, status: 'confirmed', title: 'Aroma',
      raw_merchant: 'AROMA', category_id: cat.data!.id, amount_minor: 2500, currency: 'ILS',
      occurred_at: new Date().toISOString(), idempotency_key: `e2e-${Date.now()}`,
    },
  });
  if (rec.error) throw rec.error;

  // Devices asks whose it is; choosing gives it, and its purchase, to that person
  await page.reload();
  await expect(page.getByText(loose(t.devices.whose('Noa iPhone')))).toBeVisible();
  await page.getByRole('button', { name: 'keyowner', exact: true }).click();
  await expect(page.getByText(loose(t.devices.whose('Noa iPhone')))).toHaveCount(0);
  await expect
    .poll(async () => (await admin.from('transactions').select('created_by').eq('id', rec.data.transaction_id).single()).data?.created_by)
    .toBe(home.session.user.id);

  // the key is shown once; afterwards the screen offers to replace it
  await expect(page.getByText(/^hl_hh_/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.devices.replaceKey })).toBeVisible();
});
