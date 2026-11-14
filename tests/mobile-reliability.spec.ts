import { test, expect, type Page } from '@playwright/test';
import { beginCards, stored } from './exercise-fixture';
const plan =
  'Program: Two Day Strength\nWeek 1\nTuesday: Upper Body\n- Bench Press 3x8-12\n- Row 2x10\nFriday: Lower Body\n- Squat 3x5-8\nOptional: Plank';
async function viewport(page: Page, height: number, top = 0, layoutHeight?: number) {
  await page.evaluate(
    ({ height, top, layoutHeight }) => {
      Object.defineProperty(visualViewport!, 'height', { configurable: true, value: height });
      Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: top });
      if (layoutHeight)
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: layoutHeight });
      visualViewport!.dispatchEvent(new Event('resize'));
    },
    { height, top, layoutHeight },
  );
}
for (const size of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
]) {
  test(`keyboard panning, dismissal, app resume and persistence at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    // Standalone flags are a simulation; this does not emulate the native iOS keyboard.
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
    );
    await beginCards(page);
    const padding = await page.locator('main').evaluate((e) => getComputedStyle(e).paddingBottom);
    const field = page.getByLabel('Weight Bench Press set 1', { exact: true }),
      reps = page.getByLabel('Reps Bench Press set 1', { exact: true });
    await field.fill('72.5');
    await reps.fill('9');
    await field.focus();
    await viewport(page, size.height - 320, 70);
    await expect(page.locator('html')).toHaveAttribute('data-workout-keyboard', 'true');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Move floating timer' })).toBeHidden();
    expect(
      await page.locator('.workout-floating-action').evaluate((e) => getComputedStyle(e).position),
    ).toBe('static');
    expect(await page.locator('main').evaluate((e) => getComputedStyle(e).paddingBottom)).toBe(
      padding,
    );
    await expect
      .poll(async () => {
        const r = (await field.boundingBox())!;
        return r.y >= 78 && r.y + r.height <= 70 + size.height - 320 - 8;
      })
      .toBe(true);
    expect(
      await field.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const before = await stored(page);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
    });
    await expect(field).toHaveValue('72.5');
    await expect(field).toBeFocused();
    const title = page.getByRole('button', { name: 'Bench Press details', exact: true });
    // Header holds while typing must not activate a sensor or steal focus.
    const box = (await title.boundingBox())!;
    await title.dispatchEvent('mousedown', { button: 0, clientX: box.x + 20, clientY: box.y + 20 });
    await page.waitForTimeout(500);
    await expect(page.locator('.exercise-dragging')).toHaveCount(0);
    await expect(field).toBeFocused();
    await page.mouse.up();
    if (size.width === 390) {
      // Honest, test-only occlusion overlay: no production keyboard artwork or behavior is faked.
      await page.evaluate(() => {
        const overlay = document.createElement('div');
        overlay.id = 'keyboard-simulation';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.cssText =
          'position:fixed;bottom:0;left:0;right:0;height:250px;z-index:1000;background:#1b1722;color:#ddd;padding:12px;box-sizing:border-box;pointer-events:none';
        overlay.innerHTML =
          '<div style="text-align:center;font:11px sans-serif;margin-bottom:12px">SIMULATED KEYBOARD OCCLUSION · NOT NATIVE iOS</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' +
          ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
            .map(
              (k) =>
                '<span style="text-align:center;background:#302939;border-radius:6px;padding:10px;font:20px sans-serif">' +
                k +
                '</span>',
            )
            .join('') +
          '</div>';
        document.body.append(overlay);
      });
      await page.screenshot({ path: '/tmp/urgent-keyboard-390.png', animations: 'disabled' });
      await page.locator('#keyboard-simulation').evaluate((e) => e.remove());
    }
    await page.getByRole('button', { name: 'Done editing Bench Press', exact: true }).click();
    // Safari may emit focusout before the keyboard animation. Keep chrome hidden in that gap.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
    await viewport(page, size.height);
    await expect(page.locator('html')).not.toHaveAttribute('data-workout-keyboard', 'true');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .evaluate((e) => getComputedStyle(e).bottom),
    ).toBe('0px');
    // The layout-viewport-resizing keyboard model must work without deriving another offset.
    await field.focus();
    await viewport(page, size.height - 300, 0, size.height - 300);
    await expect
      .poll(async () => {
        const r = (await field.boundingBox())!;
        return r.y + r.height <= size.height - 300 - 8;
      })
      .toBe(true);
    await page.getByRole('button', { name: 'Done editing Bench Press', exact: true }).click();
    await viewport(page, size.height, 0, size.height);
    await expect(page.locator('html')).not.toHaveAttribute('data-workout-keyboard', 'true');
    await page.reload();
    await expect(field).toHaveValue('72.5');
    await expect(reps).toHaveValue('9');
    const after = await stored(page);
    expect(after.active.exercises).toEqual(before.active.exercises);
    expect(after.active.controller.phaseStarted).toBe(before.active.controller.phaseStarted);
    expect(after.history).toEqual(before.history);
  });
}
test('two-day import has no optional warnings, keeps existing data and starts exact sessions with no forced intensity', async ({
  page,
}) => {
  await beginCards(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const before = await stored(page);
  await page
    .locator('#plan-file')
    .setInputFiles({ name: 'two-days.txt', mimeType: 'text/plain', buffer: Buffer.from(plan) });
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
  const preview = page.getByLabel('Editable program preview', { exact: true });
  await expect(preview).toContainText('1 week · 2 sessions · 4 exercises · 0 unresolved warnings');
  await expect(preview.locator('.compact-warning,.import-warning')).toHaveCount(0);
  await expect(preview).not.toContainText('Intensity unspecified');
  await expect(preview.getByRole('combobox', { name: 'WEEK', exact: true })).toHaveCount(0);
  await preview
    .getByRole('checkbox', {
      name: 'I confirm saving this independent program and making it active; preserve existing programs, history and unspecified values',
      exact: true,
    })
    .check();
  await expect(
    page.getByRole('button', { name: 'Apply imported program', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Apply imported program', exact: true }).click();
  await expect(preview.getByRole('status').filter({ hasText: 'Plan applied.' })).toBeVisible();
  await preview
    .getByRole('heading', { name: 'Review training program', exact: true })
    .evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '/tmp/urgent-import-two-days.png', animations: 'disabled' });
  const saved = await stored(page);
  expect(saved.history).toEqual(before.history);
  expect(saved.active).toEqual(before.active);
  expect(saved.programs).toHaveLength(before.programs.length + 1);
  // End neither an old session nor its logs: a reload still resumes that exact session.
  await page.reload();
  expect((await stored(page)).active).toEqual(before.active);
});
test('named two-day plan without any classifications uses the universal preview instead of legacy hard/easy validation', async ({
  page,
}) => {
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#plan-file').setInputFiles({
    name: 'simple.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Program: Simple\nBench Day\n- Press 2x8-12\nLeg Day\n- Squat 3x5'),
  });
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
  const preview = page.getByLabel('Editable program preview', { exact: true });
  await expect(preview).toContainText('0 unresolved warnings');
  await preview
    .getByRole('checkbox', {
      name: 'I confirm saving this independent program and making it active; preserve existing programs, history and unspecified values',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Apply imported program', exact: true }).click();
  await expect(preview.getByRole('status').filter({ hasText: 'Plan applied.' })).toBeVisible();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('.pagination button')).toHaveCount(2);
  await expect(page.locator('.week-segments')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Leg Day', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.getByRole('heading', { name: 'Squat', exact: true })).toBeVisible();
  expect((await stored(page)).active.week).toBe('');
  expect((await stored(page)).active.exercises[0].sets).toHaveLength(3);
});

test('running set survives editing, background return and a subsequent exercise reorder', async ({
  page,
}) => {
  await beginCards(page);
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  const field = page.getByLabel('Weight Bench Press set 1', { exact: true });
  await field.fill('82.5');
  await page.getByLabel('Reps Bench Press set 1', { exact: true }).fill('7');
  const before = await stored(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + 180000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
  });
  await expect(page.locator('.set-spinner')).toBeVisible();
  await expect(page.getByLabel('Reps Bench Press set 1', { exact: true })).toHaveValue('7');
  await page.getByRole('button', { name: 'Done editing Bench Press', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-workout-keyboard', 'true');
  await page.getByRole('button', { name: 'Collapse Bench Press', exact: true }).click();
  const source = page.getByRole('button', { name: 'Chest Dip details', exact: true });
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!,
    b = (await page
      .getByRole('button', { name: 'Bench Press details', exact: true })
      .boundingBox())!;
  await page.mouse.move(a.x + 50, a.y + a.height / 2);
  await page.mouse.down();
  await expect(page.locator('.exercise-dragging')).toHaveCount(1);
  await page.mouse.move(a.x + 50, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator('.exercise-heading')
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))),
    )
    .toEqual(['Chest Dip', 'Bench Press', 'Face Pull']);
  const after = await stored(page);
  expect(after.active.controller.running).toEqual(before.active.controller.running);
  expect(after.active.controller.phaseStarted).toBe(before.active.controller.phaseStarted);
  expect(after.active.controller.phase).toBe('set');
  expect(after.active.exercises.find((e: any) => e.name === 'Bench Press').sets).toEqual(
    before.active.exercises[0].sets,
  );
  await page.reload();
  expect((await stored(page)).active).toEqual(after.active);
});
