import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createWorkout, emptyData, loadData, mergeBackup, parseData, saveData } from './data';
import { backupFile, createDatabaseBackup, parseBackup, restoreDatabaseBackup } from './backup';
import {
  assertRecordPreferences,
  mergeRecordPreferences,
  moveFavorite,
  toggleFavorite,
} from './record-preferences';
it('toggles and reorders stable favorites without mutating prior order', () => {
  const source = ['bench', 'curl', 'leg'];
  expect(toggleFavorite(source, 'curl')).toEqual(['bench', 'leg']);
  expect(toggleFavorite(source, 'row')).toEqual([...source, 'row']);
  expect(moveFavorite(source, 'curl', -1)).toEqual(['curl', 'bench', 'leg']);
  expect(moveFavorite(source, 'leg', 1)).toEqual(source);
  expect(moveFavorite(source, 'unknown', -1)).toEqual(source);
  expect(source).toEqual(['bench', 'curl', 'leg']);
});
it('validates optional preferences without rejecting legacy saved history', () => {
  expect(parseData(emptyData()).prPreferences).toBeUndefined();
  for (const value of [
    null,
    {},
    { favorites: 'bench' },
    { favorites: ['bench', 'bench'] },
    { favorites: [3] },
    { favorites: [''] },
  ])
    expect(() => assertRecordPreferences(value)).toThrow('preferences');
  expect(() => assertRecordPreferences({ favorites: [] })).not.toThrow();
});
it('preserves resident order, restores incoming-only favorites and keeps old backup compatibility', () => {
  expect(
    mergeRecordPreferences({ favorites: ['curl', 'bench'] }, { favorites: ['leg', 'bench'] }),
  ).toEqual({ favorites: ['curl', 'bench', 'leg'] });
  const current = { ...emptyData(), prPreferences: { favorites: ['curl', 'bench'] } };
  expect(mergeBackup(current, emptyData()).prPreferences).toEqual(current.prPreferences);
  expect(mergeBackup(emptyData(), current).prPreferences).toEqual(current.prPreferences);
});
it('persists favorites and order through IndexedDB reload, database backup and additive restoration without touching history or unknown preferences', async () => {
  const name = crypto.randomUUID(),
    d = emptyData();
  const session = createWorkout('Tuesday · Bench focus', 'heavy', d.plan, 1000);
  session.finished = 2000;
  session.exercises[0].sets[0] = { weight: '60', reps: '8', done: true };
  d.history = [session];
  d.prPreferences = { favorites: ['exercise:curl', 'exercise:bench'] };
  d.preferences = { haptics: false };
  d.customField = { untouched: true };
  await saveData(d, name);
  const loaded = await loadData({ getItem: () => null }, name);
  expect(loaded.prPreferences).toEqual(d.prPreferences);
  const exported = await createDatabaseBackup(loaded, name),
    parsed = parseBackup(await backupFile(exported).text());
  expect(parsed.data.prPreferences).toEqual(d.prPreferences);
  const resident = {
    ...emptyData(),
    prPreferences: { favorites: ['exercise:row', 'exercise:bench'] },
  };
  const before = structuredClone(parsed.data.history);
  const restored = await restoreDatabaseBackup(resident, exported, true, name);
  expect(restored.prPreferences?.favorites).toEqual([
    'exercise:row',
    'exercise:bench',
    'exercise:curl',
  ]);
  expect(restored.history).toEqual(before);
  expect(restored.preferences).toEqual({ haptics: false });
  expect(restored.customField).toEqual({ untouched: true });
  expect((await loadData({ getItem: () => null }, name)).prPreferences).toEqual(
    restored.prPreferences,
  );
});
