import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = readFileSync('tests/fixtures/GYM.txt', 'utf8');
async function saved(page: Page) {
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
async function loadPlan(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .locator('#plan-file')
    .setInputFiles({ name: 'GYM.txt', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
  await expect(page.locator('.import-stats')).toContainText('2 weeks · 8 sessions · 58 exercises');
}
async function acknowledge(page: Page) {
  await page.getByLabel('WEEK', { exact: true }).selectOption('1');
  await page.getByLabel('WORKOUT', { exact: true }).selectOption('Tuesday · Bench focus');
  await page.locator('.review-exercise > summary').nth(2).click();
  await page
    .getByLabel('I reviewed these source warnings; keep unedited values exactly as written')
    .check();
  await page.getByLabel('WEEK', { exact: true }).selectOption('2');
  await page.getByLabel('WORKOUT', { exact: true }).selectOption('Thursday · Back focus');
  await page.locator('.review-exercise > summary').nth(1).click();
  await page
    .getByLabel('I reviewed these source warnings; keep unedited values exactly as written')
    .check();
}
test('real GYM preview is compact, structured and accurate; warnings and original values remain visible', async ({
  page,
}) => {
  await loadPlan(page);
  const before = await saved(page);
  await expect(page.locator('.review-exercise')).toHaveCount(7);
  await expect(page.locator('.exercise-editor input:visible')).toHaveCount(0);
  await expect(page.locator('.compact-prescription').first()).toContainText(
    '1: 6 no fail · 2: 4 no fail · 3: 3–6 fail · 4: 3–6 fail',
  );
  await expect(page.locator('.compact-warning')).toContainText('half fail fail');
  await page.locator('.plan-importer').screenshot({ path: 'test-results/gym-week1-review.png' });
  await page.getByLabel('WEEK', { exact: true }).selectOption('2');
  await page.getByLabel('WORKOUT', { exact: true }).selectOption('Thursday · Back focus');
  await expect(page.locator('.review-exercise')).toHaveCount(7);
  await expect(page.locator('.compact-warning')).toContainText('Missing set number(s): 2');
  await page.locator('.review-exercise > summary').nth(1).click();
  await expect(
    page.locator('.review-exercise').nth(1).locator('.set-prescription-list b'),
  ).toHaveText(['Set 1', 'Set 3', 'Set 4']);
  await page.locator('.plan-importer').screenshot({ path: 'test-results/gym-week2-warning.png' });
  await expect(
    page.getByRole('button', { name: 'Apply imported plan', exact: true }),
  ).toBeDisabled();
  expect(await saved(page)).toEqual(before);
  await page.getByLabel('WORKOUT', { exact: true }).selectOption('Sunday · Legs');
  await expect(page.locator('.review-exercise')).toHaveCount(8);
  await expect(
    page.locator('.review-exercise-title span').filter({ hasText: 'Optional' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  expect(await saved(page)).toEqual(before);
});
test('confirmed rotation keeps history and an active session; all eight sessions use exact prescriptions and Friday legs', async ({
  page,
}) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await page.getByRole('spinbutton', { name: 'Weight Bench Press set 1', exact: true }).fill('100');
  await page.getByRole('spinbutton', { name: 'Reps Bench Press set 1', exact: true }).fill('5');
  await page.getByLabel('Set options for Bench Press',{exact:true}).click();
  await page.getByRole('button', { name: 'Complete Bench Press set 1', exact: true }).click();
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await loadPlan(page);
  const before = await saved(page);
  await acknowledge(page);
  await page
    .getByLabel('I confirm applying these templates, preserving all unspecified values as unset')
    .check();
  await page.getByRole('button', { name: 'Apply imported plan', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan applied.' })).toBeVisible();
  const after = await saved(page);
  expect(after.history).toEqual(before.history);
  expect(after.active).toEqual(before.active);
  expect(after.rotation.sessions).toHaveLength(8);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record')).toContainText('100');
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'Discard workout', exact: true }).click();
  const expected = [
    ['Bench Day', 'Tuesday', 'hard'],
    ['DB Press Day', 'Thursday', 'easy'],
    ['Leg Day', 'Friday', 'easy'],
    ['Hammer Press Day', 'Saturday', 'hard'],
    ['Bench Day', 'Tuesday', 'easy'],
    ['DB Press Day', 'Thursday', 'hard'],
    ['Leg Day', 'Friday', 'hard'],
    ['Hammer Press Day', 'Saturday', 'easy'],
  ];
  for (let i = 0; i < expected.length; i++) {
    const [card, day, intensity] = expected[i],
      week = i < 4 ? 1 : 2;
    await page.getByLabel('TRAINING ROTATION', { exact: true }).selectOption(String(week));
    await page.getByRole('button', { name: `Select ${card}`, exact: true }).click();
    await expect(page.getByRole('article', { name: card, exact: true })).toHaveClass(/selected/);
    await expect(page.locator('.rotation-selection p')).toHaveText(
      `${day} · ${intensity === 'hard' ? 'Hard' : 'Easy'} session`,
    );
    await page.getByRole('button', { name: 'START WORKOUT' }).click();
    const current = (await saved(page)).active;
    expect(current.name).toContain(`Week ${week} · ${day}`);
    expect(current.exercises[0].rest).toBeNull();
    expect(current.exercises[0].sets[0].prescription.number).toBe(1);
    await page.getByRole('button', { name: 'Discard workout', exact: true }).click();
  }
  await page.reload();
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveValue('2');
});
test('manual prescription corrections update warnings without renumbering untouched source entries', async ({
  page,
}) => {
  await loadPlan(page);
  await page.getByLabel('WEEK', { exact: true }).selectOption('2');
  await page.getByLabel('WORKOUT', { exact: true }).selectOption('Thursday · Back focus');
  await page.locator('.review-exercise > summary').nth(1).click();
  await page.locator('.exercise-editor > summary').nth(1).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Set entry 2 number', exact: true }),
  ).toHaveValue('3');
  await page.getByRole('spinbutton', { name: 'Set entry 2 number', exact: true }).fill('2');
  await expect(page.locator('.compact-warning')).toContainText('Missing set number(s): 3');
  await page.getByRole('spinbutton', { name: 'Set entry 2 number', exact: true }).fill('3');
  await expect(page.locator('.compact-warning')).toContainText('Missing set number(s): 2');
});
