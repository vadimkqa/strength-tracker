import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseTrainingPlan, applyImportedPlan } from '../src/plan-import';
import { emptyData } from '../src/data';
const draft = parseTrainingPlan(readFileSync('tests/fixtures/GYM.txt', 'utf8'));
draft.rows.forEach((r) => (r.reviewed = true));
const data = applyImportedPlan(emptyData(), draft, true);
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [393, 852],
]) {
  test(`compact rows and single sticky header survive long exercise scrolling at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (d) => localStorage.setItem('strength-tracker-v1', JSON.stringify(d)),
      data,
    );
    await page.goto('/strength-tracker/');
    await page.getByRole('button', { name: 'START WORKOUT' }).click();
    const header = page.getByLabel('Set logging columns', { exact: true });
    await expect(header).toHaveCount(1);
    const first = page.locator('.exercise').first();
    const row = first.locator('.performance-row').first();
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(88);
    await expect(row.locator('.previous-set')).toHaveText('No previous performance');
    await expect(row.locator('.prescription-per-set')).toContainText('6 reps · no fail');
    for (const control of await row.locator('input,button').all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(Math.round(box.width * 100) / 100).toBeGreaterThanOrEqual(44);
    }
    for (const i of [0, 2, 5, 1]) {
      const exercise = page.locator('.exercise').nth(i);
      await exercise.evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await expect
        .poll(async () => (await page.locator('.workout-sticky-controls').boundingBox())!.y)
        .toBeCloseTo(0, 0);
      const tabs = (await page.getByRole('tablist', { name: 'Workout screens' }).boundingBox())!;
      const head = (await header.boundingBox())!;
      expect(head.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
      const title = (await exercise.getByRole('heading').boundingBox())!;
      expect(title.y).toBeGreaterThanOrEqual(head.y + head.height);
      await expect(header).toHaveCount(1);
    }
    const field = page.getByLabel('Weight Bench press set 3', { exact: true });
    await field.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await field.fill('95');
    await expect(field).toBeFocused();
    expect(
      await field.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    const bounds = (await field.boundingBox())!,
      head = (await header.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(head.y + head.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByLabel('Reps Bench press set 3', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Select Bench press set 3', exact: true }).click();
    await page.getByRole('button', { name: 'START SET', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Set in progress' })).toHaveCount(1);
    const bubble = page.getByRole('button', { name: 'Move floating timer', exact: true });
    const before = (await bubble.boundingBox())!;
    await page.mouse.move(before.x + 38, before.y + 38);
    await page.mouse.down();
    await page.mouse.move(60, 160, { steps: 12 });
    await page.mouse.up();
    expect((await bubble.boundingBox())!.x).toBeLessThan(before.x);
    await page.screenshot({ path: `test-results/compact-logging-${width}.png` });
    await first.dispatchEvent('pointerdown', { clientX: 300, clientY: 250, pointerType: 'touch' });
    await first.dispatchEvent('pointerup', { clientX: 80, clientY: 250, pointerType: 'touch' });
    await expect(page.getByRole('tab', { name: 'TIMER', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(header).toHaveCount(0);
    await expect(bubble).toHaveCount(0);
    await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
    await expect(header).toHaveCount(1);
    await expect(bubble).toBeVisible();
    await expect(page.getByRole('status', { name: 'Set in progress' })).toHaveCount(1);
    const nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
    const action = (await page
      .getByRole('button', { name: 'STOP SET', exact: true })
      .boundingBox())!;
    expect(action.y + action.height).toBeLessThan(nav.y);
  });
}
