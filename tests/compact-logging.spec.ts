import { test, expect } from '@playwright/test';
import { beginCards, stored } from './exercise-fixture';
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [393, 852],
]) {
  test(`per-card labels, stable keyboard columns and uncovered focused fields at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await beginCards(page);
    await expect(page.locator('.workout-navigation .set-head')).toHaveCount(0);
    await expect(page.locator('.set-head:visible')).toHaveCount(1);
    const first = page.locator('.exercise-card').first(),
      header = first.locator('.set-head'),
      row = first.locator('.performance-row:not(.set-head)').first();
    await expect(header).toHaveText('SETREPSWEIGHT (KG)ACTION');
    expect(await header.evaluate((e) => getComputedStyle(e).position)).toBe('static');
    const inputs = row.locator('input');
    const alignment = await row.evaluate((e) => {
      const number = e.querySelector('.set-number')!.getBoundingClientRect();
      const input = e.querySelector('input')!.getBoundingClientRect();
      return Math.abs(number.top + number.height / 2 - (input.top + input.height / 2));
    });
    expect(alignment).toBeLessThan(2);
    expect(await inputs.first().getAttribute('aria-label')).toContain('Reps');
    for (const input of await inputs.all()) {
      const box = (await input.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(
        await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      ).toBeGreaterThanOrEqual(16);
    }
    const before = await inputs.evaluateAll((els) =>
      els.map((e) => ({ x: e.getBoundingClientRect().x, width: e.getBoundingClientRect().width })),
    );
    const field = page.getByLabel('Weight Bench Press set 1', { exact: true });
    await page.evaluate(() => scrollBy(0, 40));
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
    const after = await inputs.evaluateAll((els) =>
      els.map((e) => ({ x: e.getBoundingClientRect().x, width: e.getBoundingClientRect().width })),
    );
    for (let i = 0; i < 2; i++) {
      expect(after[i].x).toBeCloseTo(before[i].x, 1);
      expect(after[i].width).toBeCloseTo(before[i].width, 1);
    }
    const action = page.getByRole('button', { name: 'START SET', exact: true }),
      bubble = page.getByRole('button', { name: 'Move floating timer', exact: true });
    await expect
      .poll(async () => {
        const r = (await field.boundingBox())!,
          button = (await action.boundingBox())!;
        return r.y + r.height <= button.y - 10;
      })
      .toBe(true);
    const r = (await field.boundingBox())!,
      b = (await bubble.boundingBox())!;
    expect(r.y).toBeGreaterThanOrEqual(30);
    expect(
      b.x + b.width <= r.x ||
        b.x >= r.x + r.width ||
        b.y + b.height <= r.y ||
        b.y >= r.y + r.height,
    ).toBe(true);
    await field.fill('67.5');
    const scroll = await page.evaluate(() => scrollY);
    await page.getByLabel('Reps Bench Press set 1', { exact: true }).fill('9');
    expect(await page.evaluate(() => Math.abs(scrollY))).toBeGreaterThan(0);
    expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/exercise-keyboard-${width}.png` });
    await page
      .getByLabel('Reps Bench Press set 1', { exact: true })
      .dispatchEvent('pointerdown', { clientX: 250, clientY: 200, pointerType: 'touch' });
    await page
      .getByLabel('Reps Bench Press set 1', { exact: true })
      .dispatchEvent('pointerup', { clientX: 50, clientY: 200, pointerType: 'touch' });
    await expect(page.getByRole('tab', { name: 'EXERCISES', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const old = (await bubble.boundingBox())!;
    await page.mouse.move(old.x + old.width / 2, old.y + old.height / 2);
    await page.mouse.down();
    await page.mouse.move(width - 70, 90, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByRole('tab', { name: 'EXERCISES', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await field.blur();
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, 'height', { configurable: true, value: innerHeight });
      Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 0 });
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('html')).not.toHaveAttribute('data-workout-keyboard', 'true');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Expand Chest Dip', exact: true }).click();
    await expect(page.locator('.set-head:visible')).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator('.exercise-card')
          .nth(1)
          .evaluate(
            (e) =>
              e.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
          ),
      )
      .toBe(0);
    await header.evaluate((e) => e.scrollIntoView({ block: 'start' }));
    const top = (await header.boundingBox())!.y;
    await page.evaluate(() => scrollBy(0, 100));
    expect((await header.boundingBox())!.y).toBeLessThan(top - 30);
    await first
      .locator('.exercise-toggle')
      .dispatchEvent('pointerdown', { clientX: 300, clientY: 200, pointerType: 'touch' });
    await first
      .locator('.exercise-toggle')
      .dispatchEvent('pointerup', { clientX: 70, clientY: 200, pointerType: 'touch' });
    await expect(page.getByRole('tab', { name: 'TIMER', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(bubble).toHaveCount(0);
    await page.getByRole('tab', { name: 'EXERCISES', exact: true }).click();
    await expect(field).toHaveValue('67.5');
    await stored(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `test-results/exercise-expanded-${width}.png`, fullPage: true });
  });
}
