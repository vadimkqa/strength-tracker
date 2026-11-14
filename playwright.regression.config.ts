import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const browserName = process.env.REGRESSION_BROWSER === 'webkit' ? 'webkit' : 'chromium';
export default defineConfig({
  ...base,
  testMatch: browserName === 'webkit' ? ['**/mobile-reliability.spec.ts'] : undefined,
  use: { ...base.use, browserName, launchOptions: {} },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
});
