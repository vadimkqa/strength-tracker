import { test, expect, type Page } from '@playwright/test';
import { cardFixture, stored } from './exercise-fixture';
import { createWorkout } from '../src/data';
import { configureStreak } from '../src/streak';
const at = Date.parse('2026-11-12T12:00:00Z');
async function seed(page: Page, withHistory = true) {
  let d = cardFixture();
  const first = d.history[0];
  first.finished = at - 2 * 86400000;
  first.started = first.finished - 2700000;
  const older = structuredClone(first);
  older.id = 'monday-history';
  older.finished = at - 3 * 86400000;
  older.started = older.finished - 2700000;
  older.exercises[0].sets.forEach((s) => (s.weight = '55'));
  d.history.push(older);
  if (!withHistory) d.history = [];
  d = configureStreak(d, { target: 4 }, at);
  d.active = createWorkout(
    d.trainingProgram!.workouts[0].id,
    'heavy',
    d.plan,
    at - 2700000,
    d.history,
    { displayName: 'Upper Body Push – Week 1', cycleWeek: 1 },
  );
  d.active.exercises
    .slice(0, 2)
    .forEach((e, i) =>
      e.sets.forEach((s) =>
        Object.assign(s, { done: true, weight: i ? '0' : '65', reps: i ? '12' : '8' }),
      ),
    );
  await page.clock.setSystemTime(at);
  await page.addInitScript((data) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(data));
  }, d);
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).waitFor();
  await stored(page);
  page.on('dialog', (dialog) => dialog.accept());
  return d;
}
for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
]) {
  test(`saved completion receipt, PRs, 3/4 streak and history review at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const before = await seed(page);
    await page
      .getByRole('button', { name: 'Finish & save workout', exact: true })
      .evaluate((el: HTMLButtonElement) => {
        el.click();
        el.click();
      });
    await expect(
      page.getByRole('heading', { name: 'Workout Complete', exact: true }),
    ).toBeFocused();
    await expect(page.getByTestId('completion-duration')).toHaveText('00:45:00');
    await expect(page.getByTestId('completion-sets')).toHaveText('4');
    await expect(page.getByTestId('completion-volume')).toHaveText('1,040kg');
    await expect(page.getByLabel('Weekly workout progress', { exact: true })).toHaveText('3/4');
    await expect(page.locator('.completion-prs')).toContainText('65 kg');
    await expect(page.locator('.completion-prs')).toContainText('Previous best: 60 kg × 8');
    await expect(page.locator('.completion-exercises summary')).toContainText(
      '2 / 3 exercises completed',
    );
    await expect(page.locator('.completion-intensity')).toHaveText('Hard');
    await expect(page.locator('.completion-streak')).toContainText('added one training day');
    const saved = await stored(page);
    expect(saved.active).toBeNull();
    expect(saved.history).toHaveLength(3);
    expect(new Set(saved.history.map((w: any) => w.id)).size).toBe(3);
    expect(saved.history[0].exercises).toEqual(before.active!.exercises);
    expect(saved.plan).toEqual(before.plan);
    expect(saved.history.slice(1)).toEqual(before.history);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (viewport.width === 390) {
      await page.screenshot({
        path: '/tmp/workout-completion-iphone.png',
        fullPage: true,
        animations: 'disabled',
      });
      await page.screenshot({
        path: '/tmp/workout-completion-viewport.png',
        animations: 'disabled',
      });
      await page.locator('.completion-done').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/workout-completion-streak.png', animations: 'disabled' });
      await page.evaluate(() => scrollTo(0, 0));
    }
    await page.locator('.completion-exercises summary').click();
    await expect(page.locator('.completion-exercise-list')).toContainText('65 kg × 8');
    await expect(page.locator('.completion-exercise-list')).toContainText('0 kg × 12');
    await expect(page.locator('.completion-exercise-list')).toContainText('Not completed');
    const done = page.getByRole('button', { name: 'Done', exact: true });
    await done.scrollIntoViewIfNeeded();
    const b = (await done.boundingBox())!,
      nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(nav.y);
    await done.click();
    await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByRole('button', { name: 'View workout summary', exact: true }).first().click();
    await expect(
      page.getByRole('heading', { name: 'Workout Complete', exact: true }),
    ).toBeVisible();
    expect((await stored(page)).history).toEqual(saved.history);
    await page.reload();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByRole('button', { name: 'View workout summary', exact: true }).first().click();
    await expect(page.getByTestId('completion-volume')).toHaveText('1,040kg');
    expect((await stored(page)).history).toEqual(saved.history);
    if (viewport.width === 390) {
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.context().setOffline(true);
      await page.reload();
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await page.getByRole('button', { name: 'View workout summary', exact: true }).first().click();
      await expect(page.getByTestId('completion-volume')).toHaveText('1,040kg');
      expect((await stored(page)).history).toEqual(saved.history);
      await page.context().setOffline(false);
    }
  });
}

test('failed completion keeps active session and committed records, retries the same timestamp without duplicate history', async ({
  page,
}) => {
  const before = await seed(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).failCompletion = true;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (this.name === 'state' && (window as any).failCompletion)
        throw new DOMException('Simulated save failure', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your workout remains active');
  await expect(page.getByRole('heading', { name: 'Workout Complete', exact: true })).toHaveCount(0);
  const persisted = await page.evaluate(async () => {
    const r = indexedDB.open('strength-tracker-v2');
    const db = await new Promise<IDBDatabase>((resolve) => (r.onsuccess = () => resolve(r.result)));
    return new Promise<any>((resolve) => {
      const q = db.transaction('state').objectStore('state').get('current');
      q.onsuccess = () => {
        db.close();
        resolve(q.result);
      };
    });
  });
  expect(persisted.active.exercises).toEqual(before.active!.exercises);
  expect(persisted.history).toEqual(before.history);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record')).toContainText('60');
  await page.clock.setSystemTime(at + 600000);
  await page.evaluate(() => ((window as any).failCompletion = false));
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout Complete', exact: true })).toBeVisible();
  await expect(page.getByTestId('completion-duration')).toHaveText('00:45:00');
  expect((await stored(page)).history).toHaveLength(3);
});

test('pending IndexedDB transaction cannot display confirmation and blocks edits until commit', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    (window as any).holdCompletion = true;
    IDBDatabase.prototype.transaction = function (...args: any[]) {
      const tx = original.apply(this, args as any);
      if (
        args[1] === 'readwrite' &&
        tx.objectStoreNames.contains('state') &&
        (window as any).holdCompletion
      ) {
        const pump = () => {
          const r = tx.objectStore('state').get('current');
          r.onsuccess = () => {
            if ((window as any).holdCompletion) pump();
          };
        };
        pump();
      }
      return tx;
    };
  });
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saving your workout…' })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await expect(page.getByRole('heading', { name: 'Workout Complete', exact: true })).toHaveCount(0);
  await page.evaluate(() => ((window as any).holdCompletion = false));
  await expect(page.getByRole('heading', { name: 'Workout Complete', exact: true })).toBeVisible();
  expect((await stored(page)).history).toHaveLength(3);
});

test('first workout shows a neutral PR baseline message and no unearned or secret artwork', async ({
  page,
}) => {
  await seed(page, false);
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout Complete', exact: true })).toBeVisible();
  await expect(page.locator('.completion-prs')).toContainText('No new PRs this session');
  await expect(page.getByLabel('Weekly workout progress', { exact: true })).toHaveText('1/4');
  await expect(page.locator('.completion-unlock')).toHaveCount(0);
  await expect(page.locator('img[src$="12.PNG"]')).toHaveCount(0);
});

test('reviewing an older summary leaves an ongoing set and active session intact', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Undo Bench Press set 1', exact: true }).click();
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  const before = await stored(page);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: 'View workout summary', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Workout Complete', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.set-spinner')).toBeVisible();
  const after = await stored(page);
  expect(after.active).toEqual(before.active);
  expect(after.history).toEqual(before.history);
});
