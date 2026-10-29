import { defineConfig, devices } from '@playwright/test';

// Browser tests run against a LOCAL Supabase only (supabase start), never the shared dev project.
// These are the fixed, public defaults of the Supabase local stack.
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabaseKey = process.env.E2E_SUPABASE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(supabaseUrl)) {
  throw new Error(`E2E tests only run against a local Supabase, got ${supabaseUrl}`);
}

const port = 5199;

export default defineConfig({
  testDir: './e2e',
  workers: 1, // the specs share one database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'he-IL',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // The app is used mainly on phones, so test on a phone-sized browser.
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    // Process env wins over .env.local, so the real dev project can never be reached from a test run.
    env: { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey, VITE_APP_URL: `http://127.0.0.1:${port}` },
  },
});
