import { expect, test } from '@playwright/test';

test.describe('public pages and route protection (no API required)', () => {
  test('login page renders an accessible form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    await expect(page).toHaveTitle(/PUJA OS/);
  });

  test('client-side validation blocks empty submissions', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
    await expect(page.getByText('Enter your password')).toBeVisible();
  });

  test('unauthenticated users are redirected to login with a return path', async ({ page }) => {
    await page.goto('/inventory/materials');
    await expect(page).toHaveURL(/\/login\?next=%2Finventory%2Fmaterials/);
  });

  test('root redirects to login without a session', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('forgot password page links back to sign in', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('reset password without token shows guidance', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toBeVisible();
  });

  test('design system renders all component groups', async ({ page }) => {
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { name: 'Design system' })).toBeVisible();
    for (const section of ['Colour tokens', 'Buttons', 'Inputs', 'Data table', 'States']) {
      await expect(page.getByRole('heading', { name: section })).toBeVisible();
    }
    // no horizontal page scroll
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
