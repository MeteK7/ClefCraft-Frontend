import { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

const storedTheme = (page: Page) => page.evaluate(() => localStorage.getItem('theme'));

test('the theme toggle switches between light and dark and survives a reload', async ({ ownerPage: page }) => {
  // No saved theme yet, so the app follows prefers-color-scheme, which the config sets to light.
  await page.goto('/calendar');
  await expect(page.locator('.user-info')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/\bdark-theme\b/);

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('body')).toHaveClass(/\bdark-theme\b/);
  expect(await storedTheme(page)).toBe('dark');

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/\bdark-theme\b/);
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('body')).not.toHaveClass(/\bdark-theme\b/);
  expect(await storedTheme(page)).toBe('light');
});
