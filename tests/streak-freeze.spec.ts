import { test, expect, type Page } from '@playwright/test';
import { seedStreak, streakData } from './streak-fixture';
import { stored } from './exercise-fixture';

test.use({ locale: 'en-US' });

async function openStreak(page: Page) {
  await page.getByRole('button', { name: /^Strength Streak, .* consecutive weeks$/ }).click();
  await expect(page.getByRole('heading', { name: 'Strength Streak.' })).toBeVisible();
}
const freeze = (page: Page) => page.getByRole('region', { name: 'Streak Freeze', exact: true });
const pick = (page: Page, label: string) =>
  freeze(page).getByRole('button', { name: label, exact: true }).click();
const scrollTo = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluate((el) =>
      window.scrollTo(0, Math.max(0, window.scrollY + el.getBoundingClientRect().top - 16)),
    );

test('selects and highlights an inclusive range across months, shows partial weeks, and waits for confirmation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const initial = streakData();
  await seedStreak(page, initial);
  await openStreak(page);
  await pick(page, 'Plan rest period');
  await pick(page, 'Tuesday, November 17, 2026');
  await pick(page, 'Next month');
  await pick(page, 'Sunday, December 6, 2026');
  const panel = freeze(page);
  await expect(
    panel.getByRole('button', { name: 'Tuesday, December 1, 2026', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('status')).toContainText('3 weeks affected · 2 weeks protected');
  await expect(panel.getByRole('status')).toContainText('Nov 23, 2026 – Nov 29, 2026');
  await expect(panel.getByRole('status')).toContainText(
    'Unfinished training outside the range: Nov 16, 2026',
  );
  await pick(page, 'Previous month');
  await expect(
    panel.getByRole('button', { name: 'Tuesday, November 17, 2026', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await scrollTo(page, '.streak-freeze');
  await page.screenshot({
    path: 'test-results/streak-freeze-picker-iphone.png',
    animations: 'disabled',
  });
  await pick(page, 'Review rest period');
  expect((await stored(page)).streak.freezes).toBeUndefined();
  await pick(page, 'Confirm rest period');
  const saved = await stored(page);
  expect(saved.streak.freezes).toHaveLength(1);
  expect(saved.streak.freezes[0]).toMatchObject({ start: '2026-11-17', end: '2026-12-06' });
  expect(saved.history).toEqual(initial.history);
  await expect(panel.getByRole('list', { name: 'Saved rest periods' })).toContainText('Upcoming');
  await expect(page.getByLabel('Current streak', { exact: true })).toHaveText('3 weeks');
  await page.reload();
  await openStreak(page);
  await expect(panel).toContainText('Nov 17, 2026 – Dec 6, 2026');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('can edit upcoming periods, blocks shared dates, and explicitly cancels a period on a small screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seedStreak(page, streakData());
  await openStreak(page);
  await pick(page, 'Plan rest period');
  await pick(page, 'Monday, November 16, 2026');
  await pick(page, 'Sunday, November 22, 2026');
  await pick(page, 'Review rest period');
  await pick(page, 'Confirm rest period');
  const id = (await stored(page)).streak.freezes[0].id;
  await pick(page, 'Plan rest period');
  await pick(page, 'Sunday, November 22, 2026');
  await pick(page, 'Monday, November 23, 2026');
  await expect(freeze(page).getByRole('status')).toContainText('overlaps');
  await expect(freeze(page).getByRole('button', { name: 'Review rest period' })).toBeDisabled();
  await pick(page, 'Close picker');
  await pick(page, 'Edit dates');
  await pick(page, 'Monday, November 23, 2026');
  await pick(page, 'Sunday, November 29, 2026');
  await pick(page, 'Review rest period');
  await pick(page, 'Confirm rest period');
  expect((await stored(page)).streak.freezes[0]).toMatchObject({
    id,
    start: '2026-11-23',
    end: '2026-11-29',
  });
  await pick(page, 'Cancel rest period');
  await pick(page, 'Keep rest period');
  await expect(freeze(page)).toContainText('Upcoming');
  await pick(page, 'Cancel rest period');
  await pick(page, 'Confirm cancellation');
  expect((await stored(page)).streak.freezes[0]).toMatchObject({ id, cancelled: true });
  await expect(freeze(page).getByRole('list', { name: 'Saved rest periods' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('protects an active week without adding credit, then recalculates on early end', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const initial = streakData();
  initial.streak!.freezes = [
    {
      id: 'active-rest',
      start: '2026-11-09',
      end: '2026-11-22',
      updatedAt: Date.parse('2026-11-08T18:00Z'),
    },
  ];
  await seedStreak(page, initial);
  await openStreak(page);
  await expect(page.getByLabel('Current streak', { exact: true })).toHaveText('3 weeks');
  await expect(page.getByRole('region', { name: 'Current Strength Streak' })).toContainText(
    'Streak protected',
  );
  await expect(page.getByTestId('weekly-progress')).toHaveText('2 / 3');
  await expect(freeze(page)).toContainText('2 weeks protected');
  await scrollTo(page, '.streak-hero');
  await page.screenshot({
    path: 'test-results/streak-freeze-active-iphone.png',
    animations: 'disabled',
  });
  await scrollTo(page, '.streak-freeze');
  await page.screenshot({
    path: 'test-results/streak-freeze-dashboard-iphone.png',
    animations: 'disabled',
  });
  await pick(page, 'End after today');
  await expect(freeze(page)).toContainText('Unfinished training outside the range: Nov 11, 2026');
  await pick(page, 'Confirm early end');
  const saved = await stored(page);
  expect(saved.streak.freezes[0].end).toBe('2026-11-10');
  expect(saved.history).toEqual(initial.history);
  await expect(page.getByRole('region', { name: 'Current Strength Streak' })).toContainText(
    'Rest period active',
  );
  await page.clock.setSystemTime(Date.parse('2026-11-16T12:00Z'));
  await page.reload();
  await openStreak(page);
  await expect(page.getByLabel('Current streak', { exact: true })).toHaveText('0 weeks');
  await expect(freeze(page)).toContainText('Previous');
});

test('on Thursday, select Tuesday retroactively and extend the active period backward', async ({
  page,
}) => {
  const initial = streakData();
  await seedStreak(page, initial);
  await page.clock.setSystemTime(Date.parse('2026-11-12T12:00Z'));
  await openStreak(page);
  await pick(page, 'Plan rest period');
  const panel = freeze(page);
  const day = (name: string) => panel.getByRole('button', { name, exact: true });
  await expect(day('Sunday, November 8, 2026')).toBeEnabled();
  await expect(day('Sunday, October 25, 2026')).toHaveCount(0);
  await pick(page, 'Previous month');
  await expect(day('Sunday, October 25, 2026')).toBeDisabled();
  await expect(day('Monday, October 26, 2026')).toBeEnabled();
  await pick(page, 'Next month');
  await expect(day('Tuesday, November 10, 2026')).toHaveAttribute('data-day', 'past');
  await expect(day('Thursday, November 12, 2026')).toHaveAttribute('aria-current', 'date');
  await expect(day('Sunday, November 15, 2026')).toHaveAttribute('data-day', 'future');
  await pick(page, 'Tuesday, November 10, 2026');
  await pick(page, 'Sunday, November 15, 2026');
  const summary = panel.getByRole('status');
  await expect(summary).toContainText('Selected rest dates: Nov 10, 2026 – Nov 15, 2026');
  await expect(summary).toContainText('Nov 9, 2026 – Nov 15, 2026');
  await expect(summary).toContainText('Scheduled days covered: Nov 10, 2026, Nov 11, 2026');
  await expect(summary).toContainText('1 week affected · 1 week protected');
  await pick(page, 'Review rest period');
  await pick(page, 'Confirm rest period');
  const id = (await stored(page)).streak.freezes[0].id;
  await expect(page.getByRole('region', { name: 'Current Strength Streak' })).toContainText(
    'Streak protected',
  );
  await pick(page, 'Edit dates');
  await pick(page, 'Monday, November 9, 2026');
  // Editing only the start keeps the existing end selected.
  await expect(summary).toContainText('Selected rest dates: Nov 9, 2026 – Nov 15, 2026');
  await pick(page, 'Review rest period');
  await pick(page, 'Confirm rest period');
  const saved = await stored(page);
  expect(saved.streak.freezes[0]).toMatchObject({ id, start: '2026-11-09', end: '2026-11-15' });
  expect(saved.history).toEqual(initial.history);
  await page.reload();
  await openStreak(page);
  await expect(panel).toContainText('Nov 9, 2026 – Nov 15, 2026');
  await pick(page, 'Cancel rest period');
  await expect(panel).toContainText('Removing protection can break your streak');
  await pick(page, 'Confirm cancellation');
  await expect(page.getByRole('region', { name: 'Current Strength Streak' })).not.toContainText(
    'Streak protected',
  );
  expect((await stored(page)).history).toEqual(initial.history);
});
