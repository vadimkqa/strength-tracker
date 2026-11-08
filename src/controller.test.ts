import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { createWorkout, finishWorkout, emptyData, saveData, loadData, newSet } from './data';
import {
  startSet,
  stopSet,
  findSet,
  ensureController,
  finalizeLogging,
  skipSet,
  selectSet,
  stopwatch,
  reconcile,
} from './controller';
function workout() {
  return createWorkout(
    'test',
    'heavy',
    {
      test: [
        ['First', 2, null],
        ['Optional', 1, 90],
      ],
    },
    1000,
  );
}
function valid(w: ReturnType<typeof workout>) {
  const s = findSet(w, w.controller!.selected)!;
  s.weight = '100';
  s.reps = '8';
  return w;
}
it('starts an upward warmup with the overall workout and never a countdown', () => {
  const w = workout();
  expect(w.controller).toMatchObject({ phase: 'warmup', phaseStarted: 1000 });
  expect(stopwatch(65000)).toBe('01:05');
  expect(w.restEnd).toBeNull();
});
it('completes warmup, sets, indefinite rest, next exercise and final finish without wrap', () => {
  let w = valid(workout());
  w = startSet(w, 5000);
  w = stopSet(w, 15000);
  expect(w.exercises[0].sets[0].timing?.durationMs).toBe(10000);
  expect(w.controller!.phase).toBe('rest');
  expect(w.controller!.selected!.setId).toBe(w.exercises[0].sets[1].id);
  valid(w);
  w = startSet(w, 315000);
  expect(w.controller!.rests[0].durationMs).toBe(300000);
  w = stopSet(w, 320000);
  expect(w.controller!.selected!.exerciseId).toBe(w.exercises[1].id);
  valid(w);
  w = startSet(w, 330000);
  w = stopSet(w, 340000);
  expect(w.controller!.selected).toBeNull();
  expect(ensureController(w).controller!.selected).toBeNull();
  const d = emptyData();
  d.active = w;
  const finished = finishWorkout(d, 350000);
  expect(finished.history).toHaveLength(1);
  expect(finished.history[0].controller!.rests.at(-1)!.durationMs).toBe(10000);
  expect(finishWorkout(finished).history).toHaveLength(1);
});
it('missing data preserves stop timing and starts rest; later edits finalize exactly once', () => {
  let w = startSet(workout(), 5000);
  w = stopSet(w, 15000);
  const set = w.exercises[0].sets[0];
  expect(set.done).toBe(false);
  expect(set.needsLogging).toBe(true);
  expect(w.controller!.phaseStarted).toBe(15000);
  expect(() => finishWorkout({ ...emptyData(), active: w })).toThrow('logging');
  set.weight = '0';
  set.reps = '12';
  finalizeLogging(w);
  finalizeLogging(w);
  expect(set.done).toBe(true);
  expect(set.timing).toEqual({ started: 5000, ended: 15000, durationMs: 10000 });
});
it('double actions do not create repeated timings, rests or starts', () => {
  let w = startSet(valid(workout()), 5000);
  expect(stopSet(w, 5100).controller!.phase).toBe('set');
  w = stopSet(w, 15000);
  expect(stopSet(w, 16000)).toEqual(w);
  expect(startSet(w, 15100)).toEqual(w);
  w = startSet(valid(w), 17000);
  expect(startSet(w, 18000).controller!.rests).toHaveLength(1);
});
it('timestamps and running position survive reload and a long background interval', async () => {
  let w = startSet(valid(workout()), 5000);
  const db = crypto.randomUUID();
  const d = { ...emptyData(), active: w };
  await saveData(d, db);
  const loaded = await loadData({ getItem: () => null }, db);
  w = stopSet(loaded.active!, 605000);
  expect(w.exercises[0].sets[0].timing!.durationMs).toBe(600000);
  expect(stopwatch(905000 - w.controller!.phaseStarted)).toBe('05:00');
  expect(d.history).toEqual([]);
});
it('manual navigation does not change a running set or erase completed values', () => {
  let w = startSet(valid(workout()), 5000);
  const running = w.controller!.running;
  selectSet(w, { exerciseId: w.exercises[1].id, setId: w.exercises[1].sets[0].id! });
  expect(w.controller!.running).toEqual(running);
  w = stopSet(w, 15000);
  selectSet(w, { exerciseId: w.exercises[0].id, setId: w.exercises[0].sets[0].id! });
  expect(ensureController(w).controller!.selected!.setId).toBe(w.exercises[0].sets[0].id);
  expect(w.exercises[0].sets[0].weight).toBe('100');
});
it('skipped sets advance and optional exercises remain selectable', () => {
  const w = workout();
  w.exercises[1].optional = true;
  skipSet(w, w.controller!.selected!);
  expect(w.controller!.selected!.setId).toBe(w.exercises[0].sets[1].id);
  skipSet(w, w.controller!.selected!);
  expect(w.controller!.selected!.exerciseId).toBe(w.exercises[1].id);
});
it('added/removed sets retain stable identities and active-set removal is rejected', () => {
  let w = startSet(workout(), 5000);
  w.exercises[0].sets.shift();
  expect(() => reconcile(w)).toThrow('Stop');
  w = workout();
  w.exercises[0].sets.push(newSet());
  w = ensureController(w);
  expect(w.exercises[0].sets.at(-1)!.id).toBeTruthy();
  const before = w.exercises[0].sets[0].id;
  w.exercises[0].sets.pop();
  expect(ensureController(w).exercises[0].sets[0].id).toBe(before);
});
it('legacy active sessions resume without replacing data or starting an old countdown', () => {
  const w = workout();
  delete w.controller;
  w.restEnd = 9999999;
  w.exercises[0].sets[0].weight = '72';
  const next = ensureController(w);
  expect(next.exercises[0].sets[0].weight).toBe('72');
  expect(next.controller!.phase).toBe('warmup');
  expect(w.controller).toBeUndefined();
});
