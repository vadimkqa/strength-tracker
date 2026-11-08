import { test, expect } from '@playwright/test';
const base = '/strength-tracker/';
test('Pages base path serves all assets and scopes the installed offline PWA correctly', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).pathname.startsWith(base)) failed.push(r.url());
  });
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible();
  const manifestURL = await page
    .locator('link[rel=manifest]')
    .evaluate((e) => (e as HTMLLinkElement).href);
  expect(new URL(manifestURL).pathname).toBe(base + 'manifest.webmanifest');
  const manifest = await (await page.request.get(manifestURL)).json();
  expect(manifest).toMatchObject({ id: base, start_url: base, scope: base, display: 'standalone' });
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, manifestURL);
    expect(url.pathname.startsWith(base)).toBe(true);
    const response = await page.request.get(url.href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const apple = await page
    .locator('link[rel=apple-touch-icon]')
    .evaluate((e) => (e as HTMLLinkElement).href);
  expect(new URL(apple).pathname.startsWith(base)).toBe(true);
  expect((await page.request.get(apple)).ok()).toBe(true);
  const registration = await page.evaluate(() =>
    navigator.serviceWorker.ready.then((r) => ({ scope: r.scope, script: r.active?.scriptURL })),
  );
  expect(new URL(registration.scope).pathname).toBe(base);
  expect(new URL(registration.script!).pathname).toBe(base + 'sw.js');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible();
  for (const tab of ['Progress', 'PRs', 'Settings', 'Train']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByRole('button', { name: tab, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(new URL(page.url()).pathname).toBe(base);
  }
  for (const photo of ['bench', 'pullups', 'hammer', 'legs'])
    expect(
      await page.evaluate(async (url) => (await fetch(url)).ok, base + `photos/${photo}.jpg`),
    ).toBe(true);
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.getByRole('heading', { name: 'Bench Press', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});
test('Pages path preserves legacy workout history during migration and reload', async ({
  page,
}) => {
  const legacy = {
    history: [
      {
        id: 'pages-history',
        name: 'Tuesday · Bench focus',
        week: 'heavy',
        started: 100,
        finished: 200,
        restEnd: null,
        restSeconds: null,
        exercises: [
          {
            id: 'bench',
            name: 'Bench Press',
            rest: 180,
            sets: [{ weight: '100', reps: '8', done: true }],
          },
        ],
      },
    ],
    active: null,
    week: 'heavy',
    restDefault: 120,
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(data));
  }, legacy);
  await page.goto(base);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByText('View sets', { exact: true }).click();
  await expect(page.getByText('100 kg × 8', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record')).toContainText('100');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('strength-tracker-v1')!)),
  ).toEqual(legacy);
});
