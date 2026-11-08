import { test, expect } from '@playwright/test';
const source = `Bench Day — Hard
1. Custom Bench — 5x5 — rest 3 min — RIR 2
2. Cable Fly — 3x12 — rest 90s
Bench Day — Easy
Light Bench — 2x12 — rest 60s
DB Press Day — Easy
Pull-ups — 3x8 — rest 90s`;
const seed = {
  history: [
    {
      id: 'history',
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
          sets: [{ weight: '100', reps: '5', done: true }],
        },
      ],
    },
  ],
  active: {
    id: 'active',
    name: 'Sunday · Legs',
    week: 'easy',
    started: 300,
    restEnd: null,
    restSeconds: null,
    exercises: [
      { id: 'squat', name: 'Squat', rest: 180, sets: [{ weight: '60', reps: '8', done: false }] },
    ],
  },
  week: 'heavy',
  restDefault: 120,
};
async function state(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('strength-tracker-v2');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<Record<string, any>>((resolve, reject) => {
        const r = db.transaction('state').objectStore('state').get('current');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}
test('TXT preview is non-destructive; confirmed import preserves history, PRs and active workout', async ({
  page,
}) => {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const before = await state(page);
  await page
    .locator('#plan-file')
    .setInputFiles({ name: 'program.txt', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
  await expect(page.locator('.review-exercise-title strong').first()).toHaveText('1. Custom Bench');
  await expect(page.locator('.review-exercise-title strong').nth(1)).toHaveText('2. Cable Fly');
  await expect(
    page.getByRole('button', { name: 'Apply imported plan', exact: true }),
  ).toBeDisabled();
  expect(await state(page)).toEqual(before);
  await page
    .getByLabel('I confirm applying these templates, preserving all unspecified values as unset', {
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Apply imported plan', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan applied.' })).toBeVisible();
  const after = await state(page);
  expect(after.history).toEqual(before.history);
  expect(after.active).toEqual(before.active);
  expect(after.plan['Sunday · Legs']).toEqual(before.plan['Sunday · Legs']);
  expect(after.plan['Tuesday · Bench focus'].map((r: any[]) => r[0])).toEqual([
    'Custom Bench',
    'Cable Fly',
  ]);
  expect(after.plan['Tuesday · Bench focus · Easy'][0][1]).toBe(2);
  await page.screenshot({ path: 'test-results/plan-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record')).toContainText('100');
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Weight Squat set 1', exact: true }),
  ).toHaveValue('60');
  await page.reload();
  await expect(
    page.getByRole('spinbutton', { name: 'Weight Squat set 1', exact: true }),
  ).toHaveValue('60');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Discard workout', exact: true }).click();
  await page.getByRole('button', { name: 'EASY', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.getByRole('heading', { name: 'Light Bench', exact: true })).toBeVisible();
  await expect(page.getByText('Target: 12 reps', { exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Weight Light Bench set/ })).toHaveCount(2);
});
test('ambiguous TXT must be edited and assigned before applying; cancellation keeps templates', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const before = await state(page);
  await page.getByText('Source text and workout aliases', { exact: true }).click();
  await page.locator('#plan-source').fill('Unrecognized Day:\nOdd movement — 3-4 sets, rest 90');
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
  const preview = page.getByLabel('Editable program preview', { exact: true });
  await expect(
    page.getByRole('button', { name: 'Apply imported program', exact: true }),
  ).toBeDisabled();
  await preview.getByText('Edit workout / schedule', { exact: true }).click();
  await preview.getByLabel('WORKOUT NAME', { exact: true }).fill('Custom back workout');
  await preview.locator('.review-exercise > summary').first().click();
  await preview.getByText('Edit exercise details', { exact: true }).click();
  await preview.getByLabel('SET COUNT', { exact: true }).fill('3');
  // Missing reps/rest remain unset; source ambiguity must be explicitly reviewed.
  for (const checkbox of await preview
    .locator('.review-exercise > label input[type=checkbox]')
    .all())
    await checkbox.check();
  await preview
    .getByRole('checkbox', {
      name: 'I confirm replacing the active training plan; preserve workout history and unspecified values',
      exact: true,
    })
    .check();
  await expect(
    page.getByRole('button', { name: 'Apply imported program', exact: true }),
  ).toBeEnabled();
  expect(await state(page)).toEqual(before);
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  expect(await state(page)).toEqual(before);
});
test('preview edits and ordering persist into templates and import works offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Source text and workout aliases', { exact: true }).click();
  await page
    .locator('#plan-source')
    .fill('Leg Day Easy\nLeg Press 4x8 rest 2 min\nCalf Raise 3x12 rest 60s');
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
  await page.locator('.review-exercise > summary').nth(1).click();
  await page.locator('.exercise-editor > summary').nth(1).click();
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  await page.getByLabel('EXERCISE NAME', { exact: true }).first().fill('Seated Calf Raise');
  await page.getByLabel('SETS', { exact: true }).first().fill('2');
  await page
    .getByLabel('I confirm applying these templates, preserving all unspecified values as unset')
    .check();
  await page.getByRole('button', { name: 'Apply imported plan', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan applied.' })).toBeVisible();
  const saved = await state(page);
  expect(saved.plan['Sunday · Legs · Easy'].map((r: any[]) => r[0])).toEqual([
    'Seated Calf Raise',
    'Leg Press',
  ]);
  expect(saved.plan['Sunday · Legs · Easy'][0][1]).toBe(2);
});
test('layered stack shows both neighbors, supports mouse dragging, keyboard and wraparound', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto('/');
  const center = async (name: string) =>
    Math.abs(
      await page.getByRole('article', { name, exact: true }).evaluate((el) => {
        const r = el.getBoundingClientRect(),
          p = el.parentElement!.getBoundingClientRect();
        return r.left + r.width / 2 - (p.left + p.width / 2);
      }),
    );
  await expect.poll(() => center('Bench Day')).toBeLessThan(3);
  const visible = await page.locator('.carousel').evaluate((el) => {
    const p = el.getBoundingClientRect();
    return Array.from(el.children).filter((c) => {
      const r = c.getBoundingClientRect();
      return getComputedStyle(c).opacity !== '0' && r.right > p.left && r.left < p.right;
    }).length;
  });
  expect(visible).toBe(3);
  const rect = await page.locator('.carousel').boundingBox();
  await page.mouse.move(rect!.x + rect!.width * 0.75, rect!.y + 80);
  await page.mouse.down();
  await page.mouse.move(rect!.x + rect!.width * 0.15, rect!.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole('article', { name: 'DB Press Day', exact: true })).toHaveClass(
    /selected/,
  );
  await expect.poll(() => center('DB Press Day')).toBeLessThan(3);
  await page.getByRole('region', { name: 'Workout selection', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => center('Bench Day')).toBeLessThan(3);
  await page.getByRole('region', { name: 'Workout selection', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => center('Hammer Press Day')).toBeLessThan(3);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => center('Bench Day')).toBeLessThan(3);
  await page.screenshot({ path: 'test-results/carousel-desktop.png', fullPage: true });
});
