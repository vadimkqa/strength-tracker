import { test, expect, type Page } from '@playwright/test';
import { beginCards, stored, advanceClock } from './exercise-fixture';
const field = (page: Page, name = 'Weight', set = 1) =>
  page.getByLabel(`${name} Bench Press set ${set}`, { exact: true });
const plus = (page: Page) =>
  page.getByRole('button', { name: 'Increase weight by 0.25 kg', exact: true });
const strip = (page: Page) =>
  page.getByRole('group', { name: 'Set input navigation', exact: true });
async function viewportEvents(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: 440.333333333 });
    Object.defineProperty(visualViewport!, 'offsetTop', {
      configurable: true,
      value: 70.333333333,
    });
    Object.defineProperty(visualViewport!, 'offsetLeft', { configurable: true, value: 25 });
    for (let i = 0; i < 6; i++) {
      visualViewport!.dispatchEvent(new Event('resize'));
      visualViewport!.dispatchEvent(new Event('scroll'));
    }
  });
}
test('25.5 remains the exact edit target after blur; initial touch updates before release without synthetic input events', async ({
  page,
}) => {
  await beginCards(page);
  await field(page).fill('25.5');
  await strip(page).evaluate((el) => ((window as any).__originalStrip = el));
  await field(page).evaluate((el) => el.blur());
  await expect(strip(page)).toBeVisible();
  const result = await plus(page).evaluate((button) => {
    const input = document.querySelector<HTMLInputElement>(
      '[aria-label="Weight Bench Press set 1"]',
    )!;
    let artificialInputs = 0;
    const record = (e: Event) => {
      if (!e.isTrusted) artificialInputs++;
    };
    input.addEventListener('input', record);
    const touch = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touch, 'touches', { value: [{ identifier: 1, target: button }] });
    const prevented = !button.dispatchEvent(touch);
    const immediate = { value: input.value, focused: document.activeElement === input };
    button.dispatchEvent(new Event('touchend', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    input.removeEventListener('input', record);
    return {
      prevented,
      ...immediate,
      artificialInputs,
      sameStrip:
        document.querySelector('.set-input-navigation') === (window as any).__originalStrip,
    };
  });
  expect(result).toEqual({
    prevented: true,
    value: '25.75',
    focused: true,
    artificialInputs: 0,
    sameStrip: true,
  });
  await expect(field(page)).toHaveValue('25.75');
  expect((await stored(page)).active.exercises[0].sets[0].weight).toBe('25.75');
});
test('Next focuses synchronously at touchstart and the later click cannot advance a second field', async ({
  page,
}) => {
  await beginCards(page);
  await field(page, 'Reps').focus();
  const next = page.getByRole('button', { name: 'Next: Weight Bench Press set 1', exact: true });
  const result = await next.evaluate((button) => {
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ target: button }] });
    button.dispatchEvent(event);
    const first = (document.activeElement as HTMLInputElement).getAttribute('aria-label');
    button.dispatchEvent(new Event('touchend', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    return [first, document.activeElement?.getAttribute('aria-label')];
  });
  expect(result).toEqual(['Weight Bench Press set 1', 'Weight Bench Press set 1']);
  await page.getByRole('button', { name: /^Next:/ }).tap();
  await expect(field(page, 'Reps', 2)).toBeFocused();
  await page.getByRole('button', { name: /^Previous:/ }).tap();
  await expect(field(page)).toBeFocused();
});
for (const [width, height] of [
  [320, 568],
  [375, 667],
  [402, 874],
]) {
  test(`standalone normal-flow controls preserve touch focus and fractional values at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
    );
    const d = await beginCards(page);
    await field(page).fill('0.125');
    for (const button of await strip(page).getByRole('button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => {
      (window as any).__blurs = 0;
      document.activeElement!.addEventListener('blur', () => (window as any).__blurs++);
    });
    const before = await stored(page),
      other = await field(page, 'Weight', 2).inputValue();
    for (let i = 0; i < 12; i++) {
      await plus(page).tap();
      await expect(field(page)).toBeFocused();
    }
    await expect(field(page)).toHaveValue('3.125');
    for (let i = 0; i < 6; i++)
      await page.getByRole('button', { name: 'Decrease weight by 0.5 kg', exact: true }).tap();
    await expect(field(page)).toHaveValue('0.125');
    expect(await page.evaluate(() => (window as any).__blurs)).toBe(0);
    await expect(field(page, 'Weight', 2)).toHaveValue(other);
    expect((await stored(page)).active.controller).toEqual(before.active.controller);
    expect((await stored(page)).history).toEqual(d.history);
    await page.getByRole('button', { name: /^Previous:/ }).tap();
    await expect(field(page, 'Reps')).toBeFocused();
    await expect(plus(page)).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(field(page)).toBeFocused();
    await page.getByRole('button', { name: /^Next:/ }).tap();
    await expect(field(page, 'Reps', 2)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(field(page, 'Weight', 2)).toBeFocused();
    await page.getByRole('button', { name: 'Done entering this exercise', exact: true }).tap();
    await expect(field(page, 'Weight', 2)).not.toBeFocused();
    await expect(strip(page)).toHaveCount(1);
    await page.reload();
    await expect(field(page)).toHaveValue('0.125');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
test('viewport events issue no scroll commands, offsets, portals or toolbar focus teardown', async ({
  page,
}) => {
  await beginCards(page);
  await field(page).fill('25.5');
  const before = await strip(page).boundingBox();
  await page.evaluate(() => {
    (window as any).__scrollCommands = 0;
    (window as any).__originalScrollBy = window.scrollBy.bind(window);
    window.scrollBy = () => {
      (window as any).__scrollCommands++;
    };
    window.scrollTo = () => {
      (window as any).__scrollCommands++;
    };
    HTMLElement.prototype.scrollIntoView = () => {
      (window as any).__scrollCommands++;
    };
    (window as any).__strip = document.querySelector('.set-input-navigation');
  });
  await viewportEvents(page);
  await expect(strip(page)).toHaveCSS('position', 'static');
  await expect(strip(page)).toHaveCSS('transform', 'none');
  expect(
    await strip(page).evaluate((el) => el.parentElement?.classList.contains('workout-controller')),
  ).toBe(true);
  expect(await page.evaluate(() => (window as any).__scrollCommands)).toBe(0);
  const after = (await strip(page).boundingBox())!;
  expect(after.x).toBe(before!.x);
  expect(after.y).toBe(before!.y);
  const docTop = await strip(page).evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(() => (window as any).__originalScrollBy(0, 40));
  expect(await strip(page).evaluate((el) => el.getBoundingClientRect().top + scrollY)).toBeCloseTo(
    docTop,
    1,
  );
  await field(page).evaluate((el) => el.blur());
  expect(await strip(page).evaluate((el) => el === (window as any).__strip)).toBe(true);
  await plus(page).tap();
  await expect(field(page)).toHaveValue('25.75');
});
test('editing controls do not start/stop a running set or change history, and sorting remains available after dismissal', async ({
  page,
}) => {
  await beginCards(page);
  await page.getByRole('button', { name: 'START SET', exact: true }).click();
  await field(page).fill('8.125');
  const before = await stored(page);
  for (let i = 0; i < 4; i++) await plus(page).tap();
  await viewportEvents(page);
  await advanceClock(page, 5000);
  const after = await stored(page);
  expect(after.active.controller).toEqual(before.active.controller);
  expect(after.history).toEqual(before.history);
  await expect(page.locator('.set-spinner')).toHaveCount(1);
  await page.getByRole('button', { name: 'Done editing Bench Press', exact: true }).click();
  await page.getByLabel('Set options for Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: 'Move Bench Press down', exact: true }).click();
  expect((await stored(page)).active.controller.running).toEqual(before.active.controller.running);
  await page.reload();
  await expect(field(page)).toHaveValue('9.125');
  expect((await stored(page)).active.controller.phase).toBe('set');
});
test('in-page controls are mounted before focus and retain a constant footprint across blur and field changes', async ({
  page,
}) => {
  await beginCards(page);
  const initial = await strip(page).boundingBox();
  await expect(page.getByRole('button', { name: 'Next field', exact: true })).toBeDisabled();
  for (const name of ['Reps', 'Weight']) {
    await field(page, name).focus();
    expect((await strip(page).boundingBox())!.height).toBe(initial!.height);
  }
  await field(page).evaluate((el) => el.blur());
  expect((await strip(page).boundingBox())!.height).toBe(initial!.height);
  await expect(strip(page)).toHaveCount(1);
  expect(
    await page.getByRole('button', { name: 'Dismiss set keyboard', exact: true }).count(),
  ).toBe(0);
});
test('iPhone-sized normal-flow preview at 25.5 kg (not a native keyboard capture)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await beginCards(page);
  await field(page).fill('25.5');
  await page.screenshot({
    path: 'docs/screenshots/inline-editing/iphone-402x874.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 402, height: 540 });
  await field(page).evaluate((el) => el.focus());
  await page.screenshot({
    path: 'docs/screenshots/inline-editing/available-area-402x540.png',
    animations: 'disabled',
  });
});
