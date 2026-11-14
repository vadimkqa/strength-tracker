import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { cardFixture } from '../tests/exercise-fixture';
import { createWorkout, saveData, loadData, finishWorkout } from './data';
import { startSet, stopSet, skipSet, findSet, positions } from './controller';
import { reorderExercises } from './reorder-exercises';
import { cardExpanded } from './exercise-cards';
function fixture() {
  const d = cardFixture();
  d.active = createWorkout(d.trainingProgram!.workouts[0].id, 'heavy', d.plan, 1000, d.history);
  return d;
}
it('reorders by stable ID without changing logs, references, timestamps, selection, plans or history', () => {
  const d = fixture(),
    w = d.active!,
    before = structuredClone(d),
    [a, b, c] = w.exercises;
  a.sets[0].weight = '72.5';
  a.sets[0].reps = '9';
  a.sets[0].done = true;
  w.controller!.bubblePosition = { x: 0.3, y: 0.6 };
  w.controller!.exerciseCards = { [a.id]: true, [b.id]: false, [c.id]: true };
  const beforeWork = structuredClone(w),
    after = reorderExercises(w, c.id, a.id);
  expect(after.exercises.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
  expect(after.exercises).toEqual([
    beforeWork.exercises[2],
    beforeWork.exercises[0],
    beforeWork.exercises[1],
  ]);
  expect(after.controller).toEqual(beforeWork.controller);
  expect(w).toEqual(beforeWork);
  expect(d.plan).toEqual(before.plan);
  expect(d.history).toEqual(before.history);
  expect(d.trainingProgram).toEqual(before.trainingProgram);
});
it('reorders completed exercises while preserving explicit/default expanded states', () => {
  const w = fixture().active!,
    [a, b, c] = w.exercises;
  c.sets.forEach((s) => Object.assign(s, { done: true, weight: '10', reps: '15' }));
  const expanded = new Map(w.exercises.map((e) => [e.id, cardExpanded(w, e)]));
  const after = reorderExercises(w, c.id, a.id);
  for (const e of after.exercises) expect(cardExpanded(after, e)).toBe(expanded.get(e.id));
  expect(after.exercises[0].sets.every((s) => s.done)).toBe(true);
});
it('keeps a running set intact and chooses the next unfinished exercise from the new order', () => {
  let w = fixture().active!,
    [a, b, c] = w.exercises;
  a.sets.forEach((s) => Object.assign(s, { weight: '50', reps: '8' }));
  w = startSet(w, 2000);
  const running = structuredClone(w.controller!);
  w = reorderExercises(w, c.id, b.id);
  expect({ ...w.controller, exerciseCards: undefined }).toEqual({
    ...running,
    exerciseCards: undefined,
  });
  w = stopSet(w, 12000);
  expect(w.controller!.selected!.exerciseId).toBe(a.id);
  w = startSet(w, 15000);
  w = stopSet(w, 25000);
  expect(w.controller!.selected!.exerciseId).toBe(c.id);
  expect(w.exercises.find((e) => e.id === a.id)!.sets[0].timing).toEqual({
    started: 2000,
    ended: 12000,
    durationMs: 10000,
  });
});
it('does not complete pending logging or revive skipped records when sorting', () => {
  const w = fixture().active!,
    [a, b, c] = w.exercises;
  a.sets[0].needsLogging = true;
  a.sets[0].weight = '50';
  a.sets[0].reps = '8';
  a.sets[0].done = false;
  b.skipped = true;
  b.sets.forEach((s) => (s.skipped = true));
  const after = reorderExercises(w, b.id, a.id);
  expect(after.exercises.find((e) => e.id === a.id)!.sets[0]).toEqual(a.sets[0]);
  expect(after.exercises.find((e) => e.id === b.id)).toEqual(b);
  expect(after.controller!.phaseStarted).toBe(w.controller!.phaseStarted);
});
it('no-op, missing IDs and cancelled/no-movement drops cannot alter session state', () => {
  const w = fixture().active!,
    a = w.exercises[0];
  expect(reorderExercises(w, a.id, a.id)).toBe(w);
  expect(reorderExercises(w, 'missing', a.id)).toBe(w);
  expect(reorderExercises(w, a.id, 'removed')).toBe(w);
});
it('persists reordered sessions and running timestamps through reload and finished history', async () => {
  let d = fixture();
  d.active = startSet(d.active!, 2000);
  const [a, b, c] = d.active.exercises;
  d.active = reorderExercises(d.active, c.id, a.id);
  const name = crypto.randomUUID();
  await saveData(d, name);
  const restored = await loadData({ getItem: () => null }, name);
  expect(restored.active).toEqual(d.active);
  expect(restored.plan).toEqual(d.plan);
  expect(restored.history).toEqual(d.history);
  restored.active = stopSet(restored.active!, 12000);
  // Sorting itself never finishes a workout; the normal explicit finish action stores the chosen order.
  restored.active.exercises.forEach((e) =>
    e.sets.forEach((s) => {
      s.needsLogging = false;
      s.done = true;
      s.weight = '40';
      s.reps = '8';
    }),
  );
  const done = finishWorkout(restored, 15000);
  expect(done.history[0].exercises.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
  expect(done.history.slice(1)).toEqual(d.history);
});
it('skipping after reordering follows remaining exercise order and stops when all sets are resolved', () => {
  let w = fixture().active!,
    [a, b, c] = w.exercises;
  w = reorderExercises(w, c.id, a.id);
  skipSet(w, w.controller!.selected!);
  skipSet(w, w.controller!.selected!);
  expect(w.controller!.selected!.exerciseId).toBe(b.id);
  skipSet(w, w.controller!.selected!);
  skipSet(w, w.controller!.selected!);
  expect(w.controller!.selected!.exerciseId).toBe(c.id);
  for (const e of w.exercises)
    for (const s of e.sets) if (!s.skipped) skipSet(w, { exerciseId: e.id, setId: s.id! });
  expect(positions(w)).toEqual([]);
  expect(w.controller!.selected).toBeNull();
});
