import { test, expect } from '@playwright/test';
import { streakData, seedStreak } from './streak-fixture';
import { stored } from './exercise-fixture';
for (const [width, height] of [
  [320, 568],
  [375, 667],
  [390, 844],
  [393, 852],
  [430, 932],
])
  test(`streak header remains readable and opens separate details at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await seedStreak(page, streakData());
    const badge = page.getByRole('button', {
      name: 'Strength Streak, 3 consecutive weeks',
      exact: true,
    });
    await expect(badge).toBeVisible();
    const brand = page.locator('header .brand'),
      b = (await brand.boundingBox())!,
      r = (await badge.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(r.x);
    expect(r.x + r.width).toBeLessThanOrEqual(width);
    expect(r.height).toBeGreaterThanOrEqual(44);
    await expect(brand.locator('.brand-owner')).toHaveText('VADIMKQA');
    await expect(page.locator('header .edition')).toContainText('2.0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390) await page.screenshot({ path: 'test-results/streak-home.png' });
    await badge.click();
    await expect(page.getByRole('tab', { name: 'Strength Streak', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Current streak', { exact: true })).toHaveText('3 weeks');
    await expect(page.getByTestId('weekly-progress')).toHaveText('2 / 3');
    await expect(page.getByTestId('longest-streak')).toHaveText('3 weeks');
    if (width === 390) await page.screenshot({ path: 'test-results/streak-details.png' });
    await page.getByRole('tab', { name: 'Weight PRs', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Personal records.', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Press 1', exact: true })).toBeVisible();
    await expect(page.locator('.achievement-collection')).toHaveCount(0);
  });
test('never awards failed or pending saves; successful retry unlocks once and reload preserves records', async ({
  page,
}) => {
  const seed = streakData();
  await seedStreak(page, seed);
  await page.getByRole('button', { name: 'Select Workout C', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  page.on('dialog', (d) => d.accept());
  await page.getByLabel('Set options for Press 3', { exact: true }).click();
  for (const n of [1, 2]) {
    await page.getByLabel(`Weight Press 3 set ${n}`, { exact: true }).fill('55');
    await page.getByLabel(`Reps Press 3 set ${n}`, { exact: true }).fill('8');
    await page.getByRole('button', { name: `Complete Press 3 set ${n}`, exact: true }).click();
  }
  await stored(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).blockStreakSave = true;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (this.name === 'state' && (window as any).blockStreakSave)
        throw new DOMException('Test write failure', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  await page.getByRole('button', { name: 'FINISH WORKOUT', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Changes are not saved');
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await page.getByRole('tab', { name: 'Strength Streak', exact: true }).click();
  await expect(page.getByLabel('Current streak', { exact: true })).toHaveText('3 weeks');
  await expect(page.locator('.streak-celebration')).toHaveCount(0);
  await page.evaluate(() => ((window as any).blockStreakSave = false));
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.getByLabel('Current streak', { exact: true })).toHaveText('4 weeks');
  await expect(page.locator('.streak-celebration')).toContainText(
    'Dumbbell with 2 plates per side',
  );
  const saved = await stored(page);
  expect(saved.history).toHaveLength(seed.history.length + 1);
  expect(saved.streak.awards.filter((a: any) => a.id === 'growing' && a.valid)).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Strength Streak, 4 consecutive weeks', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.streak-celebration')).toHaveCount(0);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  const first = page
    .locator('.card')
    .filter({ has: page.getByRole('button', { name: 'Delete session', exact: true }) })
    .first();
  await first
    .getByRole('checkbox', { name: 'Exclude from Strength Streak (test or practice)', exact: true })
    .check();
  await stored(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Strength Streak, 3 consecutive weeks', exact: true }),
  ).toBeVisible();
});
test('unscheduled targets and timezone validation persist without changing the imported program or home selection', async ({
  page,
}) => {
  const d = streakData(0, 1, false);
  await seedStreak(page, d);
  await page
    .getByRole('button', { name: 'Strength Streak, 0 consecutive weeks', exact: true })
    .click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('0 / Target needed');
  await page.getByText('Streak settings and rotation', { exact: true }).click();
  await page.getByLabel('CALENDAR TIMEZONE', { exact: true }).fill('invalid/zone');
  await page.getByLabel('WEEKLY WORKOUT TARGET', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save streak settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('valid IANA timezone');
  await page.getByLabel('CALENDAR TIMEZONE', { exact: true }).fill('Europe/Vienna');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Save streak settings', exact: true }).click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('0 / 3');
  const after = await stored(page);
  expect(after.streak.timeZone).toBe('Europe/Vienna');
  expect(after.trainingProgram).toEqual(d.trainingProgram);
  expect(after.carouselWorkout).toEqual(d.carouselWorkout);
  await page.reload();
  await page
    .getByRole('button', { name: 'Strength Streak, 0 consecutive weeks', exact: true })
    .click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('0 / 3');
});
test('Crystal collection uses original PNG art, remains earned through missed weeks and works offline', async ({
  page,
  context,
}) => {
  const d = streakData(52, 1);
  await seedStreak(page, d);
  await page
    .getByRole('button', { name: 'Strength Streak, 52 consecutive weeks', exact: true })
    .click();
  const collection = page.getByLabel('Achievement evolution collection', { exact: true });
  await expect(collection.locator('article.unlocked')).toHaveCount(11);
  await expect(collection.locator('article img')).toHaveCount(11);
  for (const material of [
    'Silver metallic barbell',
    'Golden barbell',
    'Diamond barbell',
    'Purple crystal barbell',
  ])
    await expect(collection.getByRole('img', { name: material, exact: true })).toHaveCount(1);
  await collection.scrollIntoViewIfNeeded();
  await collection.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'test-results/streak-collection.png' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Strength Streak, 52 consecutive weeks', exact: true }),
  ).toBeVisible();
  await page.clock.setSystemTime(Date.parse('2026-11-23T12:00:00Z'));
  await page.waitForTimeout(1200);
  await expect(
    page.getByRole('button', { name: 'Strength Streak, 0 consecutive weeks', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Strength Streak, 0 consecutive weeks', exact: true })
    .click();
  await expect(
    page
      .getByLabel('Achievement evolution collection', { exact: true })
      .locator('article.unlocked'),
  ).toHaveCount(11);
  await expect(page.getByTestId('longest-streak')).toHaveText('52 weeks');
});

test('a practice/test flag survives interruption and prevents rewards before the workout is saved', async ({
  page,
}) => {
  await seedStreak(page, streakData(1, 1));
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await page.getByText('Streak eligibility', { exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'Practice/test workout (exclude from Strength Streak)',
      exact: true,
    })
    .check();
  await page.getByLabel('Set options for Press 1', { exact: true }).click();
  for (const n of [1, 2]) {
    await page.getByLabel(`Weight Press 1 set ${n}`, { exact: true }).fill('40');
    await page.getByLabel(`Reps Press 1 set ${n}`, { exact: true }).fill('8');
    await page.getByRole('button', { name: `Complete Press 1 set ${n}`, exact: true }).click();
  }
  await stored(page);
  await page.reload();
  await page.getByText('Streak eligibility', { exact: true }).click();
  await expect(
    page.getByRole('checkbox', {
      name: 'Practice/test workout (exclude from Strength Streak)',
      exact: true,
    }),
  ).toBeChecked();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'FINISH WORKOUT', exact: true }).click();
  await stored(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Strength Streak, 1 consecutive week', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.streak-celebration')).toHaveCount(0);
});
