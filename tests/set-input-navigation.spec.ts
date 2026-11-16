import { test, expect, type Page } from '@playwright/test';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { applyProgram } from '../src/importing/saving';
import { emptyData } from '../src/data';
import { advanceClock, beginCards, stored } from './exercise-fixture';

const input = (page: Page, field: 'Reps' | 'Weight', set: number, exercise = 'Bench Press') =>
  page.getByLabel(`${field} ${exercise} set ${set}`, { exact: true });
const next = (page: Page) =>
  page
    .getByRole('group', { name: 'Set input navigation' })
    .getByRole('button', { name: /^(Next:|Done entering)/ });
async function occlude(page: Page, height: number) {
  await page.evaluate((height) => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: height });
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 50 });
    visualViewport!.dispatchEvent(new Event('resize'));
  }, height);
}
async function accessible(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const input = document.activeElement!.getBoundingClientRect();
        const accessory = document.querySelector('.set-input-navigation')!.getBoundingClientRect();
        return input.top >= visualViewport!.offsetTop + 8 && input.bottom <= accessory.top - 8;
      }),
    )
    .toBe(true);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  expect(await page.locator('main').evaluate((e) => e.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const size of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
]) {
  test(`Enter/Next follows reps then weight for three sets at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
    );
    await beginCards(page);
    await page.getByRole('button', { name: 'Add set to Bench Press', exact: true }).click();
    const before = await stored(page);
    await input(page, 'Reps', 1).focus();
    await occlude(page, size.height - 320);
    for (let set = 1; set <= 3; set++) {
      for (const field of ['Reps', 'Weight'] as const) {
        const current = input(page, field, set);
        await expect(current).toBeFocused();
        await expect(current).toHaveAttribute(
          'inputmode',
          field === 'Reps' ? 'numeric' : 'decimal',
        );
        await expect(current).toHaveAttribute(
          'enterkeyhint',
          set === 3 && field === 'Weight' ? 'done' : 'next',
        );
        expect(
          await current.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
        ).toBeGreaterThanOrEqual(16);
        await accessible(page);
        await current.fill(field === 'Reps' ? String(11 - set) : '72.5');
        await page.keyboard.press('Enter');
        if (set !== 3 || field !== 'Weight')
          await expect(page.locator('html')).toHaveAttribute('data-workout-keyboard', 'true');
      }
    }
    await expect(input(page, 'Weight', 3)).not.toBeFocused();
    await expect(next(page)).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-workout-keyboard', 'true');
    const after = await stored(page);
    expect(after.active.controller).toEqual(before.active.controller);
    expect(after.active.exercises.map((e: any) => e.id)).toEqual(
      before.active.exercises.map((e: any) => e.id),
    );
    expect(after.active.exercises[0].sets.map((s: any) => [s.weight, s.reps, s.done])).toEqual([
      ['72.5', '10', false],
      ['72.5', '9', false],
      ['72.5', '8', false],
    ]);
    expect(after.history).toEqual(before.history);
    await page.reload();
    for (let set = 1; set <= 3; set++) {
      await expect(input(page, 'Reps', set)).toHaveValue(String(11 - set));
      await expect(input(page, 'Weight', set)).toHaveValue('72.5');
    }
  });
}

test('touch fallback keeps direct input focus, adapts to added/removed sets and ends at the exercise boundary', async ({
  page,
}) => {
  await beginCards(page);
  await input(page, 'Reps', 1).focus();
  await occlude(page, 480);
  await next(page).tap();
  await expect(input(page, 'Weight', 1)).toBeFocused();
  await accessible(page);
  await next(page).tap();
  await expect(input(page, 'Reps', 2)).toBeFocused();
  await next(page).tap();
  await expect(input(page, 'Weight', 2)).toBeFocused();
  await expect(next(page)).toHaveAccessibleName('Done entering this exercise');
  await next(page).tap();
  await expect(next(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Add set to Bench Press', exact: true }).click();
  await expect(input(page, 'Weight', 2)).toHaveAttribute('enterkeyhint', 'next');
  await input(page, 'Weight', 2).focus();
  await expect(next(page)).toHaveAccessibleName('Next: Reps Bench Press set 3');
  await next(page).tap();
  await expect(input(page, 'Reps', 3)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input(page, 'Weight', 3)).toBeFocused();
  await next(page).tap();
  await page.getByRole('button', { name: 'Remove set from Bench Press', exact: true }).click();
  await expect(input(page, 'Reps', 3)).toHaveCount(0);
  await expect(input(page, 'Weight', 2)).toHaveAttribute('enterkeyhint', 'done');
  await page.getByRole('button', { name: 'Chest Dip details', exact: true }).click();
  await input(page, 'Weight', 2).focus();
  await expect(next(page)).toHaveAccessibleName('Done entering this exercise');
  await next(page).tap();
  await expect(input(page, 'Reps', 1, 'Chest Dip')).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Collapse Chest Dip', exact: true })).toBeVisible();
});

test('Next never changes the running set, timer or completion state, including app return and reorder', async ({
  page,
}) => {
  await beginCards(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  const before = await stored(page);
  await input(page, 'Reps', 1).fill('12');
  await occlude(page, 480);
  await next(page).tap();
  await expect(input(page, 'Weight', 1)).toBeFocused();
  await input(page, 'Weight', 1).fill('81.5');
  await advanceClock(page, 90000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await accessible(page);
  await next(page).tap();
  await expect(input(page, 'Reps', 2)).toBeFocused();
  await next(page).tap();
  await next(page).tap();
  const after = await stored(page);
  expect(after.active.controller).toEqual(before.active.controller);
  expect(after.active.exercises[0].sets.map((s: any) => s.done)).toEqual([false, false]);
  await expect(page.getByLabel('Set in progress', { exact: true })).toBeVisible();
  await page.getByLabel('Set options for Bench Press').click();
  await page.getByRole('button', { name: 'Move Bench Press down', exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).active.exercises.map((e: any) => e.name))
    .toEqual(['Chest Dip', 'Bench Press', 'Face Pull']);
  await input(page, 'Reps', 1).focus();
  await page.keyboard.press('Enter');
  await expect(input(page, 'Weight', 1)).toBeFocused();
  await page.reload();
  await expect(input(page, 'Reps', 1)).toHaveValue('12');
  await expect(input(page, 'Weight', 1)).toHaveValue('81.5');
  const resumed = await stored(page);
  expect(resumed.active.controller.running).toEqual(before.active.controller.running);
  expect(resumed.active.controller.phaseStarted).toBe(before.active.controller.phaseStarted);
  expect(resumed.active.exercises.map((e: any) => e.name)).toEqual([
    'Chest Dip',
    'Bench Press',
    'Face Pull',
  ]);
  expect(resumed.history).toEqual(before.history);
});

for (const [intensity, count] of [
  ['EASY', 1],
  ['HARD', 4],
] as const) {
  test(`${intensity} flexible imported workout traverses exactly ${count} sets`, async ({
    page,
  }) => {
    const plan = parseProgram(
      textDocument(`Program: Flexible\nWorkout A ${intensity}\n- Squat ${count}x6-8`),
    );
    const data = applyProgram(emptyData(), plan, true);
    await page.addInitScript((data) => {
      if (!localStorage.getItem('strength-tracker-v1'))
        localStorage.setItem('strength-tracker-v1', JSON.stringify(data));
    }, data);
    await page.goto('/strength-tracker/');
    await page.getByRole('button', { name: /^START WORKOUT/ }).click();
    const before = await stored(page);
    await input(page, 'Reps', 1, 'Squat').focus();
    for (let set = 1; set <= count; set++) {
      await expect(input(page, 'Reps', set, 'Squat')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(input(page, 'Weight', set, 'Squat')).toBeFocused();
      await page.keyboard.press('Enter');
    }
    await expect(next(page)).toHaveCount(0);
    const after = await stored(page);
    // Existing blur handling materializes default card-expansion cache entries;
    // assert the visible expansion and every workout/controller behavior separately.
    const { controller: beforeController, ...beforeWorkout } = before.active;
    const { controller: afterController, ...afterWorkout } = after.active;
    const {
      exerciseCards: _beforeCards,
      pendingCardCollapse: _beforePending,
      ...beforeState
    } = beforeController;
    const {
      exerciseCards: _afterCards,
      pendingCardCollapse: _afterPending,
      ...afterState
    } = afterController;
    expect(afterWorkout).toEqual(beforeWorkout);
    expect(afterState).toEqual(beforeState);
    await expect(page.getByRole('button', { name: 'Collapse Squat', exact: true })).toBeVisible();
    expect(after.trainingProgram).toEqual(before.trainingProgram);
  });
}
