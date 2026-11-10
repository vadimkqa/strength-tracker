import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData, createWorkout } from '../src/data';
import { parseTrainingPlan, applyImportedPlan } from '../src/plan-import';
const draft = parseTrainingPlan(readFileSync('tests/fixtures/GYM.txt', 'utf8'));
draft.rows.forEach((r) => (r.reviewed = true));
const seed = applyImportedPlan(emptyData(), draft, true);
seed.carouselWorkout = 'Saturday · Chest focus';
async function state(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('strength-tracker-v2');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const r = db.transaction('state').objectStore('state').get('current');
        r.onsuccess = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
}
for (const [width, height] of [
  [320, 568],
  [375, 667],
  [390, 844],
  [393, 852],
]) {
  test(`approved header stays compact, ordered and unclipped at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (d) => localStorage.setItem('strength-tracker-v1', JSON.stringify(d)),
      seed,
    );
    await page.goto('/strength-tracker/');
    const header = page.locator('header');
    await expect(header.locator('.brand-owner')).toHaveText('VADIMKQA');
    await expect(header.locator('.brand-wordmark')).toHaveText('STRENGTHTRAINER');
    await expect(header.locator('.edition')).toContainText('2.0');
    await expect(
      page.getByRole('img', { name: 'Strength Trainer sT dumbbell logo', exact: true }),
    ).toBeVisible();
    const rects = await header
      .locator('.brand-mark,.brand-owner,.brand-divider,.brand-wordmark,.edition')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, right: r.right, y: r.y, bottom: r.bottom };
        }),
      );
    for (let i = 1; i < rects.length; i++)
      expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].right);
    expect(rects[0].x).toBeGreaterThanOrEqual(0);
    expect(rects.at(-1)!.right).toBeLessThanOrEqual(width);
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(
      (await page.locator('.streak-indicator').count()) ? 80 : 48,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const colors = await header
      .locator('.brand-wordmark b')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    expect(colors[0]).toBe('rgb(152, 86, 221)');
    await header.screenshot({ path: `test-results/branding-header-${width}.png` });
    await page.screenshot({ path: `test-results/branding-home-${width}.png`, fullPage: true });
    for (const tab of ['Progress', 'PRs', 'Settings', 'Train']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(header.locator('.brand-owner')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}
test('versioned PWA/Apple/favicon assets have the right dimensions and remain cached offline', async ({
  page,
  context,
}) => {
  await page.goto('/strength-tracker/');
  const manifest = await (await page.request.get('/strength-tracker/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({
    name: 'Strength Trainer 2.0',
    id: '/strength-tracker/',
    scope: '/strength-tracker/',
    start_url: '/strength-tracker/',
  });
  expect(manifest.icons).toContainEqual({
    src: 'icon-st-v2-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  });
  for (const [name, size] of [
    ['icon-st-v2-192.png', 192],
    ['icon-st-v2-512.png', 512],
    ['icon-st-v2-maskable-512.png', 512],
    ['apple-touch-icon-st-v2.png', 180],
    ['favicon-st-v2-32.png', 32],
    ['favicon-st-v2-16.png', 16],
  ] as const) {
    const r = await page.request.get(`/strength-tracker/${name}`);
    expect(r.ok()).toBe(true);
    const bytes = await r.body();
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute(
    'href',
    '/strength-tracker/apple-touch-icon-st-v2.png',
  );
  await expect(page.locator('link[rel=icon][sizes="32x32"]')).toHaveAttribute(
    'href',
    '/strength-tracker/favicon-st-v2-32.png',
  );
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('img', { name: 'Strength Trainer sT dumbbell logo', exact: true }),
  ).toBeVisible();
  expect(
    await page.locator('.brand-mark').evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBe(192);
  for (const icon of manifest.icons)
    expect(
      await page.evaluate(async (url) => (await fetch(url)).ok, `/strength-tracker/${icon.src}`),
    ).toBe(true);
});
test('branding reload and offline reopening preserve imported plan, history, PRs and active session', async ({
  page,
  context,
}) => {
  const d = structuredClone(seed);
  const history = createWorkout(d.rotation!.sessions[0].key, 'heavy', d.plan);
  history.finished = Date.now();
  history.exercises[0].sets[0] = { weight: '100', reps: '8', done: true };
  d.history = [history];
  d.active = createWorkout(d.rotation!.sessions[0].key, 'heavy', d.plan, Date.now(), d.history);
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, d);
  await page.goto('/strength-tracker/');
  await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
  const before = await state(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
  const after = await state(page);
  expect(after.history).toEqual(before.history);
  expect(after.active).toEqual(before.active);
  expect(after.plan).toEqual(before.plan);
  expect(after.trainingProgram).toEqual(before.trainingProgram);
  expect(after.rotation).toEqual(before.rotation);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record').first()).toContainText('100');
});
