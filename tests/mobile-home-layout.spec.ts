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
