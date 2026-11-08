import { migratePrograms } from './programs';
import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import {
  createDatabaseBackup,
  backupFile,
  inspectBackup,
  parseBackup,
  restoreDatabaseBackup,
  saveBackupFile,
  BACKUP_FILENAME,
  type SavePlatform,
} from './backup';
import { emptyData, createWorkout, saveData, loadData, openStore } from './data';
import { parseTrainingPlan, applyImportedPlan } from './plan-import';
import gym from '../tests/fixtures/GYM.txt?raw';
async function fixture() {
  const draft = parseTrainingPlan(gym);
  draft.rows.forEach((r) => (r.reviewed = true));
  const data = applyImportedPlan(emptyData(), draft, true);
  const w = createWorkout(data.rotation!.sessions[0].key, 'heavy', data.plan, 1000);
  w.finished = 5000;
  w.exercises[0].sets[0] = { weight: '100', reps: '8', done: true };
  data.history = [w];
  data.active = createWorkout(
    data.rotation!.sessions[1].key,
    'easy',
    data.plan,
    6000,
    data.history,
  );
  data.customExercises = [{ id: 'custom', name: 'My cable raise' }];
  data.personalRecords = { bench: { weight: 100, reps: 8 } };
  data.preferences = { units: 'kg', haptics: false };
  const name = crypto.randomUUID();
  await saveData(data, name);
  const db = await openStore(name);
  await db.put('state', { items: ['catalog exercise'] }, 'exercise-catalog');
  await db.add('backups', { kind: 'before-plan-import', data: emptyData(), created: 1 });
  await db.add('backups', { kind: 'localStorage-v1', raw: 'original localStorage', created: 2 });
  db.close();
  return { data, name };
}
it('exports every database record and all user data under the fixed filename with a date', async () => {
  const { data, name } = await fixture(),
    before = structuredClone(data);
  const backup = await createDatabaseBackup(data, name, new Date('2026-11-08T12:00:00Z'));
  expect(backup.exportedAt).toBe('2026-11-08T12:00:00.000Z');
  expect(backup.database.stores.state).toHaveLength(2);
  expect(backup.database.stores.backups).toHaveLength(2);
  const file = backupFile(backup);
  expect(file.name).toBe(BACKUP_FILENAME);
  expect(file.type).toBe('application/json');
  const preview = parseBackup(await file.text());
  expect(preview.data).toEqual(data);
  expect(preview.summary).toMatchObject({ workouts: 1, completedSets: 1, snapshots: 2 });
  expect(data).toEqual(before);
});
it('includes latest in-memory changes without discarding archived database records', async () => {
  const { data, name } = await fixture();
  data.restDefault = 75;
  data.active!.exercises[0].sets[0].weight = '42.5';
  const p = inspectBackup(await createDatabaseBackup(data, name));
  expect(p.data.restDefault).toBe(75);
  expect(p.data.active!.exercises[0].sets[0].weight).toBe('42.5');
  expect(p.archives).toHaveLength(2);
});
it('supports old JSON backups and honestly reports an unrecorded backup date', () => {
  const data = emptyData(),
    p = parseBackup(JSON.stringify(data));
  expect(p.exportedAt).toBeNull();
  expect(p.data).toEqual(data);
  expect(p.archives).toEqual([]);
});
it('rejects malformed JSON, missing data, unsupported versions, invalid settings and invalid timer states', async () => {
  expect(() => parseBackup('{broken')).toThrow('valid JSON');
  expect(() => parseBackup('{"history":[]}')).toThrow();
  const { data, name } = await fixture(),
    backup = await createDatabaseBackup(data, name);
  expect(() => inspectBackup({ ...backup, version: 99 })).toThrow('Unsupported');
  expect(() => inspectBackup({ ...backup, exportedAt: 'yesterday' })).toThrow('date');
  expect(() =>
    inspectBackup({ ...backup, database: { version: 1, stores: { state: [], backups: [] } } }),
  ).toThrow('current');
  expect(() => inspectBackup({ ...data, restDefault: '120' })).toThrow('settings');
  const bad = structuredClone(data);
  bad.active!.controller!.phase = 'unknown' as any;
  expect(() => inspectBackup(bad)).toThrow('timer');
  expect(() =>
    inspectBackup({
      ...backup,
      database: {
        version: 1,
        stores: {
          state: backup.database.stores.state,
          backups: [
            { key: 1, value: {} },
            { key: 1, value: {} },
          ],
        },
      },
    }),
  ).toThrow('duplicate');
});
it('validates before opening a write transaction; rejected/unconfirmed restore changes nothing', async () => {
  const { data, name } = await fixture(),
    before = await createDatabaseBackup(data, name);
  await expect(restoreDatabaseBackup(data, { history: [] }, true, name)).rejects.toThrow();
  await expect(restoreDatabaseBackup(data, before, false, name)).rejects.toThrow('Confirm');
  expect(await loadData({ getItem: () => null }, name)).toEqual(data);
  const after = await createDatabaseBackup(data, name);
  expect(after.database).toEqual(before.database);
});
it('restores all history, settings and archive contents while keeping current session and a pre-restore snapshot', async () => {
  const source = await fixture(),
    backup = await createDatabaseBackup(source.data, source.name);
  const current = emptyData();
  current.active = createWorkout('Sunday · Legs', 'heavy', current.plan, 9000);
  current.deviceOnlyPreference = true;
  const before = structuredClone(current),
    target = crypto.randomUUID();
  await saveData(current, target);
  const restored = await restoreDatabaseBackup(current, backup, true, target);
  expect(restored.active).toEqual(before.active);
  expect(restored.history.some((w) => w.id === source.data.history[0].id)).toBe(true);
  expect(restored.preferences).toEqual(source.data.preferences);
  expect(restored.personalRecords).toEqual(source.data.personalRecords);
  expect(restored.customExercises).toEqual(source.data.customExercises);
  expect(restored.deviceOnlyPreference).toBe(true);
  expect(restored.trainingProgram).toEqual(source.data.trainingProgram);
  const db = await openStore(target);
  expect(await db.get('state', 'exercise-catalog')).toEqual({ items: ['catalog exercise'] });
  const snapshots = await db.getAll('backups');
  expect(snapshots).toContainEqual({ kind: 'before-plan-import', data: emptyData(), created: 1 });
  expect(snapshots.find((s) => s.kind === 'before-import').data).toEqual(before);
  db.close();
  const again = await restoreDatabaseBackup(restored, backup, true, target);
  expect(again.history).toEqual(restored.history);
  expect(await loadData({ getItem: () => null }, target)).toEqual(again);
});
it('keeps conflicting extra database records in safety archives rather than erasing current records', async () => {
  const source = await fixture(),
    backup = await createDatabaseBackup(source.data, source.name),
    name = crypto.randomUUID(),
    current = emptyData();
  await saveData(current, name);
  const db = await openStore(name);
  await db.put('state', { keep: 'current' }, 'exercise-catalog');
  db.close();
  await restoreDatabaseBackup(current, backup, true, name);
  const stored = await openStore(name);
  expect(await stored.get('state', 'exercise-catalog')).toEqual({ keep: 'current' });
  expect((await stored.getAll('backups')).some((v) => v.kind === 'restored-state-conflict')).toBe(
    true,
  );
  stored.close();
});
it('restores legacy active sessions without exercise or set IDs safely', async () => {
  const data = emptyData();
  data.active = createWorkout('Tuesday · Bench focus', 'heavy', data.plan);
  delete data.active.controller;
  delete (data.active.exercises[0] as any).id;
  delete data.active.exercises[0].sets[0].id;
  const result = await restoreDatabaseBackup(emptyData(), data, true, crypto.randomUUID());
  expect(result.active!.controller!.phase).toBe('warmup');
  expect(result.active!.exercises[0].id).toBeTruthy();
  expect(result.active!.exercises[0].sets[0].id).toBeTruthy();
});
const file = () => new File(['{"backup":"data"}'], BACKUP_FILENAME, { type: 'application/json' });
it('calls native share synchronously from the gesture with a prepared JSON file and fixed name', async () => {
  const share = vi.fn(async (_data: ShareData) => {}),
    download = vi.fn();
  const promise = saveBackupFile(file(), { canShare: () => true, share, download });
  expect(share).toHaveBeenCalledTimes(1);
  expect(share.mock.calls[0]?.[0] as any).toBeDefined();
  expect(await promise).toBe('shared');
  expect(download).not.toHaveBeenCalled();
});
it('uses a plain-text MIME fallback with the same JSON extension when native JSON sharing is unsupported', async () => {
  let chosen: File | undefined;
  const result = await saveBackupFile(file(), {
    canShare: ({ files }) => files?.[0].type === 'text/plain',
    share: async ({ files }) => {
      chosen = files![0];
    },
    download: vi.fn(),
  });
  expect(result).toBe('shared');
  expect(chosen!.name).toBe(BACKUP_FILENAME);
  expect(JSON.parse(await chosen!.text())).toEqual({ backup: 'data' });
});
it('cancelling native share does not download a second file or report a save', async () => {
  const download = vi.fn();
  expect(
    await saveBackupFile(file(), {
      canShare: () => true,
      share: async () => {
        throw new DOMException('Cancelled', 'AbortError');
      },
      download,
    }),
  ).toBe('cancelled');
  expect(download).not.toHaveBeenCalled();
});
it('share failures remain visible instead of silently downloading or claiming iCloud success', async () => {
  const download = vi.fn();
  await expect(
    saveBackupFile(file(), {
      canShare: () => true,
      share: async () => {
        throw new DOMException('Blocked', 'NotAllowedError');
      },
      download,
    }),
  ).rejects.toThrow('Blocked');
  expect(download).not.toHaveBeenCalled();
});
it('opens a fresh supported picker every save, allowing OS replacement with the fixed filename', async () => {
  const write = vi.fn(async () => {}),
    close = vi.fn(async () => {}),
    picker = vi.fn(
      async (_options: Parameters<NonNullable<SavePlatform['showSaveFilePicker']>>[0]) => ({
        createWritable: async () => ({ write, close }),
      }),
    ),
    download = vi.fn();
  const platform: SavePlatform = { showSaveFilePicker: picker, download };
  expect(await saveBackupFile(file(), platform)).toBe('saved');
  expect(await saveBackupFile(file(), platform)).toBe('saved');
  expect(picker).toHaveBeenCalledTimes(2);
  expect(picker.mock.calls[0]?.[0]).toMatchObject({ suggestedName: BACKUP_FILENAME });
  expect(write).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(2);
  expect(download).not.toHaveBeenCalled();
});
it('aborts failed picker writes instead of committing an incomplete file', async () => {
  const abort = vi.fn(async () => {}),
    close = vi.fn(async () => {});
  await expect(
    saveBackupFile(file(), {
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async () => {
            throw Error('Full');
          },
          close,
          abort,
        }),
      }),
      download: vi.fn(),
    }),
  ).rejects.toThrow('Full');
  expect(abort).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});
it('falls back to the supported browser download flow with the fixed filename', async () => {
  const download = vi.fn();
  expect(await saveBackupFile(file(), { canShare: () => false, download })).toBe('downloaded');
  expect(download).toHaveBeenCalledWith(expect.objectContaining({ name: BACKUP_FILENAME }));
});
it('rolls back every state and archive write when restoration fails before committing current data', async () => {
  const source = await fixture(),
    backup = await createDatabaseBackup(source.data, source.name),
    current = emptyData(),
    name = crypto.randomUUID();
  current.active = createWorkout('Sunday · Legs', 'heavy', current.plan);
  delete current.active.controller;
  delete (current.active.exercises[0] as any).id;
  await saveData(current, name);
  const before = await createDatabaseBackup(current, name);
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: any,
    key?: IDBValidKey,
  ) {
    if (this.name === 'state' && key === 'current')
      throw new DOMException('Write failed', 'QuotaExceededError');
    return original.call(this, value, key!);
  });
  try {
    await expect(restoreDatabaseBackup(current, backup, true, name)).rejects.toThrow(
      'Write failed',
    );
  } finally {
    spy.mockRestore();
  }
  const after = await createDatabaseBackup(current, name);
  expect(after.database).toEqual(before.database);
  expect(await loadData({ getItem: () => null }, name)).toEqual(migratePrograms(current));
});
