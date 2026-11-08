import { test, expect } from '@playwright/test';
const legacy = {
  history: [
    {
      id: 'old-history',
      name: 'Tuesday · Bench focus',
      week: 'heavy',
      started: 1700000000000,
      finished: 1700000010000,
      restEnd: null,
      restSeconds: null,
      exercises: [
        {
          id: 'old-ex',
          name: 'Bench Press',
          rest: 180,
          sets: [{ weight: '80', reps: '5', done: true }],
        },
      ],
    },
  ],
  active: null,
  week: 'heavy',
  restDefault: 120,
};
test('mobile home, all workout selections, visible intensity and small-screen layout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible();
  for (const name of ['DB Press Day', 'Hammer Press Day', 'Leg Day', 'Bench Day']) {
    await page.getByRole('button', { name: `Select ${name}`, exact: true }).click();
    await expect(page.getByRole('article', { name, exact: true })).toHaveClass(/selected/);
  }
  await page.getByRole('button', { name: 'EASY', exact: true }).click();
  await expect(page.getByRole('button', { name: 'EASY', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() =>
      page
        .getByRole('article', { name: 'Bench Day', exact: true })
        .evaluate((e) =>
          Math.abs(e.getBoundingClientRect().left + e.clientWidth / 2 - innerWidth / 2),
        ),
    )
    .toBeLessThan(3);
  await page.screenshot({ path: 'test-results/train-390.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/train-320.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('native touch swipe selects next workout', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Bench Day', exact: true })).toHaveClass(
    /selected/,
  );
  const rect = await page.locator('.carousel').boundingBox();
  const cdp = await context.newCDPSession(page);
  const y = rect!.y + 80;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y }] });
  for (let x = 300; x >= 70; x -= 23) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('article', { name: 'DB Press Day', exact: true })).toHaveClass(
    /selected/,
  );
});
test('legacy history migrates, workout persists, timer and logging, history and records work', async ({
  page,
}) => {
  const raw = JSON.stringify(legacy);
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', raw);
  }, raw);
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bench Day', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await page.getByRole('spinbutton', { name: 'Reps Bench Press set 1', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Complete Bench Press set 1', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('positive whole-number reps');
  await page.getByRole('spinbutton', { name: 'Weight Bench Press set 1', exact: true }).fill('60');
  await page.getByRole('spinbutton', { name: 'Reps Bench Press set 1', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Complete Bench Press set 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(
    page.getByRole('spinbutton', { name: 'Weight Bench Press set 1', exact: true }),
  ).toHaveValue('60');
  await expect(
    page.getByRole('button', { name: 'Undo Bench Press set 1', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(page.getByLabel('Current phase')).toHaveText('Warm-up');
  await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
  await page.getByRole('button', { name: 'Add set to Bench Press', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Weight Bench Press set 5', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove set from Bench Press', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Weight Bench Press set 5', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bench Day', exact: true })).toHaveCount(2);
  await page.getByText('View sets', { exact: true }).first().click();
  await expect(page.getByText('60 kg × 8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record')).toContainText('80');
  await page.screenshot({ path: 'test-results/prs.png', fullPage: true });
  expect(await page.evaluate(() => localStorage.getItem('strength-tracker-v1'))).toBe(raw);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.screenshot({ path: 'test-results/progress.png', fullPage: true });
});
test('settings template editing, export, backup merge and malformed import protection', async ({
  page,
}) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'More sets Bench Press', exact: true }).click();
  await expect(page.getByText('5 sets · 180s rest', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/strength-tracker.*\.json/);
  await page.locator('#backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bench Day', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"history":[]}'),
  });
  await expect(page.getByRole('alert')).toContainText('Backup not imported');
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bench Day', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: 'test-results/settings.png', fullPage: true });
});
test('PWA assets and all photos are cached, offline reload and workout logging work', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await page.request.get('/strength-tracker/manifest.webmanifest');
  expect((await manifest.json()).display).toBe('standalone');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible();
  for (const photo of ['bench', 'pullups', 'hammer', 'legs']) {
    expect(
      await page.evaluate(
        async (photo) => (await fetch(`/strength-tracker/photos/${photo}.jpg`)).ok,
        photo,
      ),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await page.getByRole('spinbutton', { name: 'Reps Bench Press set 1', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Complete Bench Press set 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
});

test('exercise editing/addition, screen navigation, undo, discard and explicit history deletion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  const prompts = ['Custom Press', '90', 'Cable Crunch'];
  page.on('dialog', (dialog) =>
    dialog.accept(dialog.type() === 'prompt' ? prompts.shift() : undefined),
  );
  await page.getByRole('button', { name: 'Edit Bench Press', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Custom Press', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cable Crunch', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Reps Custom Press set 1', exact: true }).fill('12');
  await page.getByRole('button', { name: 'Complete Custom Press set 1', exact: true }).click();
  await page.getByRole('button', { name: 'Undo Custom Press set 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Complete Custom Press set 1', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
  await page.getByRole('button', { name: 'Discard workout', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await page.getByRole('button', { name: 'Delete session', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your story starts here.', exact: true }),
  ).toBeVisible();
});
