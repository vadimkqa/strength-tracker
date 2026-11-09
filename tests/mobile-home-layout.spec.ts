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
  [430, 932],
]) {
  test(`Start Workout is initially unobscured and clickable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (d) => localStorage.setItem('strength-tracker-v1', JSON.stringify(d)),
      data,
    );
    await page.goto('/strength-tracker/');
    const button = page.getByRole('button', { name: /^START WORKOUT/ });
    await expect(button).toBeVisible();
    const bounds = await button.boundingBox(),
      nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nav!.y);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(
      await button.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Previous workout', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Next workout', exact: true })).toHaveCount(0);
    await expect(page.getByText('Make every', { exact: false })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const front = page.locator('.stack-front'),
      card = (await front.boundingBox())!;
    expect(card.width / width).toBeGreaterThanOrEqual(0.75);
    expect(card.width / width).toBeLessThanOrEqual(0.8);
    expect(card.height / card.width).toBeGreaterThan(1.15);
    expect(Math.abs(card.x + card.width / 2 - width / 2)).toBeLessThan(2);
    await expect(front.locator('.home-card-controls .pagination button')).toHaveCount(4);
    await expect(
      front.getByRole('group', { name: 'Training intensity', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.stack-card')).toHaveCount(4);
    await expect(page.locator('#rotation-week')).toHaveAttribute('data-week', '1');
    await expect(page.locator('#rotation-week button')).toHaveCount(2);
    await expect(page.locator('select#rotation-week')).toHaveCount(0);
    for (const side of ['.stack-previous', '.stack-next']) {
      const layered = page.locator(side);
      const geometry = await layered.evaluate((el) => {
        const s = getComputedStyle(el),
          m = new DOMMatrixReadOnly(s.transform);
        const r = el.querySelector('.stack-peek-label')!.getBoundingClientRect();
        return {
          width: parseFloat(s.width),
          opacity: parseFloat(s.opacity),
          rotation: m.b,
          labelCenter: r.x + r.width / 2,
        };
      });
      expect(geometry.width).toBeCloseTo(card.width, 0);
      expect(geometry.opacity).toBeLessThan(1);
      expect(geometry.rotation * (side === '.stack-next' ? 1 : -1)).toBeGreaterThan(0);
      expect(geometry.labelCenter).toBeGreaterThan(0);
      expect(geometry.labelCenter).toBeLessThan(width);
    }
    expect((await front.locator('.home-card-controls').boundingBox())!.y).toBeGreaterThan(card.y);
    expect(
      (await front.locator('.home-card-controls').boundingBox())!.y +
        (await front.locator('.home-card-controls').boundingBox())!.height,
    ).toBeLessThanOrEqual(card.y + card.height);
    await page.screenshot({ path: `test-results/home-${width}x${height}.png` });
    await button.click();
    await expect(
      page.getByRole('heading', { name: 'Week 1 · Tuesday · Bench Day · Hard', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
  });
}
test('short dynamic viewport can scroll the Start control above safe-area padded navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.addInitScript(
    (d) => localStorage.setItem('strength-tracker-v1', JSON.stringify(d)),
    data,
  );
  await page.goto('/strength-tracker/');
  // Add a larger-than-default bottom inset to verify reserved space independently of browser emulation's zero safe-area env values.
  await page.addStyleTag({
    content:
      'nav[aria-label="Main navigation"]{padding-bottom:44px}main.home-screen{padding-bottom:144px}',
  });
  await page.getByRole('button', { name: /^START WORKOUT/ }).waitFor({ state: 'visible' });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const start = page.getByRole('button', { name: /^START WORKOUT/ }),
    r = await start.boundingBox(),
    nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
  expect(r!.y).toBeGreaterThanOrEqual(0);
  expect(r!.y + r!.height).toBeLessThanOrEqual(nav!.y);
  await start.click();
  await expect(page.getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
});

test('in-card controls do not initiate dragging or keyboard card navigation; short screens retain native vertical scrolling', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, data);
  await page.goto('/strength-tracker/');
  const front = page.locator('.stack-front'),
    easy = front.getByRole('button', { name: 'EASY', exact: true });
  await easy.click();
  await easy.press('ArrowRight');
  await expect(front).toHaveAttribute('aria-label', 'Bench Day');
  await expect(easy).toHaveAttribute('aria-pressed', 'true');
  await easy.dispatchEvent('pointerdown', {
    pointerId: 20,
    pointerType: 'touch',
    clientX: 240,
    clientY: 300,
    button: 0,
  });
  await easy.dispatchEvent('pointermove', {
    pointerId: 20,
    pointerType: 'touch',
    clientX: 60,
    clientY: 300,
  });
  await easy.dispatchEvent('pointerup', {
    pointerId: 20,
    pointerType: 'touch',
    clientX: 60,
    clientY: 300,
  });
  await expect(front).toHaveAttribute('aria-label', 'Bench Day');
  await page.evaluate(() => scrollTo(0, 0));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 160, y: 350 }],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 160, y: 350 - i * 24 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40);
  await expect(front).toHaveAttribute('aria-label', 'Bench Day');
  const start = page.getByRole('button', { name: 'START WORKOUT' });
  await start.scrollIntoViewIfNeeded();
  await start.click();
  await expect(page.getByRole('heading', { name: 'Bench press', exact: true })).toBeVisible();
});
