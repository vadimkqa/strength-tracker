import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import {
  emptyData,
  createWorkout,
  saveData,
  mergeBackup,
  loadData,
  parseData,
  openStore,
  type Data,
  type Workout,
} from './data';
import { applyProgram } from './importing/saving';
import { parseProgram } from './importing/parser';
import { textDocument } from './importing/extraction';
import { programIssues } from './importing/model';
import { currentProgram } from './programs';
import {
  syncStreaks,
  calculateStreak,
  calendarWeek,
  localDate,
  addDays,
  configureStreak,
  STREAK_LEVELS,
  levelFor,
  workoutStreakReason,
} from './streak';
import { initializeStreaks } from './streak-storage';
import { createDatabaseBackup, inspectBackup, restoreDatabaseBackup } from './backup';
const at = (date: string) => Date.parse(date + 'T12:00:00Z');
export function streakFixture(count = 3, second?: number, scheduled = true): Data {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const text =
    `Program: Strength ${count}\n` +
    [count, ...(second ? [second] : [])]
      .map(
        (n, index) =>
          `${second ? `Week ${index + 1}\n` : ''}` +
          Array.from(
            { length: n },
            (_, i) =>
              `${scheduled ? days[i] + ': ' : ''}Workout ${String.fromCharCode(65 + i)}:\n- Exercise ${i + 1} 2x8 rest 90s`,
          ).join('\n'),
      )
      .join('\n');
  const p = parseProgram(textDocument(text));
  programIssues(p).forEach((i) => (i.reviewed = true));
  return applyProgram(emptyData(), p, true);
}
export function completed(d: Data, template: string, date: string): Workout {
  const w = createWorkout(template, 'heavy', d.plan, at(date) - 600000, [], {
    displayName: 'Saved workout',
    cycleWeek: d.trainingProgram!.workouts.find((t) => t.id === template)!.week,
  });
  w.programId = d.activeProgramId;
  w.finished = at(date);
  w.exercises.forEach((e) =>
    e.sets.forEach((s) => Object.assign(s, { weight: '50', reps: '8', done: true })),
  );
  return w;
}
export function fillWeek(d: Data, date: string, cycle = 1) {
  d.trainingProgram!.workouts.filter((w) => w.week === cycle).forEach((w, i) =>
    d.history.push(completed(d, w.id, addDays(date, i))),
  );
}
for (const n of [3, 4, 5])
  it(`uses all ${n} scheduled workouts, never a hardcoded four`, () => {
    let d = streakFixture(n);
    fillWeek(d, '2026-10-26');
    d = syncStreaks(d, at('2026-11-01'), 'UTC');
    expect(calculateStreak(d, at('2026-11-01')).current).toBe(1);
    expect(calculateStreak(d, at('2026-11-01')).currentWeek!.chosen!.goal.target).toBe(n);
    expect(d.streak!.awards).toEqual([]);
  });
it('counts consecutive successful weeks, preserves a pending current week, then breaks on a failed past week', () => {
  let d = streakFixture();
  fillWeek(d, '2026-10-19');
  fillWeek(d, '2026-10-26');
  d = syncStreaks(d, at('2026-11-04'), 'UTC');
  expect(calculateStreak(d, at('2026-11-04')).current).toBe(2);
  expect(calculateStreak(d, at('2026-11-04')).longest).toBe(2);
  d = syncStreaks(d, at('2026-11-09'));
  expect(calculateStreak(d, at('2026-11-09')).current).toBe(0);
  expect(d.streak!.awards.find((a) => a.id === 'first-plates')!.valid).toBe(true);
});
it('a missing scheduled workout cannot be replaced by duplicates or extra repeats, even on other days', () => {
  let d = streakFixture(4);
  const ts = d.trainingProgram!.workouts;
  d.history = [
    completed(d, ts[0].id, '2026-10-26'),
    completed(d, ts[1].id, '2026-10-27'),
    completed(d, ts[2].id, '2026-10-28'),
    completed(d, ts[0].id, '2026-10-29'),
  ];
  d.history.push({ ...structuredClone(d.history[0]), id: 'copy' });
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  expect(calculateStreak(d, at('2026-11-01')).currentWeek!.chosen!.completed).toBe(3);
  expect(calculateStreak(d, at('2026-11-01')).current).toBe(0);
  d.history.push(completed(d, ts[3].id, '2026-11-01'));
  d = syncStreaks(d, at('2026-11-01'));
  expect(calculateStreak(d, at('2026-11-01')).current).toBe(1);
});
it('duplicate record IDs cannot fill two different scheduled slots', () => {
  let d = streakFixture(3);
  fillWeek(d, '2026-10-26');
  d.history[1].id = d.history[0].id;
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  expect(calculateStreak(d, at('2026-11-01')).currentWeek!.chosen!.completed).toBe(2);
});
it('uses the applicable multi-week schedule and calendar rotation without changing home selection', () => {
  let d = streakFixture(3, 5);
  fillWeek(d, '2026-10-19', 1);
  fillWeek(d, '2026-10-26', 2);
  d.rotationWeek = 1;
  d = syncStreaks(d, at('2026-11-04'), 'UTC');
  const r = calculateStreak(d, at('2026-11-04'));
  expect(r.current).toBe(2);
  expect(r.weeks.map((w) => w.chosen?.goal.target)).toEqual([3, 5, 3]);
  expect(d.rotationWeek).toBe(1);
  d.rotationWeek = 2;
  d = syncStreaks(d, at('2026-11-04'));
  expect(calculateStreak(d, at('2026-11-04')).currentWeek!.chosen!.goal.cycleWeek).toBe(1);
});
it('honors the imported rotation order rather than sorting cycle numbers', () => {
  const p = parseProgram(
    textDocument(
      'Program: Ordered rotation\n' +
        [1, 2, 3]
          .map(
            (week) =>
              `Week ${week}\n` +
              Array.from(
                { length: week },
                (_, i) => `Workout ${String.fromCharCode(65 + i)}:\n- Exercise ${i + 1} 2x8`,
              ).join('\n'),
          )
          .join('\n'),
    ),
  );
  programIssues(p).forEach((i) => (i.reviewed = true));
  p.rotation = { weeks: [1, 3, 2], repeat: true };
  let d = applyProgram(emptyData(), p, true);
  fillWeek(d, '2026-10-19', 1);
  fillWeek(d, '2026-10-26', 3);
  d = syncStreaks(d, at('2026-11-04'), 'UTC');
  const report = calculateStreak(d, at('2026-11-04'));
  expect(report.current).toBe(2);
  expect(report.weeks.map((w) => w.chosen?.goal.target)).toEqual([1, 3, 2]);
});
it('unscheduled plans need an explicit target; repeats count once per local day and extra logs are capped', () => {
  let d = streakFixture(1, undefined, false);
  d = syncStreaks(d, at('2026-10-28'), 'UTC');
  expect(calculateStreak(d, at('2026-10-28')).currentWeek!.chosen!.goal.target).toBeNull();
  d = configureStreak(d, { target: 3 }, at('2026-10-28'));
  const template = d.trainingProgram!.workouts[0].id;
  d.history = [completed(d, template, '2026-10-26'), completed(d, template, '2026-10-26')];
  d = syncStreaks(d, at('2026-10-28'));
  expect(calculateStreak(d, at('2026-10-28')).currentWeek!.chosen!.completed).toBe(1);
  d.history.push(
    completed(d, template, '2026-10-27'),
    completed(d, template, '2026-10-28'),
    completed(d, template, '2026-10-29'),
  );
  d = syncStreaks(d, at('2026-10-30'));
  expect(calculateStreak(d, at('2026-10-30')).currentWeek!.chosen!.completed).toBe(3);
  expect(calculateStreak(d, at('2026-10-30')).current).toBe(1);
});
it('does not retroactively invent a target for unconfigured past weeks', () => {
  let d = streakFixture(1, undefined, false);
  d = syncStreaks(d, at('2026-10-26'), 'UTC');
  d = configureStreak(d, { target: 1 }, at('2026-11-02'));
  expect(
    d.streak!.weeks.find((w) => w.week === '2026-10-26')!.goals.every((g) => g.target === null),
  ).toBe(true);
});
it('allows either complete plan in a switch week, never mixes partial plans and retains historical requirements', () => {
  let a = streakFixture(3);
  fillWeek(a, '2026-10-19');
  a = syncStreaks(a, at('2026-10-26'), 'UTC');
  const old = structuredClone(a.streak!.weeks[0]);
  const oldId = a.activeProgramId!;
  a.history.push(completed(a, a.trainingProgram!.workouts[0].id, '2026-10-26'));
  const b = streakFixture(4),
    p = structuredClone(b.trainingProgram!);
  p.name = 'Other program';
  let d = applyProgram(a, p, true);
  const ts = d.trainingProgram!.workouts;
  d.history.push(completed(d, ts[0].id, '2026-10-27'), completed(d, ts[1].id, '2026-10-28'));
  d = syncStreaks(d, at('2026-10-29'));
  expect(calculateStreak(d, at('2026-10-29')).current).toBe(1);
  expect(d.streak!.weeks[0]).toEqual(old);
  d.history.push(completed(d, ts[2].id, '2026-10-29'), completed(d, ts[3].id, '2026-10-30'));
  d = syncStreaks(d, at('2026-10-30'));
  expect(calculateStreak(d, at('2026-10-30')).current).toBe(2);
  expect(d.streak!.weeks[1].goals.some((g) => g.programId === oldId)).toBe(true);
  d = syncStreaks(d, at('2026-11-03'));
  expect(calculateStreak(d, at('2026-11-03')).currentWeek!.goals).toHaveLength(1);
  expect(calculateStreak(d, at('2026-11-03')).currentWeek!.chosen!.goal.target).toBe(4);
});
it('switching plans after completing the week never removes that legitimate success', () => {
  let d = streakFixture(3);
  fillWeek(d, '2026-10-26');
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  d = applyProgram(d, streakFixture(5).trainingProgram!, true);
  d = syncStreaks(d, at('2026-11-01'));
  expect(calculateStreak(d, at('2026-11-01')).current).toBe(1);
});
it('retains past snapshots when a program schedule changes', () => {
  let d = streakFixture(3);
  fillWeek(d, '2026-10-26');
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  const saved = structuredClone(d.streak!.weeks[0]);
  const modified = streakFixture(4).trainingProgram!;
  currentProgram(d)!.program = modified;
  d.trainingProgram = modified;
  d = syncStreaks(d, at('2026-11-03'));
  expect(d.streak!.weeks[0]).toEqual(saved);
  expect(calculateStreak(d, at('2026-11-03')).currentWeek!.chosen!.goal.target).toBe(4);
});
it('manual edits, exclusions and history deletion recalculate totals and revalidate award evidence', () => {
  let d = streakFixture(3);
  fillWeek(d, '2026-10-19');
  fillWeek(d, '2026-10-26');
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  expect(d.streak!.awards[0].valid).toBe(true);
  d.history[0].exercises[0].sets[0].reps = '';
  d = syncStreaks(d, at('2026-11-01'));
  expect(calculateStreak(d, at('2026-11-01')).longest).toBe(1);
  expect(d.streak!.awards[0].valid).toBe(false);
  d.history[0].exercises[0].sets[0].reps = '8';
  d = syncStreaks(d, at('2026-11-01'));
  expect(d.streak!.awards[0].valid).toBe(true);
  d.history[3].streakExcluded = true;
  d = syncStreaks(d, at('2026-11-01'));
  expect(calculateStreak(d, at('2026-11-01')).current).toBe(1);
  d.history.splice(3, 1);
  d = syncStreaks(d, at('2026-11-01'));
  expect(calculateStreak(d, at('2026-11-01')).current).toBe(1);
});
it('never qualifies active, cancelled, abandoned, test, invalid or incomplete required logs; optional skips are allowed', () => {
  const d = streakFixture(3),
    w = completed(d, d.trainingProgram!.workouts[0].id, '2026-10-26');
  for (const patch of [
    { finished: undefined },
    { isTest: true },
    { cancelled: true },
    { abandoned: true },
    { status: 'test' },
    { streakExcluded: true },
  ])
    expect(workoutStreakReason({ ...w, ...patch }, at('2026-10-27'))).not.toBeNull();
  const copy = structuredClone(w);
  copy.exercises[0].sets[0].skipped = true;
  expect(workoutStreakReason(copy, at('2026-10-27'))).not.toBeNull();
  copy.exercises.push(structuredClone(w.exercises[0]));
  copy.exercises[0].optional = true;
  copy.exercises[0].sets[0].done = false;
  expect(workoutStreakReason(copy, at('2026-10-27'))).toBeNull();
});
it('requires exact verified ownership; ambiguous legacy history is preserved but not credited', () => {
  let d = streakFixture(3);
  fillWeek(d, '2026-10-26');
  d = applyProgram(d, d.trainingProgram!, true);
  d.history.forEach((w) => delete w.programId);
  const history = structuredClone(d.history);
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  expect(calculateStreak(d, at('2026-11-01')).current).toBe(0);
  expect(d.history).toEqual(history);
});
it('handles Monday/Sunday, year boundaries, half-hour offsets and DST using calendar dates', () => {
  expect(calendarWeek(Date.parse('2026-03-29T22:30Z'), 'Europe/Vienna')).toBe('2026-03-30');
  expect(calendarWeek(Date.parse('2026-03-29T22:30Z'), 'UTC')).toBe('2026-03-23');
  expect(calendarWeek(Date.parse('2026-10-25T23:30Z'), 'Europe/Vienna')).toBe('2026-10-26');
  expect(calendarWeek(Date.parse('2026-10-25T23:30Z'), 'America/New_York')).toBe('2026-10-19');
  expect(calendarWeek(Date.parse('2025-12-31T10:00Z'), 'UTC')).toBe('2025-12-29');
  expect(localDate(Date.parse('2026-10-25T20:00Z'), 'Asia/Kolkata')).toBe('2026-10-26');
});
it('uses saved completion time rather than start time at a timezone boundary', () => {
  let d = streakFixture(1);
  const w = completed(d, d.trainingProgram!.workouts[0].id, '2026-03-29');
  w.started = Date.parse('2026-03-29T21:30Z');
  w.finished = Date.parse('2026-03-29T22:30Z');
  d.history = [w];
  d = syncStreaks(d, Date.parse('2026-03-30T12:00Z'), 'Europe/Vienna');
  expect(calculateStreak(d, Date.parse('2026-03-30T12:00Z')).currentWeek!.chosen!.completed).toBe(
    1,
  );
});
it('unlocks every configurable milestone through Crystal and retains them when a later week is missed', () => {
  let d = streakFixture(1);
  for (let i = 0; i < 52; i++) fillWeek(d, addDays('2025-11-03', i * 7));
  const end = addDays('2025-11-03', 51 * 7);
  d = syncStreaks(d, at(addDays(end, 6)), 'UTC');
  expect(calculateStreak(d, at(addDays(end, 6))).current).toBe(52);
  expect(levelFor(52).material).toBe('crystal');
  expect(d.streak!.awards.filter((a) => a.valid).map((a) => a.id)).toEqual(
    STREAK_LEVELS.filter((l) => l.weeks > 0).map((l) => l.id),
  );
  d = syncStreaks(d, at(addDays(end, 14)));
  expect(calculateStreak(d, at(addDays(end, 14))).current).toBe(0);
  expect(d.streak!.awards.every((a) => a.valid)).toBe(true);
});
it('supports old sparse history without creating thousands of empty persisted goals and respects calendar gaps', () => {
  let d = streakFixture(1);
  fillWeek(d, '1970-01-05');
  d = syncStreaks(d, at('2026-11-02'), 'UTC');
  expect(d.streak!.weeks.length).toBeLessThan(110);
  expect(calculateStreak(d, at('2026-11-02')).current).toBe(0);
  expect(calculateStreak(d, at('2026-11-02')).longest).toBe(1);
  expect(() => parseData(d)).not.toThrow();
});
it('persists reload, snapshots, award history and JSON backup/restore without overwriting other history', async () => {
  let d = streakFixture(3);
  fillWeek(d, '2026-10-19');
  fillWeek(d, '2026-10-26');
  const name = crypto.randomUUID();
  await saveData(d, name);
  d = await initializeStreaks(d, 'UTC', name, at('2026-11-01'));
  const loaded = await loadData({ getItem: () => null }, name);
  expect(loaded.streak).toEqual(d.streak);
  const db = await openStore(name);
  expect((await db.getAll('backups'))[0].kind).toBe('before-strength-streak');
  db.close();
  const file = await createDatabaseBackup(d, name),
    preview = inspectBackup(JSON.parse(JSON.stringify(file)));
  expect(preview.data.streak).toEqual(d.streak);
  const restored = await restoreDatabaseBackup(emptyData(), file, true, crypto.randomUUID());
  expect([...restored.history].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
    [...d.history].sort((a, b) => a.id.localeCompare(b.id)),
  );
  expect(restored.streak!.awards.find((a) => a.id === 'first-plates')!.valid).toBe(true);
  const again = await restoreDatabaseBackup(restored, file, true, crypto.randomUUID());
  expect(again.streak!.awards).toHaveLength(restored.streak!.awards.length);
  expect(() => parseData({ ...d, streak: { ...d.streak, timeZone: 'not/a/zone' } })).toThrow(
    'Streak',
  );
});
it('aborts streak initialization and its safety snapshot if storage fails', async () => {
  const d = streakFixture(3),
    name = crypto.randomUUID();
  await saveData(d, name);
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    v: any,
    k?: IDBValidKey,
  ) {
    if (this.name === 'state') throw Error('disk full');
    return put.call(this, v, k!);
  });
  try {
    await expect(initializeStreaks(d, 'UTC', name, at('2026-11-01'))).rejects.toThrow('disk full');
  } finally {
    spy.mockRestore();
  }
  const db = await openStore(name);
  expect(await db.get('state', 'current')).toEqual(d);
  expect(await db.getAll('backups')).toEqual([]);
  db.close();
});

it('a calendar rollover recalculates missed gaps even before another metadata write succeeds', () => {
  let d = streakFixture(1);
  fillWeek(d, '2026-10-26');
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  expect(calculateStreak(d, at('2026-11-03')).current).toBe(1);
  expect(calculateStreak(d, at('2026-11-16')).current).toBe(0);
});
it('preserves verified historical goal ownership independently of the current editable library', () => {
  let d = streakFixture(1);
  fillWeek(d, '2026-10-26');
  d = syncStreaks(d, at('2026-11-01'), 'UTC');
  d.programs = d.programs!.filter((p) => p.id !== d.activeProgramId);
  expect(calculateStreak(d, at('2026-11-01')).current).toBe(1);
});

it('restores timezone and all explicit targets while retaining requirements from both program histories', () => {
  let a = configureStreak(
    syncStreaks(streakFixture(1, undefined, false), at('2026-11-01'), 'UTC'),
    { target: 2 },
    at('2026-11-01'),
  );
  let b = configureStreak(
    syncStreaks(streakFixture(1, undefined, false), at('2026-11-01'), 'UTC'),
    { target: 5, timeZone: 'Europe/Vienna' },
    at('2026-11-01'),
  );
  const result = mergeBackup(a, b);
  expect(result.streak!.timeZone).toBe('Europe/Vienna');
  expect(result.streak!.targets[a.activeProgramId!]).toBe(2);
  expect(result.streak!.targets[b.activeProgramId!]).toBe(5);
  expect(result.streak!.policies.length).toBeGreaterThanOrEqual(
    a.streak!.policies.length + b.streak!.policies.length,
  );
});
it('a restored conflicting program keeps its explicit target under its new ID without changing the resident target', () => {
  const original = configureStreak(
    syncStreaks(streakFixture(1, undefined, false), at('2026-11-01'), 'UTC'),
    { target: 2 },
    at('2026-11-01'),
  );
  let incoming = structuredClone(original);
  currentProgram(incoming)!.name = 'Restored version';
  currentProgram(incoming)!.program!.name = 'Restored version';
  incoming.trainingProgram!.name = 'Restored version';
  incoming = configureStreak(incoming, { target: 5 }, at('2026-11-01'));
  const restored = mergeBackup(original, incoming);
  expect(restored.activeProgramId).not.toBe(original.activeProgramId);
  expect(restored.streak!.targets[original.activeProgramId!]).toBe(2);
  expect(restored.streak!.targets[restored.activeProgramId!]).toBe(5);
});

it('recognizes a single explicit table week while leaving blank implicit week columns unspecified', () => {
  for (const value of ['1', '']) {
    const rows = [
      ['Week', 'Workout', 'Exercise', 'Sets', 'Reps'],
      [value, 'A', 'Press', '2', '8'],
      [value, 'B', 'Row', '2', '8'],
    ];
    const p = parseProgram({
      name: 'weekly.csv',
      format: 'csv',
      text: rows.map((r) => r.join('\t')).join('\n'),
      blocks: [{ rows }],
      warnings: [],
    });
    programIssues(p).forEach((i) => (i.reviewed = true));
    const d = syncStreaks(applyProgram(emptyData(), p, true), at('2026-11-10'), 'UTC');
    expect(calculateStreak(d, at('2026-11-10')).currentWeek!.chosen!.goal.target).toBe(
      value === '1' ? 2 : null,
    );
    expect(calculateStreak(d, at('2026-11-10')).currentWeek!.chosen!.goal.showCycle).toBe(
      value === '1',
    );
  }
});

it('does not mistake relative Day 1/Day 2 labels for a defined weekly frequency', () => {
  const p = streakFixture(3).trainingProgram!;
  p.workouts.forEach((w, i) => (w.day = `Day ${i + 1}`));
  const d = syncStreaks(applyProgram(emptyData(), p, true), at('2026-11-10'), 'UTC');
  expect(calculateStreak(d, at('2026-11-10')).currentWeek!.chosen!.goal.target).toBeNull();
});
