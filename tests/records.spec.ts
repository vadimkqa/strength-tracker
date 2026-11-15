import { test, expect } from '@playwright/test';
import { seedRecords } from './records-fixture';
import { stored } from './exercise-fixture';
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [320, 568],
]) {
  test(`compact records, readable chart interactions and no mobile overflow at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const d = await seedRecords(page);
    const rows = page.locator('.pr-exercise-row');
    await expect(rows).toHaveCount(8);
    await expect(rows.nth(0)).toContainText('Bench Press');
    await expect(rows.nth(1)).toContainText('Biceps Curl');
    const first = await rows.first().boundingBox();
    expect(first!.height).toBeLessThanOrEqual(80);
    const span = await rows.evaluateAll((els) =>
      els.slice(0, 5).reduce((n, el) => n + el.getBoundingClientRect().height, 0),
    );
    expect(span).toBeLessThanOrEqual(410);
    for (const button of [page.locator('.pr-star').first(), page.locator('.pr-open').first()]) {
      const r = await button.boundingBox();
      expect(r!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width !== 320)
      await page.screenshot({ path: `docs/screenshots/personal-records/list-${width}.png` });
    await page.getByRole('button', { name: 'View records for Bench Press', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bench Press', exact: true })).toBeVisible();
    await expect(page.locator('.pr-summary')).toContainText('37.5 kg × 8 reps');
    await expect(page.locator('.pr-history li')).toHaveCount(16);
    if (width !== 320)
      await page.screenshot({ path: `docs/screenshots/personal-records/detail-${width}.png` });
    const chart = page.getByRole('region', { name: 'Exercise progress chart' });
    await chart.scrollIntoViewIfNeeded();
    await expect(page.locator('.pr-chart-plot circle')).toHaveCount(8);
    const output = page.locator('.pr-chart-value'),
      latest = await output.innerText();
    await page.getByRole('button', { name: 'Previous chart session', exact: true }).click();
    await expect(output).not.toHaveText(latest);
    await page.locator('.pr-chart-plot').tap({ position: { x: 20, y: 50 } });
    await expect(page.getByLabel('Selected chart session')).toHaveValue('records-session-0');
    for (const [metric, label] of [
      ['estimate', 'estimate'],
      ['weight', 'weight'],
      ['volume', 'volume'],
    ]) {
      await page.getByLabel('Chart metric', { exact: true }).selectOption(metric);
      await chart.scrollIntoViewIfNeeded();
      if (width !== 320)
        await page.screenshot({
          path: `docs/screenshots/personal-records/chart-${label}-${width}.png`,
        });
    }
    await page.getByRole('button', { name: '1 month', exact: true }).click();
    await expect(page.locator('.pr-chart-plot circle')).toHaveCount(2);
    await page.getByLabel('Session intensity', { exact: true }).selectOption('easy');
    await expect(page.locator('.pr-history li')).toHaveCount(8);
    await page.getByLabel('Session intensity', { exact: true }).selectOption('all');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await stored(page)).history).toEqual(d.history);
  });
}
test('favorite changes and manual order persist after reload and are exported in backup without changing history', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
  });
  const d = await seedRecords(page);
  await page.getByRole('button', { name: 'Favorite Cable Row', exact: true }).click();
  await page.getByText('Sort & session filters', { exact: false }).click();
  await page.getByRole('button', { name: 'Reorder favorites', exact: true }).click();
  await page.getByRole('button', { name: 'Move Cable Row up', exact: true }).click();
  await page.getByRole('button', { name: 'Move Cable Row up', exact: true }).click();
  await expect(page.locator('.pr-exercise-row').first()).toContainText('Cable Row');
  const before = await stored(page);
  await page.reload();
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.pr-exercise-row').first()).toContainText('Cable Row');
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.pr-exercise-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Unfavorite Bench Press', exact: true }).click();
  await expect(page.locator('.pr-exercise-row')).toHaveCount(2);
  const saved = await stored(page);
  expect(saved.history).toEqual(d.history);
  expect(saved.prPreferences.favorites[0]).toBe(before.prPreferences.favorites[0]);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  const file = await download,
    path = await file.path();
  const { readFileSync } = await import('node:fs');
  const backup = JSON.parse(readFileSync(path!, 'utf8'));
  const current = backup.database.stores.state.find((r: any) => r.key === 'current').value;
  expect(current.prPreferences).toEqual(saved.prPreferences);
  expect(current.history).toEqual(d.history);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await page.getByRole('button', { name: 'Unfavorite Biceps Curl', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#backup').setInputFiles(path!);
  await page
    .getByLabel('I confirm restoring this backup’s plans and settings and merging its history.', {
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Confirm Restore Data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Data restored.' })).toBeVisible();
  const restored = await stored(page);
  expect(restored.prPreferences).toEqual(saved.prPreferences);
  expect([...restored.history].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
    [...d.history].sort((a, b) => a.id.localeCompare(b.id)),
  );
});
test('search, filters, sort, intensity and empty states use only saved performances', async ({
  page,
}) => {
  await seedRecords(page);
  await page.getByLabel('Search exercises', { exact: true }).fill('leg');
  await expect(page.locator('.pr-exercise-row')).toHaveCount(1);
  await page.getByLabel('Search exercises', { exact: true }).fill('not logged');
  await expect(page.getByRole('heading', { name: 'No matching exercises.' })).toBeVisible();
  await page.getByLabel('Search exercises', { exact: true }).clear();
  await page.getByText('Sort & session filters', { exact: false }).click();
  for (const sort of ['alphabetical', 'trained', 'achieved']) {
    await page.getByLabel('Sort exercises', { exact: true }).selectOption(sort);
    await expect(page.locator('.pr-exercise-row').first()).toContainText('Bench Press');
  }
  await page.getByLabel('Session intensity', { exact: true }).selectOption('hard');
  await expect(page.locator('.pr-exercise-row').first()).toContainText('35 kg × 8 reps');
  await page.getByRole('button', { name: 'Recent PRs', exact: true }).click();
  await expect(page.locator('.pr-exercise-row')).toHaveCount(6);
  await page.getByLabel('Search exercises', { exact: true }).fill('Assisted');
  await expect(page.getByRole('heading', { name: 'No matching exercises.' })).toBeVisible();
  await page.getByLabel('Search exercises', { exact: true }).clear();
  await page.getByLabel('Session intensity', { exact: true }).selectOption('all');
  await expect(page.locator('.pr-exercise-row')).toHaveCount(6);
  await page.getByRole('button', { name: 'All exercises', exact: true }).click();
  await page
    .getByRole('button', { name: 'View records for Assisted Pull-up', exact: true })
    .click();
  await expect(page.locator('.pr-summary')).toContainText('Not estimated');
  await expect(page.locator('.pr-chart-plot')).toHaveCount(0);
});
