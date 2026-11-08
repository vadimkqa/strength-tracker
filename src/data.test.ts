import { migratePrograms } from './programs';
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  loadData,
  saveData,
  openStore,
  emptyData,
  createWorkout,
  completeSet,
  finishWorkout,
  restoreBackup,
  mergeBackup,
  LEGACY_KEY,
} from './data';
const name = () => crypto.randomUUID();
const fixture = () => {
  const d = emptyData();
  d.active = createWorkout('Tuesday · Bench focus', 'heavy', d.plan, 100);
  d.active.exercises[0].sets[0] = { weight: '80', reps: '5', done: true };
  return finishWorkout(d, 200);
};
describe('safe v1 migration', () => {
  it('preserves complete history, active workout, custom plan, preferences and original raw backup', async () => {
    const d = fixture();
    d.active = createWorkout('Sunday · Legs', 'easy', d.plan, 300);
    d.plan['Tuesday · Bench focus'][0][1] = 6;
    d.restDefault = 75;
    const raw = JSON.stringify(d);
    const storage = { getItem: (key: string) => (key === LEGACY_KEY ? raw : null) };
    const dbname = name();
    expect(await loadData(storage, dbname)).toEqual(migratePrograms(d));
    expect(storage.getItem(LEGACY_KEY)).toBe(raw);
    const db = await openStore(dbname);
    expect((await db.getAll('backups'))[0].raw).toBe(raw);
    db.close();
  });
  it('is idempotent and does not overwrite newer IndexedDB history', async () => {
    const dbname = name(),
      raw = JSON.stringify(fixture());
    const storage = { getItem: () => raw };
    const d = await loadData(storage, dbname);
    d.history.push({ ...d.history[0], id: 'new' });
    await saveData(d, dbname);
    expect((await loadData(storage, dbname)).history).toHaveLength(2);
  });
  it('does not silently replace malformed legacy data with an empty database', async () => {
    const dbname = name();
    await expect(loadData({ getItem: () => '{broken' }, dbname)).rejects.toThrow();
    const db = await openStore(dbname);
    expect(await db.get('state', 'current')).toBeUndefined();
    db.close();
  });
  it('merges backups without overwriting colliding IDs or the active session and snapshots before import', async () => {
    const d = fixture();
    d.active = createWorkout('Sunday · Legs', 'heavy', d.plan);
    const incoming = structuredClone(d);
    incoming.history[0].exercises[0].sets[0].weight = '90';
    incoming.active = null;
    const dbname = name();
    const result = await restoreBackup(d, incoming, dbname);
    expect(result.history).toHaveLength(2);
    expect(result.active).toEqual(d.active);
    expect(new Set(result.history.map((w) => w.id)).size).toBe(2);
    expect((await restoreBackup(result, incoming, dbname)).history).toHaveLength(2);
    const db = await openStore(dbname);
    expect((await db.getAll('backups'))[0].data).toEqual(d);
    db.close();
  });
  it('rejects invalid imports without changing saved data', async () => {
    const d = fixture(),
      dbname = name();
    await saveData(d, dbname);
    await expect(restoreBackup(d, { history: [] }, dbname)).rejects.toThrow();
    expect(await loadData({ getItem: () => null }, dbname)).toEqual(migratePrograms(d));
  });
});
describe('core workouts', () => {
  it('starts an independent workout with the existing easy-leg template', () => {
    const d = emptyData(),
      w = createWorkout('Sunday · Legs', 'easy', d.plan, 1000);
    expect(w.exercises[0].name).toBe('Bulgarian Split Squat');
    w.exercises[0].sets[0].reps = '8';
    expect(d.plan['Sunday · Legs · Easy'][0][1]).toBe(4);
  });
  it('requires reps, toggles completion and starts a timestamp-based rest timer', () => {
    const d = emptyData(),
      w = createWorkout('Tuesday · Bench focus', 'heavy', d.plan);
    expect(() => completeSet(w, 0, 0)).toThrow();
    w.exercises[0].sets[0].reps = '8';
    w.exercises[0].sets[0].weight = '60';
    const result = completeSet(w, 0, 0, 1000);
    expect(result.restEnd).toBe(181000);
    expect(result.exercises[0].sets[0].done).toBe(true);
    expect(w.exercises[0].sets[0].done).toBe(false);
    expect(completeSet(result, 0, 0).exercises[0].sets[0].done).toBe(false);
  });
  it('finishes a workout without losing any previous sessions and survives storage reload', async () => {
    const d = fixture(),
      dbname = name();
    d.active = createWorkout('Sunday · Legs', 'heavy', d.plan);
    const result = finishWorkout(d, 12345);
    expect(result.history).toHaveLength(2);
    expect(result.history[1]).toEqual(d.history[0]);
    expect(result.active).toBeNull();
    await saveData(result, dbname);
    expect(await loadData({ getItem: () => null }, dbname)).toEqual(migratePrograms(result));
  });
});

it('retains a conflicting imported active session once and restores backup preferences', () => {
  const d = fixture();
  d.active = createWorkout('Sunday · Legs', 'heavy', d.plan, 1000);
  const incoming = emptyData();
  incoming.active = createWorkout('Tuesday · Bench focus', 'easy', incoming.plan, 2000);
  incoming.restDefault = 90;
  incoming.plan['Tuesday · Bench focus'][0][1] = 5;
  const merged = mergeBackup(d, incoming);
  expect(merged.active).toEqual(d.active);
  expect(merged.history).toHaveLength(2);
  expect(mergeBackup(merged, incoming).history).toHaveLength(2);
  expect(merged.restDefault).toBe(90);
  expect(merged.plan['Tuesday · Bench focus'][0][1]).toBe(5);
});
