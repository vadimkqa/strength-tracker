import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import { calendarFixture, noon } from '../tests/calendar-fixture';
import { streakFixture, fillWeek } from '../tests/streak-unit-fixture';
import { currentProgram } from './programs';
import {
  syncStreaks,
  calculateStreak,
  configureStreak,
  workoutStreakReason,
  STREAK_LEVELS,
} from './streak';
import { initializeStreaks } from './streak-storage';
import { saveData, openStore, mergeBackup, parseData, type Workout } from './data';
const session = (date: string, patch: Partial<Workout> = {}): Workout => ({
  id: crypto.randomUUID(),
  name: 'Freestyle strength',
  week: 'heavy',
  started: noon(date) - 3600000,
  finished: noon(date),
  restEnd: null,
  restSeconds: null,
  exercises: [],
  ...patch,
});
const report = (d: ReturnType<typeof calendarFixture>, date = '2026-11-15') =>
  calculateStreak(syncStreaks(d, noon(date)), noon(date));
it('counts Bench, DB Press and Leg as 3/4 despite changed names, skipped sets and different program IDs', () => {
  let d = calendarFixture();
  d.history = ['2026-11-10', '2026-11-12', '2026-11-13'].map((date, i) =>
    session(date, {
      name: ['Bench Day changed', 'DB Press alternative', 'Leg workout'][i],
      programId: 'unrelated-import',
      exercises: [
        {
          id: crypto.randomUUID(),
          name: 'Unrecognized exercise',
          rest: null,
          skipped: true,
          sets: [{ done: false, skipped: true, needsLogging: true, weight: '', reps: '' }],
        },
      ],
    }),
  );
  const original = structuredClone(d.history);
  d = syncStreaks(d, noon('2026-11-13'));
  const r = calculateStreak(d, noon('2026-11-13'));
  expect(r.currentWeek!.chosen).toMatchObject({ completed: 3, goal: { target: 4 } });
  expect(r.currentWeek!.chosen!.days.filter((d) => d.complete)).toHaveLength(3);
  expect(d.history).toEqual(original);
});
it('marks a missed Saturday separately, then allows a Sunday rest-day make-up to complete the week', () => {
  const d = calendarFixture();
  d.history = ['2026-11-10', '2026-11-12', '2026-11-13'].map((date) => session(date));
  const before = report(d);
  expect(before.currentWeek!.chosen!.completed).toBe(3);
  expect(before.currentWeek!.chosen!.days[5]).toMatchObject({ state: 'missed', scheduled: true });
  expect(before.currentWeek!.chosen!.days[6]).toMatchObject({ state: 'rest', complete: false });
  d.history.push(session('2026-11-15'));
  const after = report(d);
  expect(after.current).toBe(1);
  expect(after.currentWeek!.chosen!.completed).toBe(4);
  expect(after.currentWeek!.chosen!.days[5].state).toBe('missed');
  expect(after.currentWeek!.chosen!.days[6]).toMatchObject({
    state: 'completed',
    scheduled: false,
  });
});
it('deduplicates across workout names and programs on one date, but counts each different date once', () => {
  const d = calendarFixture();
  d.history = Array.from({ length: 4 }, (_, i) =>
    session('2026-11-10', {
      name: `Workout ${i}`,
      programId: `program-${i}`,
      started: noon('2026-11-10') - 3600000 - i * 60000,
    }),
  );
  expect(report(d).currentWeek!.chosen!.completed).toBe(1);
  d.history.push(
    ...['2026-11-09', '2026-11-11', '2026-11-15'].map((date) =>
      session(date, { name: 'Same modified routine' }),
    ),
  );
  expect(report(d).currentWeek!.chosen!.completed).toBe(4);
  expect(report(d).current).toBe(1);
});
it('rest days alone never add progress and active or excluded sessions do not count', () => {
  const d = calendarFixture();
  expect(report(d).currentWeek!.chosen!.completed).toBe(0);
  d.active = session('2026-11-10');
  expect(report(d).currentWeek!.chosen!.completed).toBe(0);
  const base = session('2026-11-10');
  for (const patch of [
    { finished: undefined },
    { finished: base.started },
    { finished: noon('2027-01-01') },
    { streakExcluded: true },
    { isTest: true },
    { cancelled: true },
    { abandoned: true },
    { status: 'test' },
  ])
    expect(workoutStreakReason({ ...base, ...patch }, noon('2026-11-15'))).not.toBeNull();
  expect(workoutStreakReason(base, noon('2026-11-15'))).toBeNull();
});
it('uses distinct scheduled weekdays, not session/template count, and supports an override for any plan', () => {
  let d = streakFixture(4);
  const p = currentProgram(d)!;
  p.program!.workouts[1].day = 'Monday';
  d.trainingProgram = structuredClone(p.program);
  d = syncStreaks(d, noon('2026-11-10'));
  expect(calculateStreak(d, noon('2026-11-10')).currentWeek!.chosen!.goal.target).toBe(3);
  d = configureStreak(d, { target: 5 }, noon('2026-11-10'));
  expect(calculateStreak(d, noon('2026-11-10')).currentWeek!.chosen!.goal.target).toBe(5);
  expect(() => configureStreak(d, { target: 8 })).toThrow('1–7');
  d = configureStreak(d, { target: null, weekdays: [0, 2, 4] }, noon('2026-11-10'));
  expect(calculateStreak(d, noon('2026-11-10')).currentWeek!.chosen!.goal).toMatchObject({
    target: 3,
    weekdays: [0, 2, 4],
  });
  d = configureStreak(d, { weekdays: null }, noon('2026-11-10'));
  expect(calculateStreak(d, noon('2026-11-10')).currentWeek!.chosen!.goal.target).toBe(3);
});
it('requires weekday or target configuration for unscheduled plans; all remaining chosen weekdays are rest days', () => {
  let d = syncStreaks(streakFixture(2, undefined, false), noon('2026-11-10'));
  expect(calculateStreak(d, noon('2026-11-10')).currentWeek!.chosen!.goal.target).toBeNull();
  d = configureStreak(d, { weekdays: [1, 3, 5] }, noon('2026-11-10'));
  const g = calculateStreak(d, noon('2026-11-10')).currentWeek!.chosen!;
  expect(g.goal.target).toBe(3);
  expect(g.days.filter((d) => d.scheduled)).toHaveLength(3);
  expect(g.days.filter((d) => d.state === 'rest')).toHaveLength(4);
  expect(() => configureStreak(d, { weekdays: [1, 1] })).toThrow('Monday');
});
it('the latest manual target wins this week and does not change past saved requirements', () => {
  let d = calendarFixture();
  d.history = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map((date) => session(date));
  d = syncStreaks(d, noon('2026-11-13'));
  expect(calculateStreak(d, noon('2026-11-13')).current).toBe(1);
  d = configureStreak(d, { target: 5 }, noon('2026-11-13'));
  expect(calculateStreak(d, noon('2026-11-13')).currentWeek!.chosen).toMatchObject({
    completed: 4,
    goal: { target: 5 },
    success: false,
  });
  d.history.push(session('2026-11-15'));
  d = syncStreaks(d, noon('2026-11-15'));
  expect(calculateStreak(d, noon('2026-11-15')).current).toBe(1);
  d = syncStreaks(d, noon('2026-11-16'));
  const past = structuredClone(d.streak!.weeks[0]);
  d = configureStreak(d, { target: 2, weekdays: [0, 4] }, noon('2026-11-16'));
  expect(d.streak!.weeks[0]).toEqual(past);
});
it('pending current weeks retain the run until the Europe/Vienna week ends', () => {
  let d = streakFixture(3);
  fillWeek(d, '2026-10-26');
  fillWeek(d, '2026-11-02');
  d = syncStreaks(d, noon('2026-11-13'));
  expect(calculateStreak(d, noon('2026-11-15')).current).toBe(2);
  expect(calculateStreak(d, Date.parse('2026-11-15T22:59:59Z')).current).toBe(2);
  expect(calculateStreak(d, Date.parse('2026-11-15T23:00:00Z')).current).toBe(0);
});
for (const [sunday, before, after] of [
  ['2026-03-29', '2026-03-29T21:59:59Z', '2026-03-29T22:00:00Z'],
  ['2026-10-25', '2026-10-25T22:59:59Z', '2026-10-25T23:00:00Z'],
  ['2026-11-15', '2026-11-15T22:59:59Z', '2026-11-15T23:00:00Z'],
])
  it(`uses Vienna DST week boundaries after ${sunday}`, () => {
    let d = streakFixture(1);
    const w = session(sunday);
    w.finished = Date.parse(before);
    w.started = w.finished - 3600000;
    d.history = [w];
    d = syncStreaks(d, Date.parse(after));
    expect(d.streak!.timeZone).toBe('Europe/Vienna');
    const r = calculateStreak(d, Date.parse(after));
    expect(r.weeks.find((w) => w.status === 'success')).toBeDefined();
    expect(r.currentWeek!.chosen!.completed).toBe(0);
    expect(r.current).toBe(1);
    d.history.push({
      ...session(sunday),
      started: Date.parse(after) - 600000,
      finished: Date.parse(after),
    });
    expect(calculateStreak(d, Date.parse(after)).currentWeek!.chosen!.completed).toBe(1);
  });
it('recalculates historical names and dates before the original tracker first recognized template ownership', () => {
  let d = calendarFixture();
  d.history = ['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24'].map((date) => session(date));
  d = syncStreaks(d, noon('2026-11-10'));
  const r = calculateStreak(d, noon('2026-11-10'));
  expect(r.weeks.find((w) => w.week === '2026-10-19')!.chosen!.completed).toBe(4);
  expect(r.longest).toBe(1);
});
it('migrates legacy state atomically with one safety snapshot and leaves every history byte unchanged', async () => {
  const d = calendarFixture();
  delete d.streak!.rulesVersion;
  delete d.streak!.trainingDays;
  d.streak!.timeZone = 'UTC';
  d.history = ['2026-11-10', '2026-11-12', '2026-11-13'].map((date) => session(date));
  const before = JSON.stringify(d.history),
    name = crypto.randomUUID();
  await saveData(d, name);
  const migrated = await initializeStreaks(d, 'UTC', name, noon('2026-11-13'));
  expect(JSON.stringify(migrated.history)).toBe(before);
  expect(migrated.streak!.rulesVersion).toBe(2);
  expect(calculateStreak(migrated, noon('2026-11-13')).currentWeek!.chosen!.completed).toBe(3);
  const db = await openStore(name);
  expect((await db.getAll('backups'))[0]).toMatchObject({
    kind: 'before-training-day-streaks',
    data: d,
  });
  db.close();
  await initializeStreaks(migrated, 'UTC', name, noon('2026-11-13'));
  const again = await openStore(name);
  expect(await again.getAll('backups')).toHaveLength(1);
  again.close();
});
it('validates and merges weekday settings and preserves JSON compatibility', () => {
  let d = configureStreak(
    calendarFixture(),
    { target: 5, weekdays: [0, 1, 2, 3, 4] },
    noon('2026-11-10'),
  );
  const restored = mergeBackup(d, parseData(JSON.parse(JSON.stringify(d))));
  expect(restored.streak!.trainingDays).toEqual(d.streak!.trainingDays);
  const bad = structuredClone(d);
  bad.streak!.trainingDays![bad.activeProgramId!] = [9];
  expect(() => parseData(bad)).toThrow('weekday');
  expect(() => configureStreak(d, { timeZone: 'UTC' })).toThrow('Europe/Vienna');
  expect(STREAK_LEVELS.map((l) => l.weeks)).toEqual([0, 2, 4, 6, 8, 10, 12, 16, 24, 36, 52]);
});

it('rolls back the legacy migration and its snapshot if saving fails', async () => {
  const d = calendarFixture();
  delete d.streak!.rulesVersion;
  const name = crypto.randomUUID();
  await saveData(d, name);
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: any,
    key?: IDBValidKey,
  ) {
    if (this.name === 'state') throw Error('Simulated quota failure');
    return original.call(this, value, key!);
  });
  try {
    await expect(initializeStreaks(d, 'UTC', name, noon('2026-11-13'))).rejects.toThrow('quota');
  } finally {
    spy.mockRestore();
  }
  const db = await openStore(name);
  expect(await db.get('state', 'current')).toEqual(d);
  expect(await db.getAll('backups')).toEqual([]);
  db.close();
});

it('supports a seven-day target but can never earn more than seven date credits in a calendar week', () => {
  let d = configureStreak(
    calendarFixture(),
    { target: 7, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    noon('2026-11-15'),
  );
  for (let n = 9; n <= 15; n++) {
    const date = `2026-11-${n.toString().padStart(2, '0')}`;
    d.history.push(
      session(date),
      session(date, { name: 'Extra session', started: noon(date) - 7200000 }),
    );
  }
  const r = report(d);
  expect(r.currentWeek!.chosen!.completed).toBe(7);
  expect(r.current).toBe(1);
  expect(r.currentWeek!.chosen!.days.filter((d) => d.complete)).toHaveLength(7);
  expect(d.history).toHaveLength(14);
});

it('retains separate weekday/target overrides for conflicting restored program versions', () => {
  const original = configureStreak(
    calendarFixture(),
    { target: 2, weekdays: [0, 2] },
    noon('2026-11-10'),
  );
  let incoming = structuredClone(original);
  const p = currentProgram(incoming)!;
  p.name = 'Restored variant';
  p.program!.name = p.name;
  incoming.trainingProgram!.name = p.name;
  incoming = configureStreak(
    incoming,
    { target: 5, weekdays: [0, 1, 2, 3, 4] },
    noon('2026-11-10'),
  );
  const restored = mergeBackup(original, incoming);
  expect(restored.activeProgramId).not.toBe(original.activeProgramId);
  expect(restored.streak!.trainingDays![original.activeProgramId!]).toEqual([0, 2]);
  expect(restored.streak!.trainingDays![restored.activeProgramId!]).toEqual([0, 1, 2, 3, 4]);
  expect(restored.streak!.targets[restored.activeProgramId!]).toBe(5);
});

it('an explicit target works even when legacy plan ownership needs review', () => {
  const d = calendarFixture();
  currentProgram(d)!.review = 'Original plan needs review';
  d.history = [session('2026-11-10', { programId: undefined })];
  const configured = configureStreak(d, { target: 1 }, noon('2026-11-10'));
  expect(calculateStreak(configured, noon('2026-11-10')).currentWeek!.chosen!.completed).toBe(1);
  expect(calculateStreak(configured, noon('2026-11-10')).current).toBe(1);
});

it('does not merge distinct saved dates merely because legacy records share a start timestamp', () => {
  const d = calendarFixture();
  d.history = ['2026-11-10', '2026-11-12', '2026-11-13'].map((date) =>
    session(date, { started: 0 }),
  );
  expect(report(d).currentWeek!.chosen!.completed).toBe(3);
});

it('explicit training weekdays work for a program-level routine without inventing workout templates', () => {
  let d = calendarFixture();
  const p = currentProgram(d)!;
  p.program!.workouts = [];
  p.program!.rotation = null;
  p.templates = {};
  delete p.rotation;
  d.trainingProgram = structuredClone(p.program);
  delete d.rotation;
  d = configureStreak(d, { weekdays: [0, 2, 4] }, noon('2026-11-13'));
  expect(calculateStreak(d, noon('2026-11-13')).currentWeek!.chosen!.goal).toMatchObject({
    target: 3,
    weekdays: [0, 2, 4],
  });
  expect(currentProgram(d)!.program!.workouts).toEqual([]);
});
