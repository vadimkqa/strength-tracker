import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
test('v1 cached installation upgrades to React without losing localStorage history', async ({
  browser,
}) => {
  let modern = false;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, 'http://localhost').pathname;
      const root = modern ? 'dist' : 'legacy';
      const file = join(process.cwd(), root, pathname === '/' ? 'index.html' : pathname);
      const content = await readFile(file);
      const ext = file.split('.').at(-1);
      res.setHeader(
        'Content-Type',
        ext === 'js'
          ? 'application/javascript'
          : ext === 'html'
            ? 'text/html'
            : ext === 'css'
              ? 'text/css'
              : ext === 'webmanifest'
                ? 'application/manifest+json'
                : ext === 'png'
                  ? 'image/png'
                  : 'application/octet-stream',
      );
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(4175, '127.0.0.1', resolve));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto('http://127.0.0.1:4175');
    await page.getByRole('button', { name: 'Start workout', exact: true }).click();
    await page.getByLabel('Weight set 1', { exact: true }).first().fill('75');
    await page.getByLabel('Reps set 1', { exact: true }).first().fill('6');
    await page.locator('[data-done="0:0"]').click();
    await page.getByRole('button', { name: 'Finish & save workout', exact: true }).click();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const raw = await page.evaluate(() => localStorage.getItem('strength-tracker-v1'));
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    modern = true;
    await page.evaluate(async () => {
      const changed = new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
      await changed;
    });
    await page.reload();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByText('View sets', { exact: true }).click();
    await expect(page.getByText('75 kg × 6', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('strength-tracker-v1'))).toBe(raw);
  } finally {
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
