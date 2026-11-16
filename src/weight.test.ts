import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import {
  adjustWeight,
  normalizedWeight,
  sumVolumes,
  weightDraft,
  weightValue,
  weightVolume,
} from './weight';
import { createWorkout, emptyData, loadData, saveData } from './data';
import { validLog } from './controller';
import { previousPerformance } from './performance';
import { personalRecords, workoutStatistics } from './workout-results';
import { chartPoints, exerciseRecords } from './records';
import { backupFile, createDatabaseBackup, parseBackup, restoreDatabaseBackup } from './backup';
import { workoutCompletion } from './workout-completion';
it.each([
  '0.125',
  '0.25',
  '0.5',
  '0.75',
  '7.5',
  '7.75',
  '8.125',
  '0',
  '80',
  '7,5',
  '7,75',
  '8,125',
  '.125',
  ',125',
])('accepts decimal kg %s without integer rounding', (value) => {
  expect(weightValue(value)).toBe(Number(value.replace(',', '.')));
  expect(validLog({ weight: value, reps: '8', done: false })).toBe(true);
});
it('preserves partial decimal drafts and normalizes only separators during typing', () => {
  expect(weightDraft('7.')).toBe('7.');
  expect(weightDraft('7,')).toBe('7.');
  expect(weightDraft('0.12')).toBe('0.12');
  expect(weightDraft('.')).toBe('.');
  expect(normalizedWeight('007,500')).toBe('7.5');
  expect(normalizedWeight('8.125')).toBe('8.125');
  expect(normalizedWeight('7.')).toBe('7');
  expect(normalizedWeight('.')).toBeNull();
});
it.each(['', '-1', '-0.125', '7.1234', '7,5.2', 'NaN', 'Infinity', '1e3', '0x10', '7 kg'])(
  'rejects invalid new weight %s',
  (value) => expect(weightValue(value)).toBeNull(),
);
it('keeps reps whole and weight precision independent of quarter-kg increments', () => {
  expect(validLog({ weight: '7.751', reps: '8', done: false })).toBe(true);
  for (const reps of ['7.5', '0', '-1', 'bad'])
    expect(validLog({ weight: '7.75', reps, done: false })).toBe(false);
});
it('uses exact arithmetic for repeated increments, arbitrary three-place starts and zero boundaries', () => {
  let value = '0.125';
  for (let i = 0; i < 40; i++) value = adjustWeight(value, 250)!;
  expect(value).toBe('10.125');
  for (let i = 0; i < 20; i++) value = adjustWeight(value, -500)!;
  expect(value).toBe('0.125');
  expect(adjustWeight(value, -250)).toBe('0');
  expect(adjustWeight('0', -500)).toBe('0');
  expect(adjustWeight('', 250)).toBe('0.25');
  expect(adjustWeight('7,75', 500)).toBe('8.25');
  expect(adjustWeight('7.', 250)).toBe('7.25');
  expect(adjustWeight('bad', 250)).toBeNull();
  expect(adjustWeight('7.1234', 250)).toBeNull();
  expect(adjustWeight('9.5', 500)).toBe('10');
  expect(adjustWeight('99.5', 500)).toBe('100');
});
it('sums fractional load volume without binary arithmetic drift', () => {
  expect(weightVolume('0.1', 3)).toBe(0.3);
  expect(sumVolumes([0.1, 0.2])).toBe(0.3);
  expect(weightVolume('8.125', 3)).toBe(24.375);
});
it('preserves fractional and original integer records in previous performance, PRs, charts, summaries, active reload and database backup/restore', async () => {
  const d = emptyData(),
    at = Date.parse('2026-11-15T12:00:00Z');
  const w = createWorkout('Tuesday · Bench focus', 'heavy', d.plan, at - 1000);
  w.finished = at;
  w.exercises[0].sets = [
    { weight: '8.125', reps: '3', done: true },
    { weight: '0.125', reps: '1', done: true },
    { weight: '7,75', reps: '5', done: true },
  ];
  const old = structuredClone(w);
  old.id = 'integer-history';
  old.finished = at - 86400000;
  old.exercises[0].sets = [{ weight: '7', reps: '5', done: true }];
  d.history = [w, old];
  d.active = createWorkout('Tuesday · Bench focus', 'heavy', d.plan, at + 1000, d.history);
  d.active.exercises[0].sets[0].weight = '7.75';
  const original = structuredClone(d.history),
    ex = w.exercises[0];
  expect(previousPerformance(w, ex, [w])?.sets[1].weight).toBe('8.125');
  expect(previousPerformance(w, ex, [w])?.sets[3].weight).toBe('7.75');
  expect(personalRecords(d.history).get(ex.name)).toEqual({ weight: 8.125, reps: 3 });
  const record = exerciseRecords(d.history).find((r) => r.name === ex.name)!;
  expect(chartPoints(record, 'weight', 'all', at).map((p) => p.value)).toEqual([7, 8.125]);
  expect(chartPoints(record, 'volume', 'all', at).map((p) => p.value)).toEqual([35, 63.25]);
  expect(workoutStatistics(w).volume).toBe(63.25);
  expect(workoutCompletion(d, w.id)!.volume).toBe(63.25);
  const name = crypto.randomUUID();
  await saveData(d, name);
  const loaded = await loadData({ getItem: () => null }, name);
  expect(loaded.active!.exercises[0].sets[0].weight).toBe('7.75');
  expect(loaded.history).toEqual(original);
  const backup = await createDatabaseBackup(loaded, name),
    parsed = parseBackup(await backupFile(backup).text());
  expect(parsed.data.history).toEqual(original);
  const restored = await restoreDatabaseBackup(emptyData(), backup, true, crypto.randomUUID());
  expect(restored.history).toEqual(original);
  expect(restored.active!.exercises[0].sets[0].weight).toBe('7.75');
  expect(d.history).toEqual(original);
});
