import { expect, test } from '@playwright/test';

/**
 * The theme is a class on <body> that React could only add after the first
 * paint, so a dark-mode reader got a white flash on every load. The inline
 * script in index.html now does it first — and the way to prove it is the first
 * one and not React is to stop React from ever loading.
 */
test('paints the chosen theme before the app has loaded', async ({ page }) => {
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.addInitScript(() => {
    window.localStorage.setItem('dictionearch-theme', 'dark');
    window.localStorage.setItem('dictionearch-font', 'mono');
  });

  await page.goto('/');

  await expect(page.locator('body')).toHaveClass('dark font-mono');
  // Nothing rendered, so the class cannot have come from the app.
  await expect(page.locator('.search-input')).toHaveCount(0);
});

test('falls back to the system preference with nothing stored', async ({ page }) => {
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.goto('/');

  await expect(page.locator('body')).toHaveClass('dark font-serif');
});
