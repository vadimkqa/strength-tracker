import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const browserName = process.env.REGRESSION_BROWSER === 'webkit' ? 'webkit' : 'chromium';
export default defineConfig({
  ...base,
  testMatch:
    browserName === 'webkit'
      ? [
          '**/mobile-reliability.spec.ts',
          '**/universal-import.spec.ts',
          '**/progression.spec.ts',
          '**/set-input-navigation.spec.ts',
          '**/carousel-completion.spec.ts',
          '**/records.spec.ts',
          '**/streak-freeze.spec.ts',
          '**/decimal-weights.spec.ts',
          '**/iphone-accessory.spec.ts',
        ]
      : undefined,
  use: { ...base.use, browserName, launchOptions: {} },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
});
