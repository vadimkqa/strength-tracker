import { test, expect, type Page } from '@playwright/test';
import { emptyData, createWorkout } from '../src/data';
import { applyProgram } from '../src/importing/saving';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { programIssues } from '../src/importing/model';
import { activateProgram, migratePrograms } from '../src/programs';
import { stored, advanceClock, beginCards } from './exercise-fixture';
const parse = (text: string) => {
  const p = parseProgram(textDocument(text));
  programIssues(p).forEach((i) => (i.reviewed = true));
  return p;
};
function fixture() {
  let d = applyProgram(
    emptyData(),
    parse(
      'Program: Alpha\nWeek 1\nTuesday: Push HARD\n- Bench Press 2x6 rest 180s\n- Chest Dip 3x10\nWeek 2\nTuesday: Push EASY\n- Bench Press 3x12 rest 90s',
    ),
    true,
  );
  const id = d.activeProgramId!;
  d.history = [
    {
      ...createWorkout(d.trainingProgram!.workouts[0].id, 'heavy', d.plan),
      id: 'old-history',
      finished: 100,
    },
  ];
  d = applyProgram(d, parse('Program: Beta\nWorkout A:\n- Squat 3x5\nWorkout B:\n- Row 2x8'), true);
  return { data: d, alpha: id, beta: d.activeProgramId! };
}
async function seed(page: Page, data = fixture().data) {
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, data);
  await page.goto('/strength-tracker/');
}
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}
test('program/week/session hierarchy edits only one program and starts the exact active program', async ({
  page,
}) => {
  const f = fixture();
  await seed(page, f.data);
  await settings(page);
  await expect(page.locator('#training-program option')).toHaveCount(3);
  await expect(page.locator('#program-week')).toHaveCount(0);
  await expect(page.locator('#plan option')).toHaveCount(2);
  await expect(page.locator('#plan')).not.toContainText('Tuesday');
  await page.locator('#training-program').selectOption(f.alpha);
  await expect(page.locator('#program-week option')).toHaveCount(2);
  await expect(page.locator('#plan option')).toHaveCount(1);
  await expect(page.getByLabel('Exercise 1 name', { exact: true })).toHaveValue('Bench Press');
  await page.getByRole('button', { name: 'Move Chest Dip earlier', exact: true }).click();
  await expect(page.getByLabel('Exercise 1 name', { exact: true })).toHaveValue('Chest Dip');
  await page.getByLabel('Exercise 1 name', { exact: true }).fill('Weighted Dip');
  await page.getByRole('button', { name: 'More sets Weighted Dip', exact: true }).click();
  await page.locator('#program-week').selectOption('2');
  await expect(page.getByLabel('Exercise 1 name', { exact: true })).toHaveValue('Bench Press');
  await expect(page.locator('.program-exercise')).toContainText('3 sets');
  await page.locator('#program-week').selectOption('1');
  await expect(page.getByLabel('Exercise 1 name', { exact: true })).toHaveValue('Weighted Dip');
  page.once('dialog', (d) => d.accept('My Training Program'));
  await page.getByRole('button', { name: 'Rename program', exact: true }).click();
  await expect(page.locator('#training-program')).toContainText('My Training Program');
  await page.locator('#training-program').selectOption(f.beta);
  await expect(page.locator('#program-week')).toHaveCount(0);
  await expect(page.getByLabel('Exercise 1 name', { exact: true })).toHaveValue('Squat');
  await page.locator('#training-program').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/program-hierarchy.png' });
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('.pagination button')).toHaveCount(2);
  await page.getByRole('region', { name: 'Workout selection', exact: true }).press('ArrowRight');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.getByRole('heading', { name: 'Row', exact: true })).toBeVisible();
  const d = await stored(page);
  expect(d.active.programId).toBe(f.beta);
  expect(d.active.exercises.map((e: any) => e.name)).toEqual(['Row']);
  expect(d.history).toEqual(f.data.history);
  const a = d.programs.find((p: any) => p.id === f.alpha);
  expect(a.program.workouts[0].exercises.map((e: any) => e.name)).toEqual([
    'Weighted Dip',
    'Bench Press',
  ]);
  expect(a.program.workouts[0].exercises[0].setCount).toBe(4);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Row', exact: true })).toBeVisible();
});
test('multiweek rotation and manual week selection start the selected week without losing program positions', async ({
  page,
}) => {
  const f = fixture();
  await seed(page, activateProgram(f.data, f.alpha));
  const region = page.getByRole('region', { name: 'Workout selection', exact: true });
  await expect(page.locator('#rotation-week')).toHaveAttribute('data-week', '1');
  await region.press('ArrowRight');
  await expect(page.locator('#rotation-week')).toHaveAttribute('data-week', '2');
  await region.press('ArrowRight');
  await expect(page.locator('#rotation-week')).toHaveAttribute('data-week', '1');
  await region.press('ArrowLeft');
  await expect(page.locator('#rotation-week')).toHaveAttribute('data-week', '2');
  await settings(page);
  await page.locator('#training-program').selectOption(f.beta);
  await page.locator('#training-program').selectOption(f.alpha);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('#rotation-week')).toHaveAttribute('data-week', '2');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  const d = await stored(page);
  expect(d.active.exercises[0].sets).toHaveLength(3);
  expect(d.active.exercises[0].sets[0].prescription.minReps).toBe(12);
  expect(d.active.programId).toBe(f.alpha);
});
test('legacy templates are separate programs and ambiguous ownership requires review', async ({
  page,
}) => {
  const d = emptyData();
  d.plan['Unknown imported workout'] = [['Custom Exercise', 2, null]];
  await seed(page, d);
  await settings(page);
  await expect(page.locator('#training-program option')).toHaveCount(2);
  const option = page.locator('#training-program option').filter({ hasText: 'Needs review' }),
    id = await option.getAttribute('value');
  await page.locator('#training-program').selectOption(id!);
  await expect(page.locator('#program-week')).toHaveCount(0);
  await expect(page.locator('#plan option')).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('ownership');
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeDisabled();
  await settings(page);
  await page
    .getByRole('button', {
      name: 'I reviewed this independent program and its original templates',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.getByRole('heading', { name: 'Custom Exercise', exact: true })).toBeVisible();
});
test('program-level notes editor does not invent sessions, weekdays or weeks', async ({ page }) => {
  const d = migratePrograms(emptyData());
  d.programs!.push({
    id: 'notes-only',
    name: 'Unstructured program',
    templates: {},
    notes: 'Review this program-level source.',
  });
  await seed(page, activateProgram(d, 'notes-only'));
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toHaveCount(0);
  await settings(page);
  await expect(page.locator('#program-week')).toHaveCount(0);
  await expect(page.locator('#plan')).toHaveCount(0);
  await page.getByText('Program notes and original source', { exact: true }).click();
  await page
    .getByLabel('Program notes', { exact: true })
    .fill('Reviewed without fabricated workouts');
  await stored(page);
  await page.reload();
  await settings(page);
  await page.getByText('Program notes and original source', { exact: true }).click();
  await expect(page.getByLabel('Program notes', { exact: true })).toHaveValue(
    'Reviewed without fabricated workouts',
  );
});
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [393, 852],
])
  test(`compact set controls preserve session state and require confirmation at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await beginCards(page);
    const card = page.locator('.exercise-card').first();
    const add = card.getByRole('button', { name: 'Add set to Bench Press', exact: true }),
      remove = card.getByRole('button', { name: 'Remove set from Bench Press', exact: true });
    await expect(add).toHaveText('+ Add set');
    await expect(remove).toHaveText('− Remove set');
    await add.scrollIntoViewIfNeeded();
    for (const control of [add, remove]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(
        await control.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      ).toBeLessThanOrEqual(12);
    }
    expect((await remove.boundingBox())!.x).toBeLessThan((await add.boundingBox())!.x - 100);
    await add.click();
    await page.getByLabel('Weight Bench Press set 3', { exact: true }).fill('70');
    await page.getByLabel('Reps Bench Press set 3', { exact: true }).fill('8');
    await card.getByRole('button', { name: 'Select Bench Press set 3', exact: true }).click();
    await page.getByRole('button', { name: 'START SET', exact: true }).click();
    await advanceClock(page);
    page.once('dialog', (d) => d.dismiss());
    await remove.click();
    await expect(card.locator('.set-action.in-progress')).toHaveCount(1);
    expect((await stored(page)).active.exercises[0].sets).toHaveLength(3);
    page.once('dialog', (d) => d.accept());
    await remove.click();
    await expect(page.getByRole('button', { name: 'START NEXT SET', exact: true })).toBeVisible();
    const data = await stored(page);
    expect(data.active.controller.phase).toBe('rest');
    expect(data.active.exercises[0].sets).toHaveLength(2);
    expect(data.active.controller.removedSets[0].set.weight).toBe('70');
    expect(data.active.controller.removedSets[0].set.timing.durationMs).toBeGreaterThanOrEqual(
      10000,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await remove.scrollIntoViewIfNeeded();
    const r = (await remove.boundingBox())!,
      action = (await page.locator('.workout-floating-action').boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(action.y);
    await page.screenshot({ path: `test-results/live-controls-${width}.png` });
    await page.reload();
    expect((await stored(page)).active.controller.removedSets).toHaveLength(1);
  });
