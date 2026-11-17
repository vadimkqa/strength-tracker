import { expect, it } from 'vitest';
import { adjustWorkoutInput } from './workout-inputs';
import { createWorkout, emptyData } from './data';
const fixture = () => {
  const d = emptyData();
  const w = createWorkout('Tuesday · Bench focus', 'heavy', d.plan, 1000);
  w.exercises[0].sets[0].weight = '25.5';
  w.exercises[0].sets[0].reps = '8';
  return w;
};
it.each([
  [250, '25.75'],
  [-250, '25.25'],
  [500, '26'],
  [-500, '25'],
] as const)('applies %s grams only to the explicit target', (delta, value) => {
  const original = fixture(),
    w = structuredClone(original),
    e = w.exercises[0],
    s = e.sets[0];
  adjustWorkoutInput(w, e.id, s.id, delta);
  expect(s.weight).toBe(value);
  const expected = structuredClone(original);
  expected.exercises[0].sets[0].weight = value;
  expect(w).toEqual(expected);
  expect(original.exercises[0].sets[0].weight).toBe('25.5');
});
it('preserves controller/timing/state and 0.001 precision across repeated presses', () => {
  const w = fixture(),
    e = w.exercises[0],
    s = e.sets[0];
  s.weight = '0.125';
  const controller = structuredClone(w.controller);
  for (let i = 0; i < 12; i++) adjustWorkoutInput(w, e.id, s.id, 250);
  for (let i = 0; i < 6; i++) adjustWorkoutInput(w, e.id, s.id, -500);
  expect(s.weight).toBe('0.125');
  expect(w.controller).toEqual(controller);
  expect(s.reps).toBe('8');
  expect(s.done).toBe(false);
});
it('clamps at zero and does not complete a set', () => {
  const w = fixture(),
    e = w.exercises[0],
    s = e.sets[0];
  s.weight = '0.125';
  adjustWorkoutInput(w, e.id, s.id, -500);
  expect(s.weight).toBe('0');
  expect(s.done).toBe(false);
});
it('ignores missing/removed targets and invalid drafts without resetting a workout', () => {
  const w = fixture(),
    before = structuredClone(w);
  adjustWorkoutInput(w, 'missing', 'missing', 250);
  expect(w).toEqual(before);
  const e = w.exercises[0],
    s = e.sets[0];
  s.weight = '7.1234';
  adjustWorkoutInput(w, e.id, s.id, 250);
  expect(s.weight).toBe('7.1234');
  expect(w.controller).toEqual(before.controller);
});
it('keeps a valid completed set completed when its explicitly edited weight changes', () => {
  const w = fixture(),
    e = w.exercises[0],
    s = e.sets[0];
  s.done = true;
  adjustWorkoutInput(w, e.id, s.id, 250);
  expect(s.done).toBe(true);
  expect(s.weight).toBe('25.75');
});
