import { test, expect, type Page } from '@playwright/test';
import { createWorkout } from '../src/data';
import { beginCards, stored, advanceClock, cardFixture } from './exercise-fixture';

const names = async (page: Page) =>
  page
    .locator('.exercise-heading')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
async function touchDrag(page: Page, from: string, to: string, screenshot?: string) {
  const source = page.getByRole('button', { name: `${from} details`, exact: true });
  // CDP coordinates need the same layout stability checks as Playwright's tap action.
  await source.scrollIntoViewIfNeeded();
  const a = await source.boundingBox();
  const b = await page.getByRole('button', { name: `${to} details`, exact: true }).boundingBox();
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  const cdp = await page.context().newCDPSession(page);
  const x = a!.x + a!.width / 2,
    y = a!.y + a!.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await expect(page.locator('.exercise-dragging')).toHaveCount(1);
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + ((b!.y + b!.height / 2 - y) * i) / 12 }],
    });
    await page.waitForTimeout(20);
  }
  if (screenshot) await page.screenshot({ path: screenshot, animations: 'disabled' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(page.locator('.exercise-dragging')).toHaveCount(0);
}

test('iPhone long press reorders, preserves entered data, expansion and plans after reload', async ({
  page,
}) => {
  await beginCards(page);
  await page
    .getByRole('spinbutton', { name: 'Weight Bench Press set 1', exact: true })
    .fill('72.5');
  await page.getByRole('spinbutton', { name: 'Reps Bench Press set 1', exact: true }).fill('9');
  await page.getByRole('button', { name: 'Collapse Bench Press', exact: true }).click();
  const before = await stored(page);
  await page.evaluate(() => scrollTo(0, 0));
  await touchDrag(page, 'Face Pull', 'Bench Press', '/tmp/reorder-drag-iphone.png');
  await expect.poll(() => names(page)).toEqual(['Face Pull', 'Bench Press', 'Chest Dip']);
  const after = await stored(page);
  expect(after.active.exercises.map((e: any) => e.id)).toEqual([
    before.active.exercises[2].id,
    before.active.exercises[0].id,
    before.active.exercises[1].id,
  ]);
  expect(after.active.exercises[1]).toEqual(before.active.exercises[0]);
  expect(after.active.controller).toEqual(before.active.controller);
  expect(after.plan).toEqual(before.plan);
  expect(after.history).toEqual(before.history);
  await page.reload();
  await expect.poll(() => names(page)).toEqual(['Face Pull', 'Bench Press', 'Chest Dip']);
  await page.getByRole('button', { name: 'Expand Bench Press', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Weight Bench Press set 1', exact: true }),
  ).toHaveValue('72.5');
  await expect(
    page.getByRole('spinbutton', { name: 'Weight Bench Press set 1', exact: true }),
  ).toBeVisible();
  await stored(page);
  await page.waitForTimeout(200); // Allow the card's subtle grid expansion to settle for the preview.
  await page.screenshot({ path: '/tmp/reorder-placed-iphone.png' });
});

test('running timer and spinner stay on their IDs while another exercise moves; screens still swipe', async ({
  page,
}) => {
  await beginCards(page);
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse Bench Press', exact: true }).click();
  const before = await stored(page);
  await touchDrag(page, 'Face Pull', 'Bench Press');
  const after = await stored(page);
  expect(after.active.controller.running).toEqual(before.active.controller.running);
  expect(after.active.controller.phaseStarted).toEqual(before.active.controller.phaseStarted);
  expect(after.active.controller.phase).toBe('set');
  expect(after.active.exercises[1].sets).toEqual(before.active.exercises[0].sets);
  await page.getByRole('button', { name: 'Expand Bench Press', exact: true }).click();
  await expect(page.locator('.set-spinner')).toBeVisible();
  await stored(page);
  await page.reload();
  await expect(page.locator('.set-spinner')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/reorder-active-iphone.png' });
  await advanceClock(page);
  await page.getByRole('button', { name: 'STOP SET', exact: true }).click();
  await expect(page.getByRole('button', { name: 'START NEXT SET', exact: true })).toBeVisible();
  // A short horizontal touch on the exercise title remains a screen swipe, not a drag.
  const h = await page
    .getByRole('button', { name: 'Bench Press details', exact: true })
    .boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = h!.x + h!.width - 15,
    y = h!.y + h!.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x - 130, y }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('tab', { name: 'TIMER', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await cdp.detach();
});

test('short taps, numeric input, scrolling and cancelled hold do not reorder; keyboard move controls work', async ({
  page,
}) => {
  await beginCards(page);
  const original = await names(page);
  await page.getByRole('button', { name: 'Chest Dip details', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Collapse Chest Dip', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Weight Chest Dip set 1', exact: true }).fill('25');
  await expect(page.locator('.exercise-dragging')).toHaveCount(0);
  const title = page.getByRole('button', { name: 'Chest Dip details', exact: true });
  await title.scrollIntoViewIfNeeded();
  const b = await title.boundingBox(),
    cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: b!.x + 40, y: b!.y + 30 }],
  });
  await expect(page.locator('.exercise-dragging')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect.poll(() => names(page)).toEqual(original);
  await page
    .getByRole('button', { name: 'Expand Bench Press', exact: true })
    .count()
    .then(async (n) => {
      if (n) await page.getByRole('button', { name: 'Expand Bench Press', exact: true }).click();
    });
  await page.getByLabel('Set options for Bench Press').click();
  await page.getByRole('button', { name: 'Move Bench Press down', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => names(page)).toEqual(['Chest Dip', 'Bench Press', 'Face Pull']);
  await expect(
    page.getByRole('status').filter({ hasText: 'Exercise moved to position 2' }),
  ).toHaveText('Exercise moved to position 2 of 3.');
});

for (const viewport of [
  { width: 375, height: 667 },
  { width: 393, height: 852 },
]) {
  test(`long-press autoscroll and ordinary touch scrolling at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const data = cardFixture();
    const active = createWorkout(data.trainingProgram!.workouts[0].id, 'heavy', data.plan);
    const model = active.exercises[1];
    for (let i = 0; i < 10; i++)
      active.exercises.push({
        ...structuredClone(model),
        id: `extra-${i}`,
        name: `Exercise ${i + 4}`,
        sets: model.sets.map((s, j) => ({ ...s, id: `extra-${i}-set-${j}` })),
      });
    active.controller!.exerciseCards = Object.fromEntries(
      active.exercises.map((e) => [e.id, false]),
    );
    data.active = active;
    await page.addInitScript((d) => {
      if (!localStorage.getItem('strength-tracker-v1'))
        localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
    }, data);
    await page.goto('/strength-tracker/');
    await page.getByRole('button', { name: 'Bench Press details', exact: true }).waitFor();
    const cdp = await page.context().newCDPSession(page);
    let box = await page
      .getByRole('button', { name: 'Bench Press details', exact: true })
      .boundingBox();
    const x = box!.x + box!.width / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: box!.y + box!.height / 2 }],
    });
    await expect(page.locator('.exercise-dragging')).toHaveCount(1);
    const target = viewport.height - 140;
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x, y: box!.y + box!.height / 2 + ((target - box!.y - box!.height / 2) * i) / 12 },
        ],
      });
      await page.waitForTimeout(20);
    }
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await names(page)).indexOf('Bench Press')).toBeGreaterThan(1);
    const scrollAtBottom = await page.evaluate(() => scrollY);
    const visibleTitle = await page.locator('.exercise-toggle').evaluateAll((els) =>
      els.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return r.top > 110 && r.bottom < innerHeight - 150;
      }),
    );
    expect(visibleTitle).toBeGreaterThanOrEqual(0);
    const upper = (await page.locator('.exercise-toggle').nth(visibleTitle).boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: upper.y + upper.height / 2 }],
    });
    await expect(page.locator('.exercise-dragging')).toHaveCount(1);
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x, y: upper.y + upper.height / 2 + ((80 - upper.y - upper.height / 2) * i) / 10 },
        ],
      });
      await page.waitForTimeout(20);
    }
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(scrollAtBottom - 30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const before = await names(page);
    await page.evaluate(() => scrollTo(0, 0));
    const scrollBefore = await page.evaluate(() => scrollY);
    box = await page.locator('.exercise-toggle').first().boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: box!.y + 30 }],
    });
    // Moving before the hold threshold cancels sorting and permits native vertical scrolling.
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: box!.y + 30 - i * 20 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.exercise-dragging')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore + 20);
    expect(await names(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await cdp.detach();
  });
}

test('mouse hold moves a completed card without changing its saved records', async ({ page }) => {
  const data = cardFixture();
  data.active = createWorkout(data.trainingProgram!.workouts[0].id, 'heavy', data.plan);
  const a = data.active.exercises[0];
  a.sets.forEach((s) => Object.assign(s, { done: true, weight: '60', reps: '8' }));
  data.active.controller!.exerciseCards = Object.fromEntries(
    data.active.exercises.map((e) => [e.id, false]),
  );
  await page.addInitScript(
    (d) => localStorage.setItem('strength-tracker-v1', JSON.stringify(d)),
    data,
  );
  await page.goto('/strength-tracker/');
  const first = page.getByRole('button', { name: 'Bench Press details', exact: true }),
    last = page.getByRole('button', { name: 'Face Pull details', exact: true });
  await first.waitFor();
  const before = await stored(page),
    aBox = (await first.boundingBox())!,
    bBox = (await last.boundingBox())!;
  await page.mouse.move(aBox.x + 60, aBox.y + aBox.height / 2);
  await page.mouse.down();
  await expect(page.locator('.exercise-dragging')).toHaveCount(1);
  await page.mouse.move(aBox.x + 60, bBox.y + bBox.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => names(page)).toEqual(['Chest Dip', 'Face Pull', 'Bench Press']);
  const after = await stored(page);
  expect(after.active.exercises[2]).toEqual(before.active.exercises[0]);
  expect(after.history).toEqual(before.history);
});
