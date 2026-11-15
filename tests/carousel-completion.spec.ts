import { test, expect, type Page } from '@playwright/test';
import { calendarFixture, noon, savedSession } from './calendar-fixture';
import { currentProgram } from '../src/programs';
import { configureCalendar } from '../src/auto-selection';
import { applyProgram } from '../src/importing/saving';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { stored } from './exercise-fixture';
import { mkdirSync } from 'node:fs';
import type { Data } from '../src/data';
function fixture() {
  let d = calendarFixture();
  d = configureCalendar(d, { ...currentProgram(d)!.calendar!, anchorWeek: 2 });
  const w = savedSession(d, 2, 'Saturday', '2026-11-14');
  w.started = w.finished! - 6114000;
  let remaining = 16;
  while (w.exercises.flatMap((e) => e.sets).length < 16)
    w.exercises[0].sets.push({ id: crypto.randomUUID(), done: false, weight: '', reps: '' });
  for (const e of w.exercises)
    for (const s of e.sets) {
      s.done = remaining-- > 0;
    }
  w.exercises.push({
    id: 'unperformed',
    name: 'Skipped prescribed exercise',
    rest: null,
    skipped: true,
    sets: [{ id: 'unperformed-set', done: false, reps: '', weight: '', skipped: true }],
  });
  d.history = [
    w,
    savedSession(d, 2, 'Friday', '2026-11-13'),
    savedSession(d, 2, 'Thursday', '2026-11-12'),
    savedSession(d, 2, 'Tuesday', '2026-11-10'),
  ];
  return d;
}
async function seed(page: Page, d: Data, date = '2026-11-15') {
  await page.clock.setSystemTime(noon(date));
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, d);
  await page.goto('/strength-tracker/');
}
async function hammer(page: Page) {
  await page.getByRole('button', { name: 'Week 2', exact: true }).click();
  await page.getByRole('button', { name: 'Select Hammer Press Day', exact: true }).click();
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Hammer Press Day');
}
for (const size of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
]) {
  test(`completed foreground and background cards, manual weeks, repeat guard and reload at ${size.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const d = fixture();
    await seed(page, d);
    await hammer(page);
    await expect(page.locator('.calendar-context')).toHaveText('Completed');
    await expect(page.locator('.stack-front .card-completion')).toContainText('Completed');
    await expect(page.locator('.stack-front .stack-intensity')).toHaveText('EASY');
    await expect(page.locator('.stack-previous.is-completed .card-completion')).toBeVisible();
    await expect(page.locator('.stack-next.is-completed .card-completion')).toBeVisible();
    await expect(page.locator('.stack-next .peek-completion')).toBeVisible();
    await expect(page.locator('.stack-previous .peek-completion')).toBeVisible();
    expect(
      await page
        .locator('.stack-previous .photo')
        .evaluate((el) => getComputedStyle(el, '::after').backgroundColor),
    ).toBe('rgba(17, 94, 65, 0.18)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (size.width === 390) {
      mkdirSync('/tmp/carousel-completion', { recursive: true });
      await page.screenshot({
        path: '/tmp/carousel-completion/foreground.png',
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Select Leg Day', exact: true }).click();
      await page.screenshot({
        path: '/tmp/carousel-completion/background.png',
        animations: 'disabled',
      });
      await hammer(page);
    }
    const before = await stored(page);
    expect(
      before.history[0].exercises.flatMap((e: any) => e.sets).filter((s: any) => s.done),
    ).toHaveLength(16);
    expect(before.history[0].finished - before.history[0].started).toBe(6114000);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: /^START WORKOUT/ }).click();
    expect((await stored(page)).active).toBeNull();
    await page.getByRole('button', { name: 'Week 1', exact: true }).click();
    await expect(page.locator('.stack-front.is-completed')).toHaveCount(0);
    await hammer(page);
    await expect(page.locator('.calendar-context')).toHaveText('Completed');
    // Reload may auto-select the next week. Manually revisiting the completed card stays correct.
    await page.reload();
    await hammer(page);
    await expect(page.locator('.stack-front.is-completed')).toBeVisible();
    expect((await stored(page)).history).toEqual(before.history);
    if (size.width === 390) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page
        .locator('#training-program')
        .selectOption(d.programs!.find((p) => p.id !== d.activeProgramId)!.id);
      await page.getByRole('button', { name: 'Train', exact: true }).click();
      await expect(page.locator('.is-completed')).toHaveCount(0);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.locator('#training-program').selectOption(d.activeProgramId!);
      await page.getByRole('button', { name: 'Train', exact: true }).click();
      await hammer(page);
      await expect(page.locator('.calendar-context')).toHaveText('Completed');
    }
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /^START WORKOUT/ }).click();
    const repeated = await stored(page);
    expect(repeated.history).toEqual(before.history);
    expect(repeated.active.id).not.toBe(before.history[0].id);
    expect(repeated.active.scheduledFor).toBe('2026-11-14');
  });
}

test('saved completion, deletion and validated backup restore immediately update a two-day plan', async ({
  page,
}) => {
  let d = applyProgram(
    calendarFixture(),
    parseProgram(textDocument('Program: Two days\nTuesday: A\n- Press 1x8\nFriday: B\n- Row 1x8')),
    true,
  );
  d = configureCalendar(d, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: {},
  });
  await seed(page, d, '2026-11-10');
  await page.getByRole('button', { name: /^START WORKOUT/ }).click();
  await page.getByLabel('Reps Press set 1', { exact: true }).fill('8');
  await page.getByLabel('Weight Press set 1', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Done editing Press', exact: true }).click();
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await page.clock.setSystemTime(noon('2026-11-10') + 3000);
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Select A', exact: true }).click();
  await expect(page.locator('.calendar-context')).toHaveText('Completed');
  const saved = await stored(page);
  await expect(page.locator('.pagination button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete session', exact: true }).click();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('.stack-front.is-completed')).toHaveCount(0);
  await expect(page.locator('.calendar-context')).toHaveText("TODAY'S WORKOUT");
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page
    .getByRole('checkbox', {
      name: 'I confirm restoring this backup’s plans and settings and merging its history.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Confirm Restore Data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Data restored.' })).toBeVisible();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'Select A', exact: true }).click();
  await expect(page.locator('.calendar-context')).toHaveText('Completed');
  expect((await stored(page)).history).toEqual(saved.history);
});
