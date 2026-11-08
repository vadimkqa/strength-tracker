import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseTrainingPlan, applyImportedPlan } from '../src/plan-import';
import { emptyData } from '../src/data';
const draft = parseTrainingPlan(readFileSync('tests/fixtures/GYM.txt', 'utf8'));
draft.rows.forEach((r) => (r.reviewed = true));
const data = applyImportedPlan(emptyData(), draft, true);
test.beforeEach(async ({ page }) => {
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, data);
  await page.goto('/strength-tracker/');
});
test('four positions wrap weeks both ways and manual dropdown retains the selected day', async ({
  page,
  context,
}) => {
  const week = page.getByLabel('TRAINING ROTATION', { exact: true }),
    front = page.locator('.stack-front'),
    region = page.getByRole('region', { name: 'Workout selection', exact: true });
  await expect(page.locator('.pagination button')).toHaveCount(4);
  await expect(page.locator('.stack-card')).toHaveCount(4);
  const cdp = await context.newCDPSession(page);
  async function swipe(forward: boolean) {
    await region.scrollIntoViewIfNeeded();
    const r = (await region.boundingBox())!,
      y = r.y + 65,
      start = forward ? 300 : 80,
      end = forward ? 80 : 300;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start, y }],
    });
    for (let i = 1; i <= 12; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start + ((end - start) * i) / 12, y }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.getByRole('button', { name: 'Select Leg Day', exact: true }).click();
  await swipe(true);
  await expect(front).toHaveAttribute('aria-label', 'Bench Day');
  await expect(week).toHaveValue('2');
  await swipe(false);
  await expect(front).toHaveAttribute('aria-label', 'Leg Day');
  await expect(week).toHaveValue('1');
  await week.selectOption('2');
  await expect(front).toHaveAttribute('aria-label', 'Leg Day');
  await swipe(true);
  await expect(front).toHaveAttribute('aria-label', 'Bench Day');
  await expect(week).toHaveValue('1');
  await swipe(false);
  await expect(front).toHaveAttribute('aria-label', 'Leg Day');
  await expect(week).toHaveValue('2');
  await page.getByRole('button', { name: 'Select DB Press Day', exact: true }).click();
  await week.selectOption('1');
  await expect(front).toHaveAttribute('aria-label', 'DB Press Day');
  await expect(page.getByRole('button', { name: 'EASY', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await week.selectOption('2');
  await expect(front).toHaveAttribute('aria-label', 'DB Press Day');
  await expect(page.getByRole('button', { name: 'HARD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(week).toHaveValue('2');
  await expect(front).toHaveAttribute('aria-label', 'DB Press Day');
});
test('manual intensity override preserves selected week and exact imported template', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'EASY', exact: true }).click();
  await expect(page.getByLabel('TRAINING ROTATION', { exact: true })).toHaveValue('1');
  await expect(page.locator('.stack-front .stack-intensity')).toHaveText('EASY');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(
    page.getByRole('heading', { name: 'Week 1 · Tuesday · Bench Day · Hard', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Weight Bench press set/ })).toHaveCount(4);
});
test('side-card taps change the week exactly once at either boundary', async ({ page }) => {
  await page.getByRole('button', { name: 'Select Leg Day', exact: true }).click();
  const front = page.locator('.stack-front');
  const week = page.getByLabel('TRAINING ROTATION', { exact: true });
  async function tapSide(side: string) {
    await page.locator('.playing-stack').scrollIntoViewIfNeeded();
    // Wait for the existing card transform before tapping its exposed outer edge.
    await page.waitForTimeout(400);
    const box = (await page.locator(side).boundingBox())!;
    await page.touchscreen.tap(
      side === '.stack-next' ? Math.min(386, box.x + box.width - 8) : Math.max(4, box.x + 8),
      box.y + box.height * 0.25,
    );
  }
  await tapSide('.stack-next');
  await expect(front).toHaveAttribute('aria-label', 'Bench Day');
  await expect(week).toHaveValue('2');
  await tapSide('.stack-previous');
  await expect(front).toHaveAttribute('aria-label', 'Leg Day');
  await expect(week).toHaveValue('1');
});
