import { test, expect } from '@playwright/test';
import { seedStreak, streakData } from './streak-fixture';

for (const [width, height] of [
  [390, 844],
  [375, 667],
]) {
  test(`graphite palette and original artwork at iPhone ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seedStreak(page, streakData(3));
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 17, 20)');
    await expect(page.locator('nav')).toHaveCSS('background-color', 'rgb(16, 17, 20)');
    await expect(page.locator('.primary').first()).toHaveCSS(
      'background-color',
      'rgb(166, 149, 194)',
    );
    await expect(page.locator('.primary').first()).toHaveCSS('color', 'rgb(16, 17, 20)');
    await expect(page.locator('.stack-front')).toHaveCSS('box-shadow', 'none');
    const manifest = await (
      await page.request.get('/strength-tracker/manifest.webmanifest')
    ).json();
    expect(manifest).toMatchObject({ theme_color: '#101114', background_color: '#101114' });
    for (const [name, action] of [
      ['home', async () => {}],
      [
        'streak',
        async () => {
          await page.locator('.streak-indicator').click();
        },
      ],
      [
        'progress',
        async () => {
          await page.getByRole('button', { name: 'Progress', exact: true }).click();
        },
      ],
      [
        'settings',
        async () => {
          await page.getByRole('button', { name: 'Settings', exact: true }).click();
        },
      ],
      [
        'workout',
        async () => {
          await page.getByRole('button', { name: 'Train', exact: true }).click();
          await page.getByRole('button', { name: /START WORKOUT/ }).click();
        },
      ],
    ] as const) {
      await action();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `docs/screenshots/graphite-lavender/${name}-${width}.png`,
        animations: 'disabled',
      });
    }
  });
}
