import { test, expect } from '@playwright/test';
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [393, 852],
])
  test(`form focus keeps viewport width and scale stable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/strength-tracker/');
    const meta = await page.locator('meta[name=viewport]').getAttribute('content');
    expect(meta).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Source text and workout aliases', { exact: true }).click();
    const sizes = await page
      .locator('input,select,textarea')
      .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes.every((s) => s >= 16)).toBe(true);
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page.getByRole('button', { name: 'START WORKOUT' }).click();
    const initial = await page.evaluate(() => ({
      width: innerWidth,
      scale: visualViewport!.scale,
    }));
    for (const field of ['Weight Bench Press set 1', 'Reps Bench Press set 1']) {
      const input = page.getByLabel(field, { exact: true });
      await input.focus();
      await input.fill(field.startsWith('Weight') ? '60' : '8');
      expect(
        await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      ).toBeGreaterThanOrEqual(16);
      expect(await page.evaluate(() => innerWidth)).toBe(initial.width);
      expect(await page.evaluate(() => visualViewport!.scale)).toBe(initial.scale);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(
      await page.locator('.workout-controller').evaluate((e) => getComputedStyle(e).touchAction),
    ).toContain('pinch-zoom');
    expect(
      await page
        .getByRole('button', { name: 'START SET', exact: true })
        .evaluate((e) => getComputedStyle(e).touchAction),
    ).toBe('manipulation');
    expect(
      await page.locator('.timer-bubble').evaluate((e) => getComputedStyle(e).touchAction),
    ).toBe('none');
  });
test('editing uses native document flow instead of moving fixed chrome by a keyboard offset', async ({
  page,
}) => {
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  const field = page.getByLabel('Weight Bench Press set 1', { exact: true });
  await field.focus();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'height', {
      configurable: true,
      value: innerHeight - 300,
    });
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 20 });
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-workout-keyboard', 'true');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await expect(page.locator('.timer-bubble')).toBeHidden();
  expect(
    await page.locator('.workout-floating-action').evaluate((e) => getComputedStyle(e).position),
  ).toBe('static');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--keyboard-offset'),
    ),
  ).toBe('');
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'scale', { configurable: true, value: 1.5 });
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(
    /maximum-scale|user-scalable\s*=\s*no/,
  );
  await page.getByRole('button', { name: 'Done editing Bench Press', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: innerHeight });
    Object.defineProperty(visualViewport!, 'scale', { configurable: true, value: 1 });
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 0 });
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-workout-keyboard', 'true');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  expect(
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .evaluate((e) => getComputedStyle(e).bottom),
  ).toBe('0px');
});
