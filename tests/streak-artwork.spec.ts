import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { seedStreak, streakData } from './streak-fixture';
import { stored } from './exercise-fixture';
import { STREAK_LEVELS } from '../src/streak';
import { STREAK_ARTWORK } from '../src/streak-artwork';
const inventory = JSON.parse(readFileSync('tests/fixtures/streak-originals.json', 'utf8')) as {
  file: string;
  width: number;
  height: number;
  sha256: string;
}[];
async function details(page: Page) {
  await page.getByRole('button', { name: /Strength Streak, \d+ consecutive weeks?/ }).click();
  await expect(page.getByRole('heading', { name: 'Strength Streak.', exact: true })).toBeVisible();
}
async function imagesLoaded(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('img.streak-icon')].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  await page.evaluate(async () => {
    await Promise.all(
      [...document.querySelectorAll<HTMLImageElement>('img.streak-icon')].map((img) =>
        img.decode(),
      ),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function noSecretPose(page: Page) {
  await expect(page.locator('img[src$="/12.PNG"]')).toHaveCount(0);
  await expect(page.locator('img[src$="/13.PNG"]')).toHaveCount(1);
  expect(await page.locator('main').innerHTML()).not.toMatch(/red winged|winged pose|\/12\.PNG/i);
}
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [393, 852],
])
  test(`approved originals load without cropping or overflow at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const d = streakData(3);
    await seedStreak(page, d);
    const home = page.locator('header .streak-indicator img');
    await expect(home).toHaveAttribute('src', '/strength-tracker/streak-achievements/02.PNG');
    await imagesLoaded(page);
    if (width === 390) await page.screenshot({ path: 'test-results/approved-streak-home.png' });
    await details(page);
    await imagesLoaded(page);
    if (width === 390) await page.screenshot({ path: 'test-results/polished-streak-main.png' });
    const collection = page.getByLabel('Achievement evolution collection', { exact: true });
    await expect(collection.locator('article')).toHaveCount(11);
    await expect(collection.locator('svg')).toHaveCount(0);
    for (const [i, l] of STREAK_LEVELS.entries()) {
      const img = collection.locator('article').nth(i).locator('img');
      await expect(img).toHaveAttribute(
        'src',
        `/strength-tracker/streak-achievements/${String(i + 1).padStart(2, '0')}.PNG`,
      );
      await expect(img).toHaveAttribute('alt', STREAK_ARTWORK[l.id].name);
      expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).toBe('contain');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const secret = page.getByLabel('Secret achievement', { exact: true });
    await expect(secret).toHaveAttribute('data-unlocked', 'false');
    await noSecretPose(page);
    if (width === 390) {
      await collection.screenshot({ path: 'test-results/approved-streak-collection.png' });
      await secret.scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'test-results/approved-streak-secret-locked.png' });
    }
    const saved = await stored(page);
    expect(saved.history).toEqual(d.history);
    expect(saved.streak.awards).toEqual(d.streak!.awards);
  });
test('all thirteen originals are served byte-for-byte at the Pages base and precached for offline use', async ({
  page,
  context,
}) => {
  await seedStreak(page, streakData(52, 1));
  await details(page);
  await imagesLoaded(page);
  for (const original of inventory) {
    const response = await page.request.get(
      `/strength-tracker/streak-achievements/${original.file}`,
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    expect(
      createHash('sha256')
        .update(await response.body())
        .digest('hex'),
    ).toBe(original.sha256);
  }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // ready resolves after installation: each numbered PNG must already be stored, including the currently hidden locked state.
  for (const original of inventory)
    expect(
      await page.evaluate(
        async (file) =>
          !!(await caches.match(`/strength-tracker/streak-achievements/${file}`, {
            ignoreSearch: true,
          })),
        original.file,
      ),
    ).toBe(true);
  await context.setOffline(true);
  for (const original of inventory) {
    const digest = await page.evaluate(async (file) => {
      const bytes = await (
        await fetch(`/strength-tracker/streak-achievements/${file}`)
      ).arrayBuffer();
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
    }, original.file);
    expect(digest).toBe(original.sha256);
  }
  await page.reload();
  await details(page);
  await imagesLoaded(page);
  const secret = page.getByLabel('Secret achievement', { exact: true });
  await expect(secret).toHaveAttribute('data-unlocked', 'true');
  await expect(secret.locator('img')).toHaveAttribute(
    'src',
    '/strength-tracker/streak-achievements/12.PNG',
  );
  await expect(page.locator('img[src$="/13.PNG"]')).toHaveCount(0);
  await secret.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/approved-streak-secret-unlocked.png' });
  await page.clock.setSystemTime(Date.parse('2026-11-30T12:00:00Z'));
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('longest-streak')).toHaveText('52 weeks');
  await expect(secret).toHaveAttribute('data-unlocked', 'true');
});
test('a forged award alone cannot reveal a secret without a verified 52-week run', async ({
  page,
}) => {
  const d = streakData(51, 1);
  d.streak!.awards.push({
    id: 'crystal',
    earnedWeek: '2026-11-02',
    unlockedAt: Date.now(),
    valid: true,
  });
  await seedStreak(page, d);
  await details(page);
  await noSecretPose(page);
  await expect(page.getByLabel('Secret achievement', { exact: true })).toHaveAttribute(
    'data-unlocked',
    'false',
  );
});
test('52nd valid saved week reveals the secret separately from crystal; failed writes and reload never reveal early or repeat celebrations', async ({
  page,
}) => {
  const d = streakData(51, 1);
  await seedStreak(page, d);
  await page.getByRole('button', { name: /^START WORKOUT/ }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Set options for Press 1', { exact: true }).click();
  for (const n of [1, 2]) {
    await page.getByLabel(`Weight Press 1 set ${n}`, { exact: true }).fill('50');
    await page.getByLabel(`Reps Press 1 set ${n}`, { exact: true }).fill('8');
    await page.getByRole('button', { name: `Complete Press 1 set ${n}`, exact: true }).click();
  }
  await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + 60000);
  await stored(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).failArtworkSave = true;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (this.name === 'state' && (window as any).failArtworkSave)
        throw new DOMException('Test save failure', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  await page.getByRole('button', { name: 'FINISH WORKOUT', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Changes are not saved');
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await page.getByRole('tab', { name: 'Strength Streak', exact: true }).click();
  await noSecretPose(page);
  await expect(page.locator('.streak-celebration')).toHaveCount(0);
  await page.evaluate(() => ((window as any).failArtworkSave = false));
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.getByTestId('longest-streak')).toHaveText('52 weeks');
  await expect(page.getByLabel('Secret achievement', { exact: true })).toHaveAttribute(
    'data-unlocked',
    'true',
  );
  await expect(page.locator('.streak-celebration img')).toHaveAttribute(
    'src',
    '/strength-tracker/streak-achievements/12.PNG',
  );
  await expect(
    page.getByLabel('Achievement evolution collection', { exact: true }).locator('article'),
  ).toHaveCount(11);
  await expect(
    page
      .getByLabel('Achievement evolution collection', { exact: true })
      .getByRole('img', { name: 'Purple crystal barbell', exact: true }),
  ).toBeVisible();
  const saved = await stored(page);
  expect(saved.history).toHaveLength(d.history.length + 1);
  expect(saved.streak.awards.filter((a: any) => a.id === 'crystal' && a.valid)).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.streak-celebration')).toHaveCount(0);
  await details(page);
  await expect(page.getByLabel('Secret achievement', { exact: true })).toHaveAttribute(
    'data-unlocked',
    'true',
  );
  // Normal history correction semantics still apply: removing support hides the reward rather than leaving a stale reveal.
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.locator('.history-streak-exclusion input').first().check();
  await stored(page);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await noSecretPose(page);
});
