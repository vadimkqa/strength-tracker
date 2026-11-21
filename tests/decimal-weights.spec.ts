import { test, expect, type Page } from '@playwright/test';
import { beginCards, cardFixture, stored } from './exercise-fixture';
import { createWorkout } from '../src/data';
const weight = (page: Page, set = 1) =>
  page.getByLabel(`Weight Bench Press set ${set}`, { exact: true });
const reps = (page: Page, set = 1) =>
  page.getByLabel(`Reps Bench Press set ${set}`, { exact: true });
const plus = (page: Page) =>
  page.getByRole('button', { name: 'Increase weight by 0.25 kg', exact: true });
test('period/comma weights and partial drafts survive editing, active reload and reopening', async ({
  page,
}) => {
  const d = await beginCards(page);
  for (const value of ['7.5', '7.75', '8.125', '0.125', '7,5', '7,75', '8,125', '0,125', '7.751']) {
    await weight(page).fill(value);
    await expect(weight(page)).toHaveValue(value.replace(',', '.'));
    expect((await stored(page)).active.exercises[0].sets[0].weight).toBe(value.replace(',', '.'));
  }
  await weight(page).fill('');
  await weight(page).pressSequentially('7.');
  await expect(weight(page)).toHaveValue('7.');
  expect((await stored(page)).active.exercises[0].sets[0].weight).toBe('7.');
  await page.reload();
  await expect(weight(page)).toHaveValue('7.');
  await weight(page).press('End');
  await weight(page).pressSequentially('75');
  await expect(weight(page)).toHaveValue('7.75');
  await weight(page).fill('8,125');
  await reps(page).fill('3');
  await expect.poll(async () => (await stored(page)).active.exercises[0].sets[0].reps).toBe('3');
  await page.reload();
  await expect(weight(page)).toHaveValue('8.125');
  await expect(reps(page)).toHaveValue('3');
  await page.goto('/strength-tracker/');
  await expect(weight(page)).toHaveValue('8.125');
  expect((await stored(page)).history).toEqual(d.history);
  for (const value of ['-0.125', '7.1234']) {
    await weight(page).fill(value);
    await expect(weight(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByRole('status').filter({ hasText: 'Use 0 or positive kg' }),
    ).toBeVisible();
  }
});
for (const [width, height] of [
  [320, 568],
  [375, 667],
  [390, 844],
]) {
  test(`focused weight adjustments, navigation and PWA viewport remain safe at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
    );
    await beginCards(page);
    await weight(page).fill('7.75');
    await weight(page).focus();
    if (width !== 320)
      await page.screenshot({
        path: `docs/screenshots/decimal-weights/accessory-${width}.png`,
        animations: 'disabled',
      });
    await weight(page).fill('0.125');
    await weight(page).focus();
    const before = await stored(page),
      other = await weight(page, 2).inputValue();
    for (let i = 0; i < 12; i++) await plus(page).tap();
    await expect(weight(page)).toHaveValue('3.125');
    await expect(weight(page)).toBeFocused();
    for (let i = 0; i < 6; i++)
      await page.getByRole('button', { name: 'Decrease weight by 0.5 kg', exact: true }).tap();
    await expect(weight(page)).toHaveValue('0.125');
    await page.getByRole('button', { name: 'Decrease weight by 0.25 kg', exact: true }).tap();
    await expect(weight(page)).toHaveValue('0');
    await page.getByRole('button', { name: 'Decrease weight by 0.5 kg', exact: true }).tap();
    await expect(weight(page)).toHaveValue('0');
    await weight(page).fill('7.75');
    await page.evaluate((height) => {
      Object.defineProperty(visualViewport!, 'height', { configurable: true, value: height - 280 });
      Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 40 });
      visualViewport!.dispatchEvent(new Event('resize'));
    }, height);
    await expect(page.locator('.set-input-navigation')).toHaveCSS('position', 'static');
    await expect(weight(page)).toBeFocused();
    await expect(plus(page)).not.toBeFocused();
    await plus(page).tap();
    await expect(weight(page)).toHaveValue('8');
    await expect(weight(page)).toBeFocused();
    await page.getByRole('button', { name: 'Increase weight by 0.5 kg', exact: true }).tap();
    await expect(weight(page)).toHaveValue('8.5');
    await expect(weight(page, 2)).toHaveValue(other);
    const after = await stored(page);
    expect(after.active.controller).toEqual(before.active.controller);
    expect(after.history).toEqual(before.history);
    await page.getByRole('button', { name: /^Previous:/ }).tap();
    await expect(reps(page)).toBeFocused();
    await expect(plus(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Next:/ }).tap();
    await expect(weight(page)).toBeFocused();
    await expect(plus(page)).toBeVisible();
    await page.getByRole('button', { name: /^Next:/ }).tap();
    await expect(reps(page, 2)).toBeFocused();
    await expect(plus(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Done editing Bench Press', exact: true }).tap();
    await expect(reps(page, 2)).not.toBeFocused();
    await expect(page.locator('.set-input-navigation')).toHaveCount(1);
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, 'height', { configurable: true, value: innerHeight });
      Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 0 });
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.locator('main').evaluate((e) => e.scrollTop)).toBe(0);
    await page.reload();
    await expect(weight(page)).toHaveValue('8.5');
    await weight(page, 2).focus();
    const done = page.getByRole('button', { name: 'Done entering this exercise', exact: true });
    await done.focus();
    await done.press('Enter');
    await expect(page.locator('.set-input-navigation')).toHaveCount(1);
  });
}
test('fractional completed sets remain exact in history, PR detail, chart and saved workout receipt', async ({
  page,
}) => {
  const d = cardFixture(),
    at = Date.parse('2026-11-16T12:00:00Z');
  d.history[0].exercises[0].sets.forEach((s) => {
    s.weight = '7.75';
    s.reps = '3';
  });
  d.history[0].finished = at - 86400000;
  d.active = createWorkout(
    d.trainingProgram!.workouts[0].id,
    'heavy',
    d.plan,
    at - 3600000,
    d.history,
  );
  d.active.exercises[0].sets.forEach((s, i) =>
    Object.assign(s, { weight: i ? '0.125' : '8.125', reps: i ? '1' : '3', done: true }),
  );
  await page.clock.setSystemTime(at);
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, d);
  await page.goto('/strength-tracker/');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await expect(page.getByTestId('completion-volume')).toHaveText('24.5kg');
  await expect(page.locator('.completion-prs')).toContainText('8.125 kg');
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record')).toContainText('8.125 kg');
  await page.getByRole('button', { name: 'View records for Bench Press', exact: true }).click();
  await expect(page.locator('.pr-history')).toContainText('0.125 kg');
  await expect(page.locator('.pr-summary')).toContainText('8.125 kg');
  await page.getByLabel('Chart metric', { exact: true }).selectOption('weight');
  await expect(page.locator('.pr-chart-value')).toContainText('8.125 kg');
  await page.getByLabel('Chart metric', { exact: true }).selectOption('volume');
  await expect(page.locator('.pr-chart-value')).toContainText('24.5 kg');
  expect((await stored(page)).history.slice(1)).toEqual(d.history);
});
