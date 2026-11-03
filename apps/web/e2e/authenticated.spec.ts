import { expect, test } from '@playwright/test';

/**
 * Authenticated flows against a running API. Enabled only when E2E_EMAIL and
 * E2E_PASSWORD are provided (never commit credentials).
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('authenticated flows', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run against a live API');

  test('sign in, view overview and inventory, sign out', async ({ page }) => {
    await page.goto('/login?next=%2Finventory');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByRole('heading', { name: 'Stock' })).toBeVisible();

    await page.getByRole('link', { name: 'Overview' }).first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('wrong password shows an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(`${password}-wrong`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText(/incorrect|locked/i);
  });
});
