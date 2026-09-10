import { expect, test } from '@playwright/test';

/**
 * The app-shell worker was written for Create React App, which emits its build
 * into /static/. Vite emits /assets/, so for as long as the worker has existed
 * it has cached nothing at all — and nothing failed, because no check had ever
 * pulled the plug and asked for the page. These do.
 *
 * They run against the production build the other suite already serves: a
 * worker is not registered in development, deliberately.
 */

const cachedPaths = (page) =>
  page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(
      names.map(async (name) => {
        const requests = await (await caches.open(name)).keys();
        return requests.map((request) => new URL(request.url).pathname);
      })
    );
    return entries.flat();
  });

/** The worker only sees requests made once it is in control of the page. */
const takeControl = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.reload();
  await expect(page.locator('.search-input')).toBeVisible();
};

test('caches the build assets it is asked to cache', async ({ page }) => {
  await takeControl(page);

  const paths = await cachedPaths(page);
  expect(paths.some((path) => path.includes('/assets/') && path.endsWith('.js'))).toBe(true);
  expect(paths.some((path) => path.includes('/assets/') && path.endsWith('.css'))).toBe(true);
});

test('opens with the network unplugged', async ({ page, context }) => {
  await takeControl(page);

  await context.setOffline(true);
  await page.reload();

  // The whole app, not just an HTML shell: the search box only exists once the
  // cached bundle has run.
  await expect(page.locator('.search-input')).toBeVisible();
  await expect(page.getByText('Enter a word to get started')).toBeVisible();
  await expect(page.locator('.daily-word')).toBeVisible();
});
