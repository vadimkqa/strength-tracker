import { it, expect } from 'vitest';
import { createWorkout } from './data';
import { startSet, selectSet } from './controller';
import { removeLiveSet } from './live-sets';
const fixture = () =>
  createWorkout(
    'test',
    'heavy',
    {
      test: [
        ['Press', 2, 90],
        ['Row', 2, null],
      ],
    },
    1000,
  );
it('removes only the final pending set by ID without changing other records or history inputs', () => {
  const w = fixture(),
    before = structuredClone(w),
    next = removeLiveSet(w, w.exercises[0].id, false, 5000);
  expect(next.exercises[0].sets).toEqual(before.exercises[0].sets.slice(0, 1));
  expect(next.exercises[1]).toEqual(before.exercises[1]);
  expect(w).toEqual(before);
});
it('requires confirmation for completed, unresolved and running sets', () => {
  const w = fixture(),
    e = w.exercises[0];
  e.sets[1].done = true;
  e.sets[1].weight = '80';
  e.sets[1].reps = '6';
  expect(() => removeLiveSet(w, e.id, false)).toThrow('Confirm');
  const next = removeLiveSet(w, e.id, true, 8000);
  expect(next.controller!.removedSets![0].set).toEqual(e.sets[1]);
  e.sets[1].done = false;
  e.sets[1].needsLogging = true;
  expect(() => removeLiveSet(w, e.id, false)).toThrow('Confirm');
});
it('confirmed active removal stops the exact set, saves its timing, starts rest and preserves next selection through reload', () => {
  let w = fixture();
  const e = w.exercises[0];
  selectSet(w, { exerciseId: e.id, setId: e.sets[1].id! });
  w = startSet(w, 5000);
  w.exercises[0].sets[1].weight = '60';
  w.exercises[0].sets[1].reps = '8';
  expect(() => removeLiveSet(w, e.id, false, 15000)).toThrow('Confirm');
  const next = removeLiveSet(w, e.id, true, 15000),
    saved = JSON.parse(JSON.stringify(next));
  expect(saved.controller.phase).toBe('rest');
  expect(saved.controller.running).toBeNull();
  expect(saved.controller.selected.exerciseId).toBe(w.exercises[1].id);
  expect(saved.controller.removedSets[0].set.timing.durationMs).toBe(10000);
  expect(saved.controller.removedSets[0].set.weight).toBe('60');
  expect(w.controller!.phase).toBe('set');
});
it('retains the last remaining set and refuses removal during the double-tap guard', () => {
  let w = fixture();
  w.exercises[0].sets.pop();
  expect(removeLiveSet(w, w.exercises[0].id, true).exercises[0].sets).toHaveLength(1);
  w = fixture();
  selectSet(w, { exerciseId: w.exercises[0].id, setId: w.exercises[0].sets[1].id! });
  w = startSet(w, 5000);
  expect(() => removeLiveSet(w, w.exercises[0].id, true, 5100)).toThrow('Wait');
  expect(w.controller!.running).toBeTruthy();
});
