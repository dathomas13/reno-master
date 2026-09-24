import { test, expect } from '@playwright/test';

/**
 * Smoke test without a Firebase project: the shell must boot and show the login. The 3D
 * model comes from the database, so it - like everything behind the login - is covered by
 * the emulator suite (see README, "Tests") and the unit tests of src/modules/modelBuild.
 */
test('the app boots and asks for a login', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/reno-master/');
  await expect(page.getByRole('heading', { name: 'Reno Master' })).toBeVisible();
  await expect(page.getByLabel('E-Mail')).toBeVisible();
  expect(errors).toEqual([]);
});
