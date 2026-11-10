import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData, createWorkout } from '../src/data';
import { BACKUP_FORMAT, BACKUP_FILENAME, parseBackup } from '../src/backup';
const fixture = () => {
  const d = emptyData(),
    w = createWorkout('Tuesday · Bench focus', 'heavy', d.plan, 1000);
  w.finished = 5000;
  Object.assign(w.exercises[0].sets[0], { weight: '100', reps: '8', done: true });
  d.history = [w];
  d.active = createWorkout('Sunday · Legs', 'heavy', d.plan, 6000, d.history);
  d.customExercises = [{ name: 'Custom row' }];
  d.preferences = { units: 'kg', haptics: false };
  d.personalRecords = { bench: 100 };
  return d;
};
async function seed(page: Page) {
  const d = fixture();
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, d);
  await page.goto('/strength-tracker/');
  await expect(page.getByRole('button', { name: 'START SET', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('strength-tracker-v2');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['state', 'backups'], 'readwrite');
        tx.objectStore('backups').add({
          kind: 'test-archive',
          raw: 'preserved raw data',
          created: 1,
        });
        tx.objectStore('state').put({ items: ['custom catalog'] }, 'catalog');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save Data', exact: true })).toBeEnabled();
  return d;
}
async function database(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('strength-tracker-v2');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const tx = db.transaction(['state', 'backups']);
        const state = tx.objectStore('state').getAll(),
          keys = tx.objectStore('state').getAllKeys(),
          archives = tx.objectStore('backups').getAll();
        tx.oncomplete = () =>
          resolve({ state: state.result, keys: keys.result, archives: archives.result });
      });
    } finally {
      db.close();
    }
  });
}
async function disablePicker(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }),
  );
}
test('mobile standalone native sharing retains activation and carries every record in the fixed-name JSON file', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: ({ files }: ShareData) => !!files?.length,
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: async ({ files }: ShareData) => {
        const active = navigator.userActivation.isActive;
        const f = files![0];
        (window as any).__shared = {
          active,
          name: f.name,
          type: f.type,
          json: JSON.parse(await f.text()),
        };
      },
      configurable: true,
    });
  });
  const expected = await seed(page),
    before = await database(page);
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Share sheet closed.' })).toBeVisible();
  const shared = await page.evaluate(() => (window as any).__shared);
  expect(shared.active).toBe(true);
  expect(shared.name).toBe(BACKUP_FILENAME);
  expect(shared.type).toBe('application/json');
  const preview = parseBackup(JSON.stringify(shared.json));
  expect(preview.data.history).toEqual(expected.history);
  expect(preview.data.active).toEqual(expected.active);
  expect(preview.data.customExercises).toEqual(expected.customExercises);
  expect(preview.data.preferences).toEqual(expected.preferences);
  expect(preview.state.some((r) => r.key === 'catalog')).toBe(true);
  expect(preview.archives.some((r) => (r.value as any).kind === 'test-archive')).toBe(true);
  expect(await database(page)).toEqual(before);
  await page.locator('.backup-panel').screenshot({ path: 'test-results/save-data-iphone.png' });
});
test('unsupported native file sharing uses the supported download flow with complete JSON', async ({
  page,
}) => {
  await disablePicker(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }),
  );
  await seed(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(BACKUP_FILENAME);
  const file = readFileSync((await download.path())!, 'utf8');
  const preview = parseBackup(file);
  expect(preview.summary).toMatchObject({ workouts: 1, completedSets: 1, snapshots: 3 });
  expect(preview.archives.map((r) => (r.value as any).kind)).toContain('before-strength-streak');
  await expect(page.getByRole('status').filter({ hasText: 'Download started.' })).toBeVisible();
});
test('cancelled sharing is distinct from successful saving and triggers no second download', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        throw new DOMException('Cancelled', 'AbortError');
      },
      configurable: true,
    });
  });
  let count = 0;
  page.on('download', () => count++);
  await seed(page);
  const before = await database(page);
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Save cancelled.' })).toBeVisible();
  expect(count).toBe(0);
  expect(await database(page)).toEqual(before);
});
test('failed sharing offers an explicit download fallback without claiming an iCloud save', async ({
  page,
}) => {
  await disablePicker(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        throw new DOMException('Blocked', 'NotAllowedError');
      },
      configurable: true,
    });
  });
  await seed(page);
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sharing or saving could not finish');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON instead', exact: true }).click();
  expect((await pending).suggestedFilename()).toBe(BACKUP_FILENAME);
});
test('supported picker prompts each time and saves the newest changed templates', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async (options: unknown) => {
        const log = (window as any).__saved || ((window as any).__saved = []);
        const result: any = { options };
        log.push(result);
        return {
          createWritable: async () => ({
            write: async (f: File) => {
              result.json = JSON.parse(await f.text());
            },
            close: async () => {
              result.closed = true;
            },
          }),
        };
      },
    });
  });
  await seed(page);
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Backup saved to the file you selected.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'More sets Bench Press', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save Data', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__saved?.filter((s: any) => s.closed).length))
    .toBe(2);
  const saved = await page.evaluate(() => (window as any).__saved);
  expect(saved.map((s: any) => s.options.suggestedName)).toEqual([
    BACKUP_FILENAME,
    BACKUP_FILENAME,
  ]);
  expect(parseBackup(JSON.stringify(saved[1].json)).data.plan['Tuesday · Bench focus'][0][1]).toBe(
    5,
  );
});
test('validated restore preview shows date and contents and requires confirmation before any writes', async ({
  page,
}) => {
  await seed(page);
  const before = await database(page),
    incoming = emptyData(),
    w = createWorkout('Tuesday · Bench focus', 'easy', incoming.plan, 7000);
  w.finished = 9000;
  Object.assign(w.exercises[0].sets[0], { weight: '110', reps: '6', done: true });
  incoming.history = [w];
  incoming.restDefault = 90;
  incoming.preferences = { units: 'kg', haptics: true };
  const backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: '2026-11-08T12:34:56.000Z',
    database: {
      version: 1,
      stores: {
        state: [{ key: 'current', value: incoming }],
        backups: [{ key: 1, value: { kind: 'incoming-archive', created: 2 } }],
      },
    },
  };
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^Restore Data/ }).click();
  await (
    await choose
  ).setFiles({
    name: BACKUP_FILENAME,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const review = page.getByRole('region', { name: 'Review backup', exact: true });
  await expect(review).toContainText('2026');
  await expect(review).toContainText('Saved workouts');
  await expect(review).toContainText('Completed sets');
  await expect(
    page.getByRole('button', { name: 'Confirm Restore Data', exact: true }),
  ).toBeDisabled();
  expect(await database(page)).toEqual(before);
  await page.locator('.backup-panel').screenshot({ path: 'test-results/restore-data-preview.png' });
  await page.getByRole('button', { name: 'Cancel restore', exact: true }).click();
  expect(await database(page)).toEqual(before);
  await page.locator('#backup').setInputFiles({
    name: BACKUP_FILENAME,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByLabel('I confirm restoring this backup’s plans and settings and merging its history.', {
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Confirm Restore Data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Data restored.' })).toBeVisible();
  const after = await database(page),
    current = after.state[after.keys.indexOf('current')],
    prior = before.state[before.keys.indexOf('current')];
  expect(current.history).toHaveLength(2);
  expect(current.active).toEqual(prior.active);
  expect(current.restDefault).toBe(90);
  expect(current.preferences).toEqual(incoming.preferences);
  expect(
    after.archives.some(
      (r: any) => r.kind === 'before-import' && r.data.active.id === prior.active.id,
    ),
  ).toBe(true);
  expect(after.archives.some((r: any) => r.kind === 'incoming-archive')).toBe(true);
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  await expect(page.locator('.record').first()).toContainText('110');
});
test('malformed and unsupported backups replace no state and cannot reuse a stale valid preview', async ({
  page,
}) => {
  await seed(page);
  const before = await database(page);
  await page.locator('#backup').setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(emptyData())),
  });
  await expect(page.getByRole('region', { name: 'Review backup', exact: true })).toContainText(
    'Not recorded (older backup)',
  );
  for (const text of [
    '{"history":[]}',
    '{broken',
    JSON.stringify({ format: BACKUP_FORMAT, version: 99 }),
  ]) {
    await page.locator('#backup').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(page.getByRole('alert')).toContainText('Backup not imported');
    await expect(
      page.getByRole('button', { name: 'Confirm Restore Data', exact: true }),
    ).toHaveCount(0);
    expect(await database(page)).toEqual(before);
  }
});
test('Save Data remains available offline in standalone mobile mode with stable layout', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async ({ files }: ShareData) => {
        (window as any).__offlineFile = files![0].name;
      },
      configurable: true,
    });
  });
  await seed(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Save Data', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__offlineFile)).toBe(BACKUP_FILENAME);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.backup-panel')).toContainText('cannot silently overwrite');
});
