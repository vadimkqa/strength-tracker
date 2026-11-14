import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import { createWorkout, saveData, loadData, type Workout } from './data';
import { cardFixture } from '../tests/exercise-fixture';
import { streakData } from '../tests/streak-fixture';
import { saveWorkoutCompletion, workoutCompletion } from './workout-completion';
import { personalRecords, sessionRecords, workoutStatistics } from './workout-results';
import { configureStreak, calculateStreak } from './streak';
import { startSet, stopSet } from './controller';

const at = Date.parse('2026-11-11T12:00:00Z');
function fixture() {
  let d = cardFixture();
  const old = d.history[0];
  old.started = at - 86400000 - 3600000;
  old.finished = at - 86400000;
  d = configureStreak(d, { target: 4 }, at);
  d.active = createWorkout(
    d.trainingProgram!.workouts[0].id,
    'heavy',
    d.plan,
    at - 2700000,
    d.history,
    { displayName: 'Upper Body Push', cycleWeek: 1 },
  );
  d.active.exercises[0].sets.forEach((s) =>
    Object.assign(s, { weight: '65', reps: '8', done: true }),
  );
  return d;
}
it('uses valid actual logs for sets/volume and existing all-sets completion semantics, with zero kg bodyweight', () => {
  const w = fixture().active!,
    e = w.exercises[0];
  e.sets.push({ id: 'bodyweight', done: true, weight: '0', reps: '12' });
  w.exercises[1].sets[0] = { id: 'fractional', done: true, weight: '12.5', reps: '10' };
  w.exercises[1].sets[1] = { id: 'skip', done: true, skipped: true, weight: '100', reps: '10' };
  w.exercises[2].sets[0] = {
    id: 'unresolved',
    done: true,
    needsLogging: true,
    weight: '20',
    reps: '5',
  };
  w.finished = at;
  expect(workoutStatistics(w)).toEqual({ sets: 4, exercises: 1, volume: 1165, duration: 2700000 });
  e.sets.push(
    { done: true, weight: '', reps: '5' },
    { done: true, weight: 'Infinity', reps: '5' },
    { done: false, weight: '200', reps: '1' },
    { done: true, weight: '-10', reps: '5' },
  );
  expect(workoutStatistics(w).volume).toBe(1165);
  w.exercises[1].skipped = true;
  // Skipping the remaining exercise must not erase a set already logged.
  expect(workoutStatistics(w).volume).toBe(1165);
  w.exercises[1].sets[0].skipped = true;
  expect(workoutStatistics(w).volume).toBe(1040);
});
it('shares highest weight/then reps PR comparison; no baseline, tied or unrelated-name PRs', () => {
  const d = fixture(),
    w = { ...d.active!, finished: at };
  expect(sessionRecords(w, d.history)).toMatchObject([
    { name: 'Bench Press', weight: 65, reps: 8, previous: { weight: 60, reps: 8 } },
  ]);
  expect(sessionRecords(w, [])).toEqual([]);
  w.exercises[0].name = 'Incline Bench Press';
  expect(sessionRecords(w, d.history)).toEqual([]);
  w.exercises[0].name = 'Bench Press';
  w.exercises[0].sets.forEach((s) => Object.assign(s, { weight: '60', reps: '8' }));
  expect(sessionRecords(w, d.history)).toEqual([]);
  w.exercises[0].sets[1].reps = '9';
  expect(sessionRecords(w, d.history)).toHaveLength(1);
  w.exercises[0].sets[0].weight = '55';
  w.exercises[0].sets[0].reps = '99';
  expect(personalRecords([w]).get('Bench Press')).toEqual({ weight: 60, reps: 9 });
});
it('does not return a success receipt before a write commits, or mutate active data while waiting', async () => {
  const d = fixture(),
    before = structuredClone(d);
  let release!: () => void;
  const persist = vi.fn(() => new Promise<void>((r) => (release = r)));
  let resolved = false;
  const pending = saveWorkoutCompletion(d, d.active!.id, at, persist).then((next) => {
    resolved = true;
    return next;
  });
  expect(resolved).toBe(false);
  expect(d).toEqual(before);
  expect(workoutCompletion(d, d.active!.id, at)).toBeNull();
  release();
  const saved = await pending;
  expect(saved.active).toBeNull();
  expect(saved.history).toHaveLength(2);
  expect(saved.history[0].exercises).toEqual(before.active!.exercises);
  expect(saved.history[0].finished).toBe(at);
  expect(d).toEqual(before);
  expect(workoutCompletion(saved, before.active!.id, at)?.duration).toBe(2700000);
});
it('failed writes preserve the session, retry once with the same ID/time, and reopening cannot duplicate records', async () => {
  const d = fixture(),
    snapshot = structuredClone(d),
    write = vi.fn().mockRejectedValueOnce(Error('disk full')).mockResolvedValue(undefined);
  await expect(saveWorkoutCompletion(d, d.active!.id, at, write)).rejects.toThrow('disk full');
  expect(d).toEqual(snapshot);
  const saved = await saveWorkoutCompletion(d, d.active!.id, at, write);
  expect(await saveWorkoutCompletion(saved, d.active!.id, at + 1000, write)).toBe(saved);
  expect(write).toHaveBeenCalledTimes(2);
  expect(workoutCompletion(saved, d.active!.id, at)).toEqual(
    workoutCompletion(saved, d.active!.id, at),
  );
  expect(saved.history.map((w) => w.id)).toEqual([d.active!.id, d.history[0].id]);
});
it('refuses a stale ID or a running/unresolved set rather than losing timing/logging', async () => {
  const d = fixture(),
    persist = vi.fn();
  await expect(saveWorkoutCompletion(d, 'another-session', at, persist)).rejects.toThrow('changed');
  d.active!.exercises[0].sets[0].done = false;
  d.active = startSet(d.active!, at - 10000);
  await expect(saveWorkoutCompletion(d, d.active!.id, at, persist)).rejects.toThrow('Stop');
  expect(persist).not.toHaveBeenCalled();
});
it('summary excludes future performance and preserves original history on historical review', async () => {
  const d = fixture(),
    saved = await saveWorkoutCompletion(d, d.active!.id, at, async () => {}),
    snapshot = structuredClone(saved);
  const future = structuredClone(saved.history[0]);
  future.id = 'future';
  future.finished = at + 86400000;
  future.exercises[0].sets.forEach((s) => Object.assign(s, { weight: '100', reps: '10' }));
  const summary = workoutCompletion(
    { ...saved, history: [future, ...saved.history] },
    d.active!.id,
    at + 86400000,
  )!;
  expect(summary.records).toHaveLength(1);
  expect(summary.records[0].weight).toBe(65);
  expect(summary.streak.completed).toBe(2);
  expect(saved).toEqual(snapshot);
});
it('uses the existing weekly engine for credit, including modified/skipped exercises, without double daily credit', async () => {
  const d = fixture();
  d.active!.exercises.forEach((e) => {
    e.name = 'Different exercise';
    e.skipped = true;
    e.sets.forEach((s) => {
      s.done = false;
      s.skipped = true;
    });
  });
  const saved = await saveWorkoutCompletion(d, d.active!.id, at, async () => {}),
    r = workoutCompletion(saved, d.active!.id, at)!;
  expect(r.sets).toBe(0);
  expect(r.streak.completed).toBe(calculateStreak(saved, at).currentWeek!.chosen!.completed);
  expect(r.streak.contributed).toBe(true);
  expect(r.streak.completed).toBe(2);
  const duplicate = {
    ...structuredClone(saved.history[0]),
    id: 'second-session',
    started: at + 1000,
    finished: at + 2000,
  };
  const again = { ...saved, history: [duplicate, ...saved.history] };
  expect(workoutCompletion(again, duplicate.id, at + 3000)!.streak.contributed).toBe(false);
  expect(workoutCompletion(again, duplicate.id, at + 3000)!.streak.message).toContain(
    'counted once',
  );
  duplicate.streakExcluded = true;
  expect(workoutCompletion(again, duplicate.id, at + 3000)!.streak.message).toContain('Excluded');
});
for (const prior of [1, 51])
  it(`reuses milestone thresholds, with secret only at 52 qualifying weeks (prior ${prior})`, async () => {
    const d = streakData(prior),
      w = createWorkout(d.trainingProgram!.workouts[2].id, 'heavy', d.plan, at - 3600000);
    d.active = w;
    const saved = await saveWorkoutCompletion(d, w.id, at, async () => {}),
      summary = workoutCompletion(saved, w.id, at)!;
    expect(summary.streak.current).toBe(prior + 1);
    expect(summary.streak.weeklyUnlocked).toBe(true);
    expect(summary.streak.achievements.map((l) => l.id)).toContain(
      prior === 1 ? 'first-plates' : 'crystal',
    );
    expect(summary.streak.secret).toBe(prior === 51);
  });
it('keeps summary available through IndexedDB reload and JSON restoration without another completion', async () => {
  const d = fixture(),
    saved = await saveWorkoutCompletion(d, d.active!.id, at, async () => {}),
    name = crypto.randomUUID();
  await saveData(JSON.parse(JSON.stringify(saved)), name);
  const restored = await loadData({ getItem: () => null }, name);
  expect(restored.history).toEqual(saved.history);
  expect(workoutCompletion(restored, d.active!.id, at)).toEqual(
    workoutCompletion(saved, d.active!.id, at),
  );
  expect(
    await saveWorkoutCompletion(restored, d.active!.id, at + 1000, async () => {
      throw Error('unexpected save');
    }),
  ).toBe(restored);
});

it('failed completion and retry retain set timing and append the final rest interval only once', async () => {
  const d = fixture();
  d.active!.exercises[0].sets[0].done = false;
  d.active = startSet(d.active!, at - 120000);
  d.active = stopSet(d.active, at - 60000);
  const active = structuredClone(d.active),
    write = vi
      .fn()
      .mockRejectedValueOnce(Error('offline storage failure'))
      .mockResolvedValue(undefined);
  await expect(saveWorkoutCompletion(d, d.active.id, at, write)).rejects.toThrow('failure');
  expect(d.active).toEqual(active);
  const saved = await saveWorkoutCompletion(d, d.active.id, at, write);
  expect(saved.history[0].controller!.rests).toHaveLength(1);
  expect(saved.history[0].controller!.rests[0].durationMs).toBe(60000);
  expect(saved.history[0].exercises[0].sets[0].timing!.durationMs).toBe(60000);
  expect(saved.history[0].exercises).toEqual(active.exercises);
  await saveWorkoutCompletion(saved, active.id, at + 3000, write);
  expect(write).toHaveBeenCalledTimes(2);
});
