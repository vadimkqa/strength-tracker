import { test, expect } from '@playwright/test';
test('mobile per-set references, suggestions, edits, set adjustment and reload preserve history', async ({
  page,
}) => {
  const history = {
    id: 'saved',
    name: 'Tuesday · Bench focus',
    week: 'heavy',
    started: 10,
    finished: 100,
    restEnd: null,
    restSeconds: null,
    exercises: [
      {
        id: 'old',
        name: 'Bench Press',
        rest: 180,
        sets: [
          { weight: '100', reps: '8', done: true },
          { weight: '100', reps: '7', done: true },
          { weight: '95', reps: '6', done: false },
          { weight: '90', reps: '9', done: true },
        ],
      },
    ],
  };
  await page.addInitScript((h) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem(
        'strength-tracker-v1',
        JSON.stringify({ history: [h], active: null, week: 'heavy', restDefault: 120 }),
      );
  }, history);
  await page.goto('/');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  const ex = page.locator('.exercise').first();
  await expect(ex.locator('.previous-set')).toHaveText([
    'Last: 100 kg × 8',
    'Last: 100 kg × 7',
    'No previous performance',
    'Last: 90 kg × 9',
  ]);
  await expect(page.getByLabel('Weight Bench Press set 1', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Reps Bench Press set 2', { exact: true })).toHaveValue('7');
  await expect(page.getByLabel('Reps Bench Press set 3', { exact: true })).toHaveValue('');
  await expect(ex.getByRole('button', { name: /Undo/ })).toHaveCount(0);
  await page.getByLabel('Weight Bench Press set 1', { exact: true }).fill('105');
  await expect(ex.locator('.previous-set').first()).toHaveText('Last: 100 kg × 8');
  await page.getByRole('button', { name: 'Remove set from Bench Press', exact: true }).click();
  await page.getByRole('button', { name: 'Add set to Bench Press', exact: true }).click();
  await expect(page.getByLabel('Weight Bench Press set 4', { exact: true })).toHaveValue('90');
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByLabel('Weight Bench Press set 1', { exact: true })).toHaveValue('105');
  await expect(ex.locator('.previous-set').first()).toHaveText('Last: 100 kg × 8');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await ex.screenshot({ path: 'test-results/previous-performance-mobile.png' });
  const saved = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open('strength-tracker-v2');
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction('state').objectStore('state').get('current');
          q.onsuccess = () => {
            resolve(q.result.history);
            db.close();
          };
        };
      }),
  );
  expect(saved).toEqual([history]);
});
