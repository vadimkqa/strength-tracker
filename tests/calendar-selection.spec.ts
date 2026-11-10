import { test, expect, type Page } from '@playwright/test';
import { calendarFixture, noon, savedSession } from './calendar-fixture';
import { stored } from './exercise-fixture';
import { currentProgram } from '../src/programs';
import { configureCalendar } from '../src/auto-selection';
import { applyProgram } from '../src/importing/saving';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { programIssues } from '../src/importing/model';
import { syncStreaks } from '../src/streak';
import type { Data } from '../src/data';
async function seed(page: Page, date: string, d = calendarFixture()) {
  await page.clock.setSystemTime(noon(date));
  await page.addInitScript((data) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(data));
  }, d);
  await page.goto('/strength-tracker/');
}
const cases = [
  ['2026-11-10', 1, 'Bench Day', 'HARD'],
  ['2026-11-12', 1, 'DB Press Day', 'EASY'],
  ['2026-11-13', 1, 'Leg Day', 'EASY'],
  ['2026-11-14', 1, 'Hammer Press Day', 'HARD'],
  ['2026-11-17', 2, 'Bench Day', 'EASY'],
  ['2026-11-19', 2, 'DB Press Day', 'HARD'],
  ['2026-11-20', 2, 'Leg Day', 'HARD'],
  ['2026-11-21', 2, 'Hammer Press Day', 'EASY'],
  ['2026-11-24', 1, 'Bench Day', 'HARD'],
] as const;
for (const [date, week, name, intensity] of cases)
  test(`${date} selects and starts ${name} Week ${week} ${intensity}`, async ({ page }) => {
    const d = calendarFixture();
    await seed(page, date, d);
    await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', name);
    await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveAttribute(
      'data-week',
      String(week),
    );
    await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
    await expect(page.locator('.calendar-context')).toBeVisible();
    if (date === '2026-11-10')
      await page.screenshot({ path: 'test-results/calendar-today-gym.png' });
    await expect(page.getByRole('button', { name: intensity, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.pagination button')).toHaveCount(4);
    await expect(page.locator('.stack-card')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const target = currentProgram(d)!.program!.workouts.find(
      (w) => w.week === week && w.name === name,
    )!;
    await page.getByRole('button', { name: /^START WORKOUT/ }).click();
    const saved = await stored(page);
    expect(saved.active.name).toBe(target.id);
    expect(saved.active.scheduledFor).toBe(date);
    expect(saved.active.exercises.map((e: any) => e.name)).toEqual(
      target.exercises.map((e) => e.name),
    );
    expect(saved.history).toEqual([]);
    expect(saved.streak.awards).toEqual([]);
  });
test('Sunday catches up Saturday; saved completion advances to next cycle without duplicating history', async ({
  page,
}) => {
  const d = calendarFixture();
  await seed(page, '2026-11-15', d);
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Hammer Press Day');
  await expect(page.locator('.calendar-context')).toHaveText('CATCH-UP WORKOUT');
  const r = (await page.getByRole('button', { name: /^START WORKOUT/ }).boundingBox())!;
  const nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
  expect(r.y + r.height).toBeLessThanOrEqual(nav.y);
  await page.screenshot({ path: 'test-results/calendar-catch-up.png' });
  // Reload a saved Saturday completion, as from an earlier successfully persisted workout.
  await page.evaluate(
    async (w) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open('strength-tracker-v2');
        r.onsuccess = () => resolve(r.result);
      });
      const tx = db.transaction('state', 'readwrite'),
        store = tx.objectStore('state'),
        request = store.get('current');
      request.onsuccess = () => {
        const d = request.result;
        d.history = [w];
        store.put(d, 'current');
      };
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    savedSession(d, 1, 'Saturday', '2026-11-14'),
  );
  await page.clock.setSystemTime(noon('2026-11-16'));
  await page.reload();
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Bench Day');
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveAttribute(
    'data-week',
    '2',
  );
  await expect(page.locator('.calendar-context')).toHaveText('NEXT WORKOUT');
  expect((await stored(page)).history).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.calendar-context')).toHaveText('NEXT WORKOUT');
  expect((await stored(page)).history).toHaveLength(1);
});
test('touch swiping and manual week selection persist until a new launch or local day', async ({
  page,
  context,
}) => {
  await seed(page, '2026-11-10');
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
  const region = page.getByRole('region', { name: 'Workout selection', exact: true }),
    box = (await region.boundingBox())!;
  const cdp = await context.newCDPSession(page),
    y = box.y + 65;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y }] });
  for (let i = 1; i <= 12; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 300 - (220 * i) / 12, y }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'DB Press Day');
  await page
    .getByLabel('TRAINING ROTATION', { exact: true })
    .getByRole('button', { name: 'Week 2', exact: true })
    .click();
  await stored(page);
  await page.waitForTimeout(1200);
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'DB Press Day');
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveAttribute(
    'data-week',
    '2',
  );
  await expect(page.locator('.calendar-context')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Bench Day');
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
  await page.getByRole('button', { name: 'Select Leg Day', exact: true }).click();
  await page.clock.setSystemTime(noon('2026-11-12'));
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'DB Press Day');
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
});
test('active sessions survive day changes, reload and offline without automatic selection', async ({
  page,
  context,
}) => {
  await seed(page, '2026-11-10');
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
  await page.getByRole('button', { name: /^START WORKOUT/ }).click();
  const before = await stored(page);
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  const running = await stored(page);
  await page.clock.setSystemTime(noon('2026-11-17'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'STOP SET', exact: true })).toBeVisible();
  const after = await stored(page);
  expect(after.active).toEqual(running.active);
  expect(after.rotationWeek).toBe(before.rotationWeek);
  expect(after.history).toEqual([]);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'STOP SET', exact: true })).toBeVisible();
  expect((await stored(page)).active).toEqual(running.active);
});
test('Settings requests an explicit anchor and missing weekdays; changes preserve old streak requirements', async ({
  page,
}) => {
  const p = parseProgram(
    textDocument('Program: Flexible AB\nWorkout A:\n- Squat 1x5\nWorkout B:\n- Press 1x8'),
  );
  programIssues(p).forEach((i) => (i.reviewed = true));
  let d = applyProgram(calendarFixture(), p, true);
  d = syncStreaks(d, noon('2026-11-10'), 'Europe/Vienna');
  await seed(page, '2026-11-10', d);
  await expect(page.locator('.calendar-context')).toContainText('setup in Settings');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Calendar workout selection', exact: true });
  await expect(panel.locator('#calendar-anchor')).toHaveValue('');
  await panel.getByRole('button', { name: 'Save calendar selection', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Invalid calendar');
  await panel.locator('#calendar-anchor').fill('2026-11-09');
  await panel.getByRole('button', { name: 'Save calendar selection', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('weekday');
  await panel.getByText('Review weekday assignments', { exact: true }).click();
  await panel.getByRole('combobox', { name: /Weekday for week 1 Workout A/ }).selectOption('1');
  await panel.getByRole('combobox', { name: /Weekday for week 1 Workout B/ }).selectOption('3');
  await panel.getByRole('button', { name: 'Save calendar selection', exact: true }).click();
  await stored(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Workout A');
  await expect(page.locator('.stack-front .stack-card-top')).toContainText('Tuesday');
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
  await page.screenshot({ path: 'test-results/calendar-today.png' });
  const saved = await stored(page);
  expect(saved.history).toEqual(d.history);
  expect(saved.streak.awards).toEqual(d.streak!.awards);
  await page.reload();
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
});

test('a successful Finish save advances the suggestion; a failed save cannot advance it or award twice', async ({
  page,
}) => {
  const p = parseProgram(
    textDocument(
      'Program: Simple rotation\nWeek 1\nThursday: Upper\n- Press 1x8\nWeek 2\nMonday: Lower\n- Squat 1x5',
    ),
  );
  programIssues(p).forEach((i) => (i.reviewed = true));
  let d = applyProgram(calendarFixture(), p, true);
  d = configureCalendar(d, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: {},
  });
  await seed(page, '2026-11-12', d);
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
  await page.getByRole('button', { name: /^START WORKOUT/ }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Set options for Press', { exact: true }).click();
  await page.getByLabel('Weight Press set 1', { exact: true }).fill('50');
  await page.getByLabel('Reps Press set 1', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Complete Press set 1', exact: true }).click();
  await page.clock.setSystemTime(noon('2026-11-12') + 60000);
  await stored(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).failCalendarSave = true;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (this.name === 'state' && (window as any).failCalendarSave)
        throw new DOMException('Calendar test save failure', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  await page.getByRole('button', { name: 'FINISH WORKOUT', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Changes are not saved');
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Upper');
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveAttribute(
    'data-week',
    '1',
  );
  await page.evaluate(() => ((window as any).failCalendarSave = false));
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Lower');
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveAttribute(
    'data-week',
    '2',
  );
  await expect(page.locator('.calendar-context')).toHaveText('NEXT WORKOUT');
  const saved = await stored(page);
  expect(saved.history).toHaveLength(1);
  expect(saved.streak.awards).toEqual([]);
  await page.reload();
  await expect(page.locator('.calendar-context')).toHaveText('NEXT WORKOUT');
  expect((await stored(page)).history).toHaveLength(1);
});

test('calendar selection keeps four-card manual wraparound independent of the anchor', async ({
  page,
}) => {
  await seed(page, '2026-11-10');
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
  const region = page.getByRole('region', { name: 'Workout selection', exact: true });
  await region.focus();
  await region.press('ArrowLeft');
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Hammer Press Day');
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveAttribute(
    'data-week',
    '2',
  );
  await stored(page);
  await page.waitForTimeout(1100);
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Hammer Press Day');
  await region.press('ArrowRight');
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Bench Day');
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveAttribute(
    'data-week',
    '1',
  );
  expect(currentProgram(await stored(page))!.calendar!.anchorDate).toBe('2026-11-09');
});

for (const [width, height] of [
  [375, 667],
  [393, 852],
  [430, 932],
])
  test(`configured calendar label leaves Start usable at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seed(page, '2026-11-13');
    await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
    await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Leg Day');
    const button = page.getByRole('button', { name: /^START WORKOUT/ }),
      b = (await button.boundingBox())!,
      nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(nav.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await button.click();
    await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
  });
