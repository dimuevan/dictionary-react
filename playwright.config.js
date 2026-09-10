import { defineConfig, devices } from '@playwright/test';

/**
 * The browser checks that kept catching what unit tests could not — a search bar
 * that reflowed into two lines, a dropdown with the wrong semantics. Run against
 * the production build, so what is tested is what ships.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // The normal build hardcodes the deploy subdirectory into every asset path,
    // so serving it at the root gives a blank page. VITE_BASE=/ builds the same
    // code to be served from the root instead.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    // VITE_BASE has to reach both halves of that command, which an inline
    // assignment before the first one would not do.
    env: { VITE_BASE: '/' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
