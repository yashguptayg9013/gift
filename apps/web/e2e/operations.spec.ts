import { expect, test } from '@playwright/test';

/** Route protection for the manufacturing, production, workforce and quality modules (no API required). */
const ROUTES = [
  '/manufacturing',
  '/manufacturing/boms',
  '/manufacturing/setup',
  '/manufacturing/orders/abc123',
  '/production',
  '/production/tasks',
  '/workforce',
  '/workforce/attendance',
  '/workforce/productivity',
  '/workforce/workers/abc123',
  '/quality',
  '/quality/summary',
  '/quality/checklists',
  '/quality/defects',
  '/quality/inspections/abc123',
];

test.describe('operations modules require a session', () => {
  for (const route of ROUTES) {
    test(`${route} redirects to login with a return path`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    });
  }
});
