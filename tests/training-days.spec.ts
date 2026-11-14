import { test, expect, type Page } from '@playwright/test';
import { calendarFixture, noon } from './calendar-fixture';
import { stored } from './exercise-fixture';
import type { Workout, Data } from '../src/data';
import { syncStreaks } from '../src/streak';
const completed = (date: string, name: string): Workout => ({
  id: crypto.randomUUID(),
  name,
  week: 'heavy',
  started: noon(date) - 3600000,
  finished: noon(date),
  restEnd: null,
  restSeconds: null,
  exercises: [
    {
      id: crypto.randomUUID(),
      name: 'Custom movement',
      rest: null,
      skipped: true,
      sets: [{ done: false, skipped: true, weight: '', reps: '' }],
    },
  ],
});
function fixture() {
  const d = calendarFixture();
  d.history = [
    completed('2026-11-10', 'Bench modified'),
    completed('2026-11-12', 'DB Press renamed'),
    completed('2026-11-13', 'Leg Day custom'),
  ];
  // Older saved metadata is deliberately retained: the app must upgrade its interpretation without rewriting workouts.
  delete d.streak!.rulesVersion;
  d.streak!.timeZone = 'UTC';
  return d;
}
async function seed(page: Page, d: Data, date = '2026-11-13') {
  await page.clock.setSystemTime(noon(date));
  await page.addInitScript((data) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(data));
  }, d);
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: /Strength Streak, \d+ consecutive weeks?/ }).click();
  await expect(page.getByRole('heading', { name: 'Strength Streak.', exact: true })).toBeVisible();
}
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [393, 852],
])
  test(`retroactive 3/4 and readable Monday–Sunday calendar at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const d = fixture();
    await seed(page, d);
    await expect(page.getByTestId('weekly-progress')).toHaveText('3 / 4');
    const current = page.getByLabel("This week's streak progress", { exact: true }),
      calendar = current.getByRole('list', { name: 'Monday to Sunday training calendar' });
    await expect(calendar.getByRole('listitem')).toHaveCount(7);
    for (const day of ['Tuesday', 'Thursday', 'Friday'])
      await expect(
        calendar.getByRole('listitem', { name: new RegExp(`${day} .*Completed`) }),
      ).toHaveClass(/completed/);
    await expect(calendar.getByRole('listitem', { name: /Saturday .*Scheduled/ })).toHaveClass(
      /scheduled/,
    );
    await expect(calendar.getByRole('listitem', { name: /Wednesday .*Rest/ })).toHaveClass(/rest/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390) {
      await current.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: 'test-results/training-days-calendar.png' });
    }
    const saved = await stored(page);
    expect(saved.history).toEqual(d.history);
    expect(saved.streak.timeZone).toBe('Europe/Vienna');
    expect(saved.streak.rulesVersion).toBe(2);
    await page.reload();
    await page.getByRole('button', { name: /Strength Streak, \d+ consecutive weeks?/ }).click();
    await expect(page.getByTestId('weekly-progress')).toHaveText('3 / 4');
  });
test('Sunday make-up qualifies despite missed Saturday; multiple different sessions on one date count once', async ({
  page,
}) => {
  const d = fixture();
  d.history.push(completed('2026-11-15', 'Sunday make-up'), {
    ...completed('2026-11-15', 'Extra workout same date'),
    started: noon('2026-11-15') - 7200000,
  });
  await seed(page, d, '2026-11-15');
  await expect(page.getByTestId('weekly-progress')).toHaveText('4 / 4');
  await expect(page.getByLabel('Current streak', { exact: true })).toHaveText('1 week');
  const current = page.getByLabel("This week's streak progress", { exact: true });
  await expect(current.getByRole('listitem', { name: /Saturday .*Missed/ })).toHaveClass(/missed/);
  await expect(
    current.getByRole('listitem', { name: /Sunday .*Completed on a rest day/ }),
  ).toHaveClass(/completed/);
  await current.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'test-results/training-days-make-up.png' });
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  // Excluding one of two sessions on Sunday leaves that date credited; excluding both removes it.
  const sunday = page
    .getByRole('heading', { name: 'Sunday make-up', exact: true })
    .locator('..')
    .locator('.history-streak-exclusion input');
  await sunday.check();
  await stored(page);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('4 / 4');
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Extra workout same date', exact: true })
    .locator('..')
    .locator('.history-streak-exclusion input')
    .check();
  await stored(page);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('3 / 4');
});
test('weekday selection and manual target work for scheduled programs, persist and do not change carousel/templates', async ({
  page,
}) => {
  const d = fixture();
  await seed(page, d);
  await page.getByText('Streak settings and rotation', { exact: true }).click();
  const settings = page.locator('.streak-settings');
  await settings.getByRole('checkbox', { name: 'Monday', exact: true }).check();
  await settings.getByRole('checkbox', { name: 'Saturday', exact: true }).uncheck();
  await settings
    .getByRole('checkbox', { name: "Override the program's weekly target", exact: true })
    .check();
  await settings.getByLabel('WEEKLY TRAINING-DAY TARGET', { exact: true }).fill('5');
  await settings.getByRole('button', { name: 'Save streak settings', exact: true }).click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('3 / 5');
  const saved = await stored(page);
  expect(saved.trainingProgram).toEqual(d.trainingProgram);
  expect(saved.programs.find((p: any) => p.id === saved.activeProgramId).calendar).toEqual(
    d.programs!.find((p) => p.id === d.activeProgramId)!.calendar,
  );
  expect(saved.streak.trainingDays[saved.activeProgramId]).toEqual([0, 1, 3, 4]);
  expect(saved.history).toEqual(d.history);
  await settings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/training-days-settings.png' });
  await page.reload();
  await page.getByRole('button', { name: /Strength Streak, \d+ consecutive weeks?/ }).click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('3 / 5');
  await page.getByText('Streak settings and rotation', { exact: true }).click();
  await page.getByLabel("Override the program's weekly target", { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save streak settings', exact: true }).click();
  await expect(page.getByTestId('weekly-progress')).toHaveText('3 / 4');
});
