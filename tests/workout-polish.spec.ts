import { test, expect } from '@playwright/test';
async function begin(page: import('@playwright/test').Page) {
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
}
test('one running set spinner becomes a checkmark and floating bubble follows all phases', async ({
  page,
}) => {
  await begin(page);
  const bubble = page.getByRole('button', { name: 'Move floating timer', exact: true });
  await expect(bubble).toContainText('Warm-up');
  await expect(page.getByLabel('Floating elapsed time')).toHaveText(/00:0[0-2]/);
  await page.getByLabel('Weight Bench Press set 1', { exact: true }).fill('80');
  await page.getByLabel('Reps Bench Press set 1', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Set in progress', exact: true })).toHaveCount(1);
  await expect(bubble).toContainText('Set');
  await expect(
    page.getByRole('button', { name: 'Complete Bench Press set 1', exact: true }),
  ).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Select Bench Press set 2', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Set in progress', exact: true })).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Complete Bench Press set 2', exact: true }),
  ).not.toHaveAttribute('aria-busy', 'true');
  await page.clock.setSystemTime(Date.now() + 65000);
  await expect(page.getByLabel('Floating elapsed time')).toHaveText(/01:0[5-9]/);
  await page.screenshot({ path: 'test-results/active-set-spinner-and-bubble.png' });
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Set in progress', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Undo Bench Press set 1', exact: true }),
  ).toHaveText('✓');
  await expect(bubble).toContainText('Rest');
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(bubble).toHaveCount(0);
  await expect(page.getByLabel('Current phase')).toHaveText('Rest');
  await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText('Rest');
});
test('bubble drags without switching screens and position survives scroll, screen changes and reload', async ({
  page,
}) => {
  await begin(page);
  const bubble = page.getByRole('button', { name: 'Move floating timer', exact: true });
  const before = await bubble.boundingBox();
  await page.mouse.move(before!.x + 38, before!.y + 38);
  await page.mouse.down();
  await page.mouse.move(65, 135, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'EXERCISES', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const moved = await bubble.boundingBox();
  expect(moved!.x).toBeLessThan(before!.x - 100);
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await page.evaluate(() => scrollBy(0, 350));
  const scrolled = await bubble.boundingBox();
  expect(scrolled!.x).toBeCloseTo(moved!.x, 0);
  expect(scrolled!.y).toBeCloseTo(moved!.y, 0);
  await page.getByRole('tab', { name: 'TIMER', exact: true }).click();
  await expect(bubble).toHaveCount(0);
  await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
  expect((await bubble.boundingBox())!.x).toBeCloseTo(moved!.x, 0);
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(bubble).toBeVisible();
  expect((await bubble.boundingBox())!.x).toBeCloseTo(moved!.x, 0);
  await bubble.focus();
  await page.keyboard.press('ArrowRight');
  expect((await bubble.boundingBox())!.x).toBeGreaterThan(moved!.x);
  const button = await page.getByRole('button', { name: 'START SET', exact: true }).boundingBox();
  const r = await bubble.boundingBox();
  expect(r!.y + r!.height).toBeLessThan(button!.y);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect
    .poll(async () => {
      const r = await bubble.boundingBox();
      return r!.x + r!.width;
    })
    .toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'test-results/floating-timer-bubble-mobile.png' });
});
