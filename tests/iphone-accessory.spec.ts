import { test, expect, type Page } from '@playwright/test';
import { beginCards, stored, advanceClock } from './exercise-fixture';
const field = (page: Page, name = 'Weight', set = 1) =>
  page.getByLabel(`${name} Bench Press set ${set}`, { exact: true });
const plus = (page: Page) =>
  page.getByRole('button', { name: 'Increase weight by 0.25 kg', exact: true });
async function viewport(page: Page, height: number, top: number, left = 0, event = 'resize') {
  await page.evaluate(
    ({ height, top, left, event }) => {
      Object.defineProperty(visualViewport!, 'height', { configurable: true, value: height });
      Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: top });
      Object.defineProperty(visualViewport!, 'offsetLeft', { configurable: true, value: left });
      visualViewport!.dispatchEvent(new Event(event));
    },
    { height, top, left, event },
  );
}
async function clearOfInput(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const input = document.activeElement!.getBoundingClientRect(),
          bar = document.querySelector('.set-input-navigation')!.getBoundingClientRect();
        return (
          input.top >= visualViewport!.offsetTop + 8 &&
          input.bottom <= bar.top - 8 &&
          bar.bottom <= visualViewport!.offsetTop + visualViewport!.height + 0.1
        );
      }),
    )
    .toBe(true);
}
for (const [width, height] of [
  [320, 568],
  [375, 667],
  [402, 874],
]) {
  test(`standalone fixed accessory stays tappable and preserves focus while panning ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
    );
    await beginCards(page);
    await field(page).fill('0.125');
    await field(page).focus();
    await viewport(page, height - 280, 40);
    await clearOfInput(page);
    const bar = page.getByRole('group', { name: 'Set input navigation', exact: true });
    await expect(bar).toHaveCSS('position', 'fixed');
    expect(await bar.evaluate((el) => el.parentElement === document.body)).toBe(true);
    const original = (await bar.boundingBox())!;
    expect(original.height).toBe(52);
    for (const button of await bar.getByRole('button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => {
      window.scrollBy(0, 24);
      window.dispatchEvent(new Event('scroll'));
    });
    await expect
      .poll(async () => {
        const r = (await bar.boundingBox())!;
        return Math.abs(r.x - original.x) < 0.1 && Math.abs(r.y - original.y) < 0.1;
      })
      .toBe(true);
    await viewport(page, height - 280, 40, 25, 'scroll');
    expect((await bar.boundingBox())!.x).toBe(original.x);
    await viewport(page, height - 300, 70, 0, 'resize');
    await clearOfInput(page);
    for (let i = 0; i < 12; i++) {
      await plus(page).tap();
      await expect(field(page)).toBeFocused();
    }
    await expect(field(page)).toHaveValue('3.125');
    await expect
      .poll(() =>
        plus(page).evaluate((button) => {
          const r = button.getBoundingClientRect(),
            hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === button || button.contains(hit);
        }),
      )
      .toBe(true);
    await page.getByRole('button', { name: /^Previous:/ }).tap();
    await expect(field(page, 'Reps')).toBeFocused();
    await expect(plus(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Next:/ }).tap();
    await expect(field(page)).toBeFocused();
    await page.getByRole('button', { name: /^Next:/ }).tap();
    await expect(field(page, 'Reps', 2)).toBeFocused();
    await page.getByRole('button', { name: /^Next:/ }).tap();
    await expect(field(page, 'Weight', 2)).toBeFocused();
    await page.getByRole('button', { name: 'Done entering this exercise', exact: true }).tap();
    await expect(bar).toHaveCount(0);
    expect((await stored(page)).active.exercises[0].sets[0].weight).toBe('3.125');
    await page.reload();
    await expect(field(page)).toHaveValue('3.125');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
test('touch default is cancelled before blur, synchronous recovery works, and compatibility clicks cannot double adjust', async ({
  page,
}) => {
  await beginCards(page);
  await field(page).fill('7.125');
  await field(page).focus();
  const result = await plus(page).evaluate((button) => {
    const input = document.activeElement as HTMLInputElement,
      r = button.getBoundingClientRect();
    const point = {
      identifier: 1,
      target: button,
      clientX: r.x + r.width / 2,
      clientY: r.y + r.height / 2,
    };
    const send = (type: string, touches: object[], changedTouches = touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches },
        changedTouches: { value: changedTouches },
      });
      return button.dispatchEvent(event);
    };
    const cancelled = !send('touchstart', [point]);
    input.blur(); // Exercise the OS-focus-loss fallback during the protected gesture, not delayed refocus.
    send('touchend', [], [point]);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    return { cancelled, focused: document.activeElement === input, value: input.value };
  });
  expect(result).toEqual({ cancelled: true, focused: true, value: '7.375' });
  await expect(field(page)).toHaveValue('7.375');
  await plus(page).evaluate((button) => {
    const r = button.getBoundingClientRect(),
      point = { identifier: 2, target: button, clientX: r.x + 10, clientY: r.y + 10 };
    const send = (type: string, touches: object[], changedTouches = touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches },
        changedTouches: { value: changedTouches },
      });
      button.dispatchEvent(event);
    };
    send('touchstart', [point]);
    send('touchcancel', []);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  });
  await expect(field(page)).toHaveValue('7.375');
});
test('running set, exercise drag guards and timer phase survive accessory touches and viewport churn', async ({
  page,
}) => {
  await beginCards(page);
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await field(page).fill('8.125');
  await field(page).focus();
  const before = await stored(page);
  await viewport(page, 470, 60);
  for (let i = 0; i < 4; i++) await plus(page).tap();
  await page.getByRole('button', { name: 'Decrease weight by 0.5 kg', exact: true }).tap();
  // Holding a sortable header while editing must not activate its drag sensor.
  await page
    .getByRole('button', { name: 'Bench Press details', exact: true })
    .evaluate((header) => {
      const event = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: [{ identifier: 1, target: header, clientX: 50, clientY: 250 }],
      });
      header.dispatchEvent(event);
      header.dispatchEvent(new Event('touchend', { bubbles: true }));
    });
  await expect(page.locator('.exercise-dragging')).toHaveCount(0);
  await viewport(page, 430, 90, 0, 'scroll');
  await clearOfInput(page);
  const after = await stored(page);
  expect(after.active.controller).toEqual(before.active.controller);
  expect(after.history).toEqual(before.history);
  expect(after.active.exercises.map((e: any) => e.id)).toEqual(
    before.active.exercises.map((e: any) => e.id),
  );
  await advanceClock(page, 5000);
  await expect(page.locator('.set-spinner')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dismiss set keyboard', exact: true }).tap();
  await viewport(page, 844, 0);
  await page.getByLabel('Set options for Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: 'Move Bench Press down', exact: true }).click();
  await expect(page.locator('.exercise-heading').nth(1)).toHaveAttribute(
    'aria-label',
    'Bench Press',
  );
  const reordered = await stored(page);
  expect(reordered.active.controller.running).toEqual(before.active.controller.running);
  await page.reload();
  await expect(field(page)).toHaveValue('8.625');
  expect((await stored(page)).active.controller.phase).toBe('set');
});
test('initial hidden accessory cannot scroll an already-visible input against a provisional top:0 rectangle', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await beginCards(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    scrollTo(0, 0);
  });
  await field(page).evaluate((input) => input.focus({ preventScroll: true }));
  await expect(page.locator('.set-input-navigation')).toHaveAttribute('data-positioned', 'true');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(field(page)).toBeFocused();
});
test('402x874 iPhone 17 Pro-sized standalone preview has one compact app accessory', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
  );
  await beginCards(page);
  await field(page).fill('7.75');
  await field(page).focus();
  await expect(page.locator('.set-input-navigation')).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/iphone-accessory/pwa-402x874.png',
    animations: 'disabled',
  });
  await viewport(page, 540, 0);
  await clearOfInput(page);
  await expect(page.locator('.set-input-navigation')).toHaveCount(1);
  await expect(page.locator('.set-input-navigation button')).toHaveCount(7);
  await page.screenshot({
    path: 'docs/screenshots/iphone-accessory/pwa-visible-402x540.png',
    clip: { x: 0, y: 0, width: 402, height: 540 },
    animations: 'disabled',
  });
});
