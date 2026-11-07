import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseTrainingPlan, applyImportedPlan } from '../src/plan-import';
import { emptyData } from '../src/data';
test('layered mobile cards show rotation metadata, side taps select the front workout and Start uses it', async ({
  page,
}) => {
  const draft = parseTrainingPlan(readFileSync('tests/fixtures/GYM.txt', 'utf8'));
  draft.rows.forEach((r) => (r.reviewed = true));
  const data = applyImportedPlan(emptyData(), draft, true);
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, data);
  await page.goto('/');
  const front = page.locator('.stack-front');
  await expect(front).toHaveAttribute('aria-label', 'Bench Day');
  await expect(front.locator('.stack-card-top')).toContainText('Tuesday');
  await expect(front.locator('.stack-card-top')).toContainText('Week 1');
  await expect(front.locator('.stack-intensity')).toHaveText('HEAVY');
  await expect(page.locator('.stack-previous')).toHaveCount(1);
  await expect(page.locator('.stack-next')).toHaveCount(1);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight - innerHeight));
  await page.screenshot({ path: 'test-results/playing-card-home-rotation.png' });
  await page.locator('.playing-stack').scrollIntoViewIfNeeded();
  const next = await page.locator('.stack-next').boundingBox();
  await page.touchscreen.tap(
    Math.min(386, next!.x + next!.width - 8),
    next!.y + next!.height * 0.25,
  );
  await expect(front).toHaveAttribute('aria-label', 'DB Press Day');
  await expect(front.locator('.stack-intensity')).toHaveText('EASY');
  await expect(front.locator('.stack-card-top')).toContainText('Thursday');
  await page.getByLabel('TRAINING ROTATION', { exact: true }).selectOption('2');
  await expect(front.locator('.stack-intensity')).toHaveText('HEAVY');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(
    page.getByRole('heading', { name: 'Week 2 · Thursday · DB Press Day · Hard', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cable row', exact: true })).toBeVisible();
});
test('stack keyboard navigation, small screen bounds and reduced motion remain accessible', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const region = page.getByRole('region', { name: 'Workout selection', exact: true });
  await region.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Leg Day');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.stack-front')).toHaveAttribute('aria-label', 'Bench Day');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await region.evaluate((e) => (e as HTMLElement).blur());
  await page.screenshot({ path: 'test-results/playing-card-home-small.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/playing-card-home.png', fullPage: true });
});
