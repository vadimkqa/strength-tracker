import { test, expect } from '@playwright/test';
import { beginCards, stored, advanceClock } from './exercise-fixture';
test('completed exercise collapses green, next opens, completed edits survive reload and the full workout can finish', async ({
  page,
}) => {
  const initial = await beginCards(page);
  page.on('dialog', (d) => d.accept());
  const first = page.locator('.exercise-card').nth(0),
    second = page.locator('.exercise-card').nth(1);
  await expect(
    first.getByRole('button', { name: 'Collapse Bench Press', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    second.getByRole('button', { name: 'Expand Chest Dip', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Weight Bench Press set 1', { exact: true })).toHaveValue('60');
  await first.getByRole('button', { name: 'Select Bench Press set 1', exact: true }).click();
  let d = await stored(page);
  expect(d.active.controller.phase).toBe('warmup');
  expect(d.active.exercises[0].sets[0].done).toBe(false);
  const bubble = page.getByRole('button', { name: 'Move floating timer', exact: true });
  for (let i = 0; i < 30; i++) await bubble.press('ArrowDown');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/exercise-expanded-review.png',
    animations: 'disabled',
  });
  for (const n of [1, 2]) {
    await page.getByLabel(`Reps Bench Press set ${n}`, { exact: true }).fill('8');
    await page
      .getByLabel(`Weight Bench Press set ${n}`, { exact: true })
      .fill(n === 1 ? '60' : '62.5');
    await advanceClock(page, 1000);
    await page
      .getByRole('button', { name: n === 1 ? 'START SET' : 'START NEXT SET', exact: true })
      .click();
    await expect(page.getByRole('status', { name: 'Set in progress' })).toHaveCount(1);
    await advanceClock(page);
    await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  }
  await expect(first.locator('.exercise-completion')).toBeVisible();
  await expect(first.locator('.exercise-thumbnail')).toBeVisible();
  await expect(
    first.getByRole('button', { name: 'Expand Bench Press', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(
    second.getByRole('button', { name: 'Collapse Chest Dip', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/exercise-completed-next-open.png',
    animations: 'disabled',
  });
  await first.getByRole('button', { name: 'Expand Bench Press', exact: true }).click();
  await page.getByLabel('Weight Bench Press set 1', { exact: true }).fill('65');
  await expect(
    first.getByRole('button', { name: 'Collapse Bench Press', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(first.locator('.set-action.done')).toHaveCount(2);
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(page.getByLabel('Current phase')).toHaveText('Rest');
  await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
  await expect(page.getByLabel('Weight Bench Press set 1', { exact: true })).toHaveValue('65');
  await stored(page);
  await page.reload();
  await expect(page.getByLabel('Weight Bench Press set 1', { exact: true })).toHaveValue('65');
  await expect(
    second.getByRole('button', { name: 'Collapse Chest Dip', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Reps Chest Dip set 1', { exact: true }).fill('12');
  await page.getByLabel('Weight Chest Dip set 1', { exact: true }).fill('25');
  await advanceClock(page, 1000);
  await page.getByRole('button', { name: 'START NEXT SET', exact: true }).click();
  await stored(page);
  await advanceClock(page, 180000);
  await page.reload();
  await expect(second.locator('.set-action.in-progress')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'STOP SET', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  d = await stored(page);
  expect(d.active.exercises[1].sets[0].timing.durationMs).toBeGreaterThanOrEqual(180000);
  expect(d.history).toEqual(initial.history);
  await page.getByRole('button', { name: 'Expand Face Pull', exact: true }).click();
  await page.getByLabel('Set options for Face Pull', { exact: true }).click();
  await page.getByRole('button', { name: 'Skip exercise', exact: true }).click();
  await expect(page.locator('.exercise-card').nth(2).locator('.exercise-completion')).toHaveCount(
    0,
  );
  await page.getByLabel('Reps Chest Dip set 2', { exact: true }).fill('12');
  await page.getByLabel('Weight Chest Dip set 2', { exact: true }).fill('25');
  await advanceClock(page);
  await page.getByRole('button', { name: 'START NEXT SET', exact: true }).click();
  await advanceClock(page);
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  await expect(second.locator('.exercise-completion')).toBeVisible();
  await page.getByRole('button', { name: 'FINISH WORKOUT', exact: true }).click();
  d = await stored(page);
  expect(d.active).toBeNull();
  expect(d.history).toHaveLength(2);
  expect(d.history.find((w: any) => w.id === initial.history[0].id)).toEqual(initial.history[0]);
  expect(d.history[0].exercises[0].sets[0].weight).toBe('65');
  expect(d.history[0].exercises[2].skipped).toBe(true);
  expect(d.plan).toEqual(initial.plan);
});
test('missing last-set data never collapses the card and resolution waits until input editing ends', async ({
  page,
}) => {
  await beginCards(page);
  await page.getByLabel('Set options for Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: 'Complete Bench Press set 1', exact: true }).click();
  await page.getByLabel('Reps Bench Press set 2', { exact: true }).fill('');
  await page.getByLabel('Weight Bench Press set 2', { exact: true }).fill('');
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await advanceClock(page);
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  const first = page.locator('.exercise-card').first();
  await expect(
    first.getByRole('button', { name: 'Collapse Bench Press', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(first.locator('.exercise-completion')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Set timing saved');
  const before = await stored(page);
  expect(before.active.exercises[0].sets[1].needsLogging).toBe(true);
  await page.getByLabel('Weight Bench Press set 2', { exact: true }).fill('60');
  await page.getByLabel('Reps Bench Press set 2', { exact: true }).fill('8');
  await expect(
    first.getByRole('button', { name: 'Collapse Bench Press', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Reps Bench Press set 2', { exact: true }).blur();
  await expect(
    first.getByRole('button', { name: 'Expand Bench Press', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  const after = await stored(page);
  expect(after.active.exercises[0].sets[1].timing).toEqual(
    before.active.exercises[0].sets[1].timing,
  );
  expect(after.active.exercises[0].sets[1].done).toBe(true);
});
test('skipped sets remain distinct, manual card choices persist and set edits use stable record IDs', async ({
  page,
}) => {
  await beginCards(page);
  await page.getByLabel('Set options for Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: 'Complete Bench Press set 1', exact: true }).click();
  await page.getByRole('button', { name: 'Skip Bench Press set 2', exact: true }).click();
  const first = page.locator('.exercise-card').first();
  await expect(first.locator('.exercise-completion')).toHaveCount(0);
  await expect(first.locator('.set-skipped')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Bench Press', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Collapse Chest Dip', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Add set to Chest Dip', exact: true }).click();
  let d = await stored(page);
  const id = d.active.exercises[1].sets[2].id;
  await page.getByLabel('Weight Chest Dip set 3', { exact: true }).fill('32.5');
  await page.getByLabel('Reps Chest Dip set 3', { exact: true }).fill('10');
  await stored(page);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Expand Bench Press', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Weight Chest Dip set 3', { exact: true })).toHaveValue('32.5');
  d = await stored(page);
  expect(d.active.exercises[1].sets.find((s: any) => s.id === id).weight).toBe('32.5');
  expect(d.active.exercises[0].sets[1].skipped).toBe(true);
  expect(d.active.exercises[0].sets[1].done).toBe(false);
});
