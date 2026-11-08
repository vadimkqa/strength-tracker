import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { createWorkout, emptyData, saveData, loadData } from './data';
import { startSet, stopSet, skipSet, findSet, ensureController } from './controller';
import {
  cardExpanded,
  exerciseComplete,
  syncExerciseCards,
  toggleExerciseCard,
} from './exercise-cards';
import { avoidFocusedInput } from './TimerBubble';
const fixture = () =>
  createWorkout(
    'test',
    'heavy',
    {
      test: [
        ['Bench', 2, 90],
        ['Dip', 1, 180],
        ['Optional', 1, null],
      ],
    },
    1000,
  );
function complete(w: ReturnType<typeof fixture>, index = 0) {
  w.exercises[index].sets.forEach((s) => Object.assign(s, { weight: '60', reps: '8', done: true }));
  return w;
}
it('opens the selected exercise by default without rewriting existing workout data', () => {
  const w = fixture(),
    before = structuredClone(w);
  expect(cardExpanded(w, w.exercises[0])).toBe(true);
  expect(cardExpanded(w, w.exercises[1])).toBe(false);
  expect(w).toEqual(before);
});
it('collapses a newly completed exercise and expands the next selected exercise', () => {
  const before = fixture(),
    after = complete(structuredClone(before));
  after.controller!.selected = {
    exerciseId: after.exercises[1].id,
    setId: after.exercises[1].sets[0].id!,
  };
  syncExerciseCards(before, after);
  expect(cardExpanded(after, after.exercises[0])).toBe(false);
  expect(cardExpanded(after, after.exercises[1])).toBe(true);
  expect(exerciseComplete(after, after.exercises[0])).toBe(true);
});
it('skipped sets and skipped exercises never get successful completion status', () => {
  const w = complete(fixture());
  w.exercises[0].sets[1].skipped = true;
  expect(exerciseComplete(w, w.exercises[0])).toBe(false);
  w.exercises[0].sets[1].skipped = false;
  w.exercises[0].skipped = true;
  expect(exerciseComplete(w, w.exercises[0])).toBe(false);
  const before = fixture(),
    after = structuredClone(before);
  skipSet(after, {
    exerciseId: before.exercises[0].id,
    setId: before.exercises[0].sets[0].id!,
  });
  syncExerciseCards(before, after);
  expect(cardExpanded(after, after.exercises[0])).toBe(true);
});
it('never auto-collapses running sets or unresolved logging, including invalid edited completed values', () => {
  const before = fixture(),
    w = complete(structuredClone(before));
  w.controller!.running = { exerciseId: w.exercises[0].id, setId: w.exercises[0].sets[0].id! };
  w.controller!.phase = 'set';
  syncExerciseCards(before, w);
  expect(cardExpanded(w, w.exercises[0])).toBe(true);
  expect(exerciseComplete(w, w.exercises[0])).toBe(false);
  w.controller!.running = null;
  w.controller!.phase = 'rest';
  w.exercises[0].sets[1].needsLogging = true;
  expect(exerciseComplete(w, w.exercises[0])).toBe(false);
  w.exercises[0].sets[1].needsLogging = false;
  w.exercises[0].sets[1].reps = '';
  expect(exerciseComplete(w, w.exercises[0])).toBe(false);
});
it('defers completion collapse while a field is being edited, then closes on blur', () => {
  const before = fixture(),
    after = complete(structuredClone(before));
  syncExerciseCards(before, after, after.exercises[0].id);
  expect(cardExpanded(after, after.exercises[0])).toBe(true);
  expect(after.controller!.pendingCardCollapse).toEqual([after.exercises[0].id]);
  const blurred = syncExerciseCards(after, structuredClone(after));
  expect(cardExpanded(blurred, blurred.exercises[0])).toBe(false);
});
it('manual reopening of completed cards survives subsequent edits and controller updates', () => {
  let w = fixture();
  w = syncExerciseCards(w, complete(structuredClone(w)));
  toggleExerciseCard(w, w.exercises[0].id);
  const after = structuredClone(w);
  after.exercises[0].sets[0].weight = '65';
  syncExerciseCards(w, after);
  expect(cardExpanded(after, after.exercises[0])).toBe(true);
  expect(after.exercises[0].sets[0].done).toBe(true);
});
it('manual collapse stays respected while the current set is running', () => {
  const before = fixture(),
    running = startSet(before, 5000);
  syncExerciseCards(before, running);
  toggleExerciseCard(running, running.exercises[0].id);
  const after = syncExerciseCards(running, structuredClone(running));
  expect(cardExpanded(after, after.exercises[0])).toBe(false);
  expect(after.controller!.running).toEqual(running.controller!.running);
});
it('card state follows stable IDs after exercise reordering and new exercises open independently', () => {
  const before = fixture();
  toggleExerciseCard(before, before.exercises[1].id);
  const after = structuredClone(before);
  after.exercises.reverse();
  const newEx = { ...structuredClone(before.exercises[1]), id: 'new-exercise' };
  after.exercises.push(newEx);
  syncExerciseCards(before, after);
  expect(
    cardExpanded(
      after,
      after.exercises.find((e) => e.id === before.exercises[1].id)!,
    ),
  ).toBe(true);
  expect(cardExpanded(after, newEx)).toBe(true);
});
it('persists manual expansion, running timings and recorded values through reload without changing history', async () => {
  let w = fixture();
  const s = findSet(w, w.controller!.selected)!;
  s.weight = '80';
  s.reps = '8';
  const before = structuredClone(w);
  w = syncExerciseCards(before, startSet(w, 5000));
  toggleExerciseCard(w, w.exercises[1].id);
  expect(cardExpanded(w, w.exercises[1])).toBe(true);
  const db = crypto.randomUUID(),
    data = { ...emptyData(), active: w };
  await saveData(data, db);
  const restored = await loadData({ getItem: () => null }, db);
  expect(restored.active).toEqual(w);
  const stopped = stopSet(restored.active!, 605000);
  expect(stopped.exercises[0].sets[0].timing!.durationMs).toBe(600000);
  expect(restored.history).toEqual([]);
});
it('legacy missing exercise/set IDs are repaired once and performance values remain intact', () => {
  const w = fixture();
  delete (w.exercises[0] as any).id;
  delete w.exercises[0].sets[0].id;
  delete w.controller;
  const fixed = ensureController(w);
  expect(fixed.exercises[0].id).toBeTruthy();
  expect(fixed.exercises[0].sets[0].id).toBeTruthy();
  expect(ensureController(fixed)).toEqual(fixed);
  expect(fixed.exercises[0].sets[0].weight).toBe(w.exercises[0].sets[0].weight);
});
it('temporarily moves the timer away from the focused input without changing the saved drag position', () => {
  const point = { left: 200, top: 150 },
    before = { ...point },
    bounds = { left: 8, top: 8, width: 280, height: 230 },
    focus = { left: 190, right: 300, top: 140, bottom: 190 };
  const moved = avoidFocusedInput(point, bounds, 76, focus);
  expect(
    moved.left + 76 <= focus.left - 8 ||
      moved.left >= focus.right + 8 ||
      moved.top + 76 <= focus.top - 8 ||
      moved.top >= focus.bottom + 8,
  ).toBe(true);
  expect(point).toEqual(before);
  expect(avoidFocusedInput(point, bounds, 76, null)).toEqual(point);
});
