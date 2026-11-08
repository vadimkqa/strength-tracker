import { test, expect, type Page } from '@playwright/test';
async function seed(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'strength-tracker-v1',
      JSON.stringify({
        history: [],
        active: null,
        week: 'heavy',
        restDefault: 120,
        plan: {
          'Tuesday · Bench focus': [
            ['First', 2, 90],
            ['Second', 1, 90],
          ],
        },
      }),
    ),
  );
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
}
async function state(page: Page) {
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
async function ready(page: Page) {
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
}
async function pause(page: Page) {
  await page.waitForTimeout(700);
}
test('shared warmup/set/rest controller completes all exercises with persistent per-set timings', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(page.getByLabel('Current phase')).toHaveText('Warm-up');
  await expect(page.getByLabel('Phase stopwatch')).toHaveText(/00:0[01]/);
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await expect(page.getByLabel('Current phase')).toHaveText('Set');
  await pause(page);
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  await expect(page.getByLabel('Current phase')).toHaveText('Rest');
  await expect(page.getByRole('alert')).toContainText('timing saved');
  await page.getByRole('button', { name: 'Enter missing weight/reps', exact: true }).click();
  await page.getByLabel('Weight First set 1', { exact: true }).fill('100');
  await page.getByLabel('Reps First set 1', { exact: true }).fill('8');
  await ready(page);
  let d = await state(page);
  expect(d.active.exercises[0].sets[0].done).toBe(true);
  const timing = d.active.exercises[0].sets[0].timing;
  await page.reload();
  await expect(page.getByRole('button', { name: 'START NEXT SET', exact: true })).toBeVisible();
  await page.getByLabel('Weight First set 2', { exact: true }).fill('100');
  await page.getByLabel('Reps First set 2', { exact: true }).fill('7');
  await pause(page);
  await page.getByRole('button', { name: 'START NEXT SET', exact: true }).click();
  await pause(page);
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  await page.getByLabel('Weight Second set 1', { exact: true }).fill('30');
  await page.getByLabel('Reps Second set 1', { exact: true }).fill('12');
  await pause(page);
  await page.getByRole('button', { name: 'START NEXT SET', exact: true }).click();
  await pause(page);
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  await expect(page.getByRole('button', { name: 'FINISH WORKOUT', exact: true })).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'FINISH WORKOUT', exact: true }).click();
  await ready(page);
  d = await state(page);
  expect(d.history).toHaveLength(1);
  expect(d.history[0].controller.rests).toHaveLength(3);
  expect(d.history[0].exercises[0].sets[0].timing).toEqual(timing);
  expect(d.history[0].exercises.flatMap((e: any) => e.sets).every((s: any) => s.done)).toBe(true);
});
test('running timers resume after reload and elapsed wall time advances without interval ticks', async ({
  page,
}) => {
  await seed(page);
  await page.getByLabel('Weight First set 1', { exact: true }).fill('80');
  await page.getByLabel('Reps First set 1', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await ready(page);
  const before = await state(page);
  await page.reload();
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(page.getByLabel('Current phase')).toHaveText('Set');
  await page.clock.setSystemTime(Date.now() + 180000);
  await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(page.getByLabel('Phase stopwatch')).not.toHaveText('00:00');
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  await ready(page);
  const after = await state(page);
  expect(after.active.exercises[0].sets[0].timing.durationMs).toBeGreaterThanOrEqual(170000);
  expect(after.active.exercises[0].sets[0].timing.started).toBe(
    before.active.controller.phaseStarted,
  );
});
test('swipes switch screens, inputs do not swipe, skipped sets progress, floating action clears nav', async ({
  page,
}) => {
  await seed(page);
  const nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox(),
    button = await page.getByRole('button', { name: 'START SET', exact: true }).boundingBox();
  expect(button!.y + button!.height).toBeLessThan(nav!.y);
  const ex = page.locator('.exercise').first();
  await ex.dispatchEvent('pointerdown', { clientX: 300, clientY: 250, pointerType: 'touch' });
  await ex.dispatchEvent('pointerup', { clientX: 80, clientY: 255, pointerType: 'touch' });
  await expect(page.getByRole('tab', { name: 'TIMER', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
  const input = page.getByLabel('Weight First set 1', { exact: true });
  await input.dispatchEvent('pointerdown', { clientX: 250, clientY: 300 });
  await input.dispatchEvent('pointerup', { clientX: 30, clientY: 300 });
  await expect(page.getByRole('tab', { name: 'EXERCISES', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Skip set', exact: true }).first().click();
  await ready(page);
  expect((await state(page)).active.exercises[0].sets[0].skipped).toBe(true);
  await page.screenshot({ path: 'test-results/workout-exercises.png' });
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await page.screenshot({ path: 'test-results/workout-timer.png' });
});

test('legacy backup active workout resumes and newly added exercise sets can be selected immediately', async ({
  page,
}) => {
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'New exercise' : undefined));
  await page
    .locator('#backup')
    .setInputFiles({
      name: 'legacy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          history: [],
          active: {
            id: 'legacy',
            name: 'Legacy workout',
            week: 'heavy',
            started: Date.now() - 60000,
            restEnd: null,
            restSeconds: null,
            exercises: [
              {
                id: 'legacy-ex',
                name: 'Legacy press',
                rest: 90,
                sets: [{ weight: '70', reps: '8', done: false }],
              },
            ],
          },
          week: 'heavy',
          restDefault: 120,
        }),
      ),
    });
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.getByLabel('Weight Legacy press set 1', { exact: true })).toHaveValue('70');
  await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('button', { name: 'Select New exercise set 2', exact: true }).click();
  await ready(page);
  const d = await state(page);
  expect(d.active.controller.selected.setId).toBe(d.active.exercises[1].sets[1].id);
});
