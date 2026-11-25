import { test, expect } from '@playwright/test';
import { seedProgression } from './progression-fixture';
import { stored, advanceClock } from './exercise-fixture';
const section = (page: import('@playwright/test').Page) => page.locator('.exercise-progression');
const weight = (page: import('@playwright/test').Page, n = 1) =>
  page.getByLabel(`Weight Bench Press set ${n}`, { exact: true });
const reps = (page: import('@playwright/test').Page, n = 1) =>
  page.getByLabel(`Reps Bench Press set ${n}`, { exact: true });
for (const [width, height] of [
  [320, 568],
  [390, 844],
]) {
  test(`optional suggestions apply only with intent and keep iPhone inputs stable at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
    );
    const d = await seedProgression(page);
    const before = await stored(page);
    await expect(reps(page)).toHaveValue('6');
    await section(page).getByText('Progression', { exact: true }).click();
    await expect(section(page)).toContainText('Increase reps');
    await expect(section(page)).toContainText('100 kg × 7 reps');
    expect((await stored(page)).active).toEqual(before.active);
    await reps(page).fill('4');
    const beforeApplication = await stored(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await section(page)
      .getByRole('button', { name: 'Use target for Bench Press', exact: true })
      .click();
    await expect(reps(page)).toHaveValue('4');
    page.once('dialog', (dialog) => dialog.accept());
    await section(page)
      .getByRole('button', { name: 'Use target for Bench Press', exact: true })
      .click();
    await expect(reps(page)).toHaveValue('7');
    await expect(reps(page, 2)).toHaveValue('6');
    const after = await stored(page);
    expect(after.history).toEqual(d.history);
    expect(after.active.controller).toEqual(beforeApplication.active.controller);
    expect(after.active.exercises[0].sets.every((s: any) => !s.done)).toBe(true);
    expect(after.active.exercises[0].sets.map((s: any) => s.prescription)).toEqual(
      before.active.exercises[0].sets.map((s: any) => s.prescription),
    );
    await weight(page).focus();
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, 'height', {
        configurable: true,
        value: innerHeight - 280,
      });
      Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 45 });
      visualViewport!.dispatchEvent(new Event('resize'));
      visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await expect(weight(page)).toBeFocused();
    await expect(page.locator('.set-input-navigation')).toHaveCSS('position', 'static');
    await expect(section(page)).toHaveCSS('position', 'static');
    await page.getByRole('button', { name: /^Next:/ }).click();
    await expect(reps(page, 2)).toBeFocused();
    await page.getByRole('button', { name: /^Done editing Bench Press$/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.reload();
    await expect(reps(page)).toHaveValue('7');
    expect((await stored(page)).history).toEqual(d.history);
  });
}
test('custom fractional increments persist, produce precise proposals, and never auto-fill', async ({
  page,
}) => {
  await seedProgression(page, true);
  await section(page).getByText('Progression', { exact: true }).click();
  const editor = section(page).getByLabel('Weight increment for Bench Press', { exact: true });
  await editor.fill('0,125');
  await section(page).getByRole('button', { name: 'Save increment', exact: true }).click();
  await expect(section(page)).toContainText('100.125 kg × 5 reps');
  await expect(weight(page)).toHaveValue('100');
  await stored(page);
  await page.reload();
  await section(page).getByText('Progression', { exact: true }).click();
  await expect(editor).toHaveValue('0.125');
  await expect(section(page)).toContainText('100.125 kg × 5 reps');
  page.once('dialog', (d) => d.accept());
  await section(page)
    .getByRole('button', { name: 'Use target for Bench Press', exact: true })
    .click();
  await expect(weight(page)).toHaveValue('100.125');
  await expect(reps(page)).toHaveValue('5');
});
test('a running timer and completed fields are never changed by using a target', async ({
  page,
}) => {
  await seedProgression(page, true);
  await advanceClock(page, 1000);
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  const before = await stored(page);
  await section(page).getByText('Progression', { exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await section(page)
    .getByRole('button', { name: 'Use target for Bench Press', exact: true })
    .click();
  const after = await stored(page);
  expect(after.active.controller).toEqual(before.active.controller);
  expect(after.active.exercises[0].sets[0]).toEqual(before.active.exercises[0].sets[0]);
  expect(after.history).toEqual(before.history);
  await expect(page.getByRole('button', { name: 'STOP SET', exact: true })).toBeVisible();
});
test('effort confirmation is optional, requires completed sets and persists only on this active session', async ({
  page,
}) => {
  const initial = await seedProgression(page, true, 'no fail', (d) => {
    d.history.at(-1)!.exercises[0].sets[0].reps = '4';
  });
  await section(page).getByText('Progression', { exact: true }).click();
  await expect(section(page)).toContainText('no matching effort confirmation');
  await expect(section(page).locator('ul').first().locator('li')).toHaveText([
    'Set 1: 100 kg × 4',
    'Set 2: 100 kg × 8',
  ]);
  const checkbox = section(page).getByRole('checkbox', {
    name: 'Confirm prescribed effort for Bench Press',
    exact: true,
  });
  await expect(checkbox).toBeDisabled();
  // Log completed sets through the existing UI; this is explicit input, not suggestion completion.
  page.on('dialog', (d) => d.accept());
  for (const n of [1, 2]) {
    if (n === 1) await page.getByLabel('Set options for Bench Press', { exact: true }).click();
    await page.getByRole('button', { name: `Complete Bench Press set ${n}`, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Expand Bench Press', exact: true }).click();
  if ((await section(page).getAttribute('open')) === null)
    await section(page).getByText('Progression', { exact: true }).click();
  await checkbox.check();
  expect((await stored(page)).active.exercises[0].progressionEffort).toBeTruthy();
  expect((await stored(page)).history).toEqual(initial.history);
  await page.reload();
  if (await page.getByRole('button', { name: 'Expand Bench Press', exact: true }).count())
    await page.getByRole('button', { name: 'Expand Bench Press', exact: true }).click();
  await section(page).getByText('Progression', { exact: true }).click();
  await expect(checkbox).toBeChecked();
});
test('settings opt-out hides suggestions; timeline uses real sessions and manual overrides survive reload', async ({
  page,
}) => {
  const d = await seedProgression(page);
  await section(page).getByText('Progression', { exact: true }).click();
  await page.locator('.exercise-card').first().scrollIntoViewIfNeeded();
  await page
    .locator('.exercise-card')
    .first()
    .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 16));
  const bubble = page.getByRole('button', { name: 'Move floating timer', exact: true });
  for (let i = 0; i < 20; i++) await bubble.press('ArrowDown');
  await page.screenshot({ path: 'test-results/progression-exercise-iphone.png' });
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await page.getByRole('button', { name: 'View records for Bench Press', exact: true }).click();
  const timeline = page.getByRole('region', { name: 'Progression timeline', exact: true });
  await expect(timeline.locator('li')).toHaveCount(2);
  await expect(timeline).toContainText('Increased reps');
  await expect(
    page.getByRole('region', { name: 'Exercise progress chart', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: 'Exercise progress chart', exact: true })
    .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 16));
  await page.screenshot({ path: 'test-results/progression-chart-iphone.png' });
  await timeline.evaluate((el) =>
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 16),
  );
  await page.screenshot({ path: 'test-results/progression-detail-iphone.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Smart Progressive Overload', { exact: true }).selectOption('off');
  await expect.poll(async () => (await stored(page)).progressionPreferences.enabled).toBe(false);
  await page.reload();
  await expect(page.getByLabel('Smart Progressive Overload', { exact: true })).toHaveCount(0); // App reopens Train.
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(section(page)).toHaveCount(0);
  expect((await stored(page)).history).toEqual(d.history);
});
